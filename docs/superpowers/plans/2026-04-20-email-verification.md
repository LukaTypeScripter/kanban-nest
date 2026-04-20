# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent users from acting as identities they don't own by requiring email verification before issuing auth tokens for local accounts.

**Architecture:** A signed-URL token (32 random bytes, SHA-256 hashed in DB) is emailed on registration. Login is gated until the link is clicked, which verifies the email and issues the first auth tokens. Google OAuth users are auto-verified. A new `EmailVerifiedGuard` enforces the `emailVerified` claim embedded in JWTs for sensitive routes.

**Tech Stack:** NestJS 11, Drizzle ORM 0.45, nodemailer (new install), bcrypt, crypto (built-in), Zod, @nestjs/throttler

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/schema.ts` | Add `emailVerified` column + `email_verifications` table |
| Install | `nodemailer` + `@types/nodemailer` | SMTP transport |
| Create | `src/feature/email/email.service.ts` | Wraps nodemailer, exposes `sendVerificationEmail` |
| Create | `src/feature/email/email.service.spec.ts` | Unit test for EmailService |
| Create | `src/feature/email/email.module.ts` | Declares + exports EmailService |
| Create | `src/feature/auth/repositories/email-verifications.repository.ts` | DB operations for `email_verifications` table |
| Modify | `src/feature/auth/schemas/jwt-payload.schema.ts` | Add `emailVerified: boolean` to AccessTokenPayloadSchema |
| Modify | `src/feature/auth/strategies/jwt-strategy/jwt.strategy.ts` | Return `emailVerified` from `validate()` |
| Modify | `src/feature/auth/strategies/jwt-strategy/jwt.strategy.spec.ts` | Update tests for new `emailVerified` field |
| Modify | `src/feature/auth/schemas/users.schema.ts` | Add `emailVerified?: boolean` |
| Modify | `src/feature/users/users.repository.ts` | Add `setEmailVerified(userId)` method |
| Create | `src/feature/auth/schemas/verify-email.schema.ts` | Zod schema for POST /auth/verify-email body |
| Create | `src/feature/auth/schemas/resend-verification.schema.ts` | Zod schema for POST /auth/resend-verification body |
| Create | `src/feature/auth/guards/email-verified.guard.ts` | Guard that checks `req.user.emailVerified` |
| Create | `src/feature/auth/guards/email-verified.guard.spec.ts` | Unit test for guard |
| Modify | `src/feature/auth/auth.service.ts` | Core logic changes + two new methods |
| Modify | `src/feature/auth/auth.service.spec.ts` | Update + extend tests |
| Modify | `src/feature/auth/auth.controller.ts` | Add two new endpoints |
| Modify | `src/feature/auth/auth.module.ts` | Import EmailModule, register new providers |

---

## Task 1: Update DB Schema and Run Migration

**Files:**
- Modify: `src/schema.ts`
- Run: `npm run db:generate` then `npm run db:migrate`

- [ ] **Step 1: Add `emailVerified` column and `email_verifications` table to schema**

Replace the contents of `src/schema.ts` with:

```ts
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  avatar: text('avatar'),
  name: text('name').notNull(),
  password: text('password'),
  provider: text('provider').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const refresh_tokens = pgTable(
  'refresh_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    token: text('token').notNull(),
    jti: text('jti').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [uniqueIndex('refresh_tokens_jti_idx').on(t.jti)],
);

export const email_verifications = pgTable('email_verifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
```

- [ ] **Step 2: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: two new files appear in `drizzle/` — a `.sql` migration and updated snapshot. Migration applies with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/schema.ts drizzle/
git commit -m "feat(schema): add emailVerified column and email_verifications table"
```

---

## Task 2: Install Nodemailer and Create EmailModule

**Files:**
- Create: `src/feature/email/email.service.ts`
- Create: `src/feature/email/email.service.spec.ts`
- Create: `src/feature/email/email.module.ts`

- [ ] **Step 1: Write the failing test**

Create `src/feature/email/email.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');
const nodemailerMock = nodemailer as jest.Mocked<typeof nodemailer>;

describe('EmailService', () => {
  let service: EmailService;
  const sendMailMock = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    nodemailerMock.createTransport.mockReturnValue({
      sendMail: sendMailMock,
    } as never);

    const module = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => `test-${key}`),
          },
        },
      ],
    }).compile();

    service = module.get(EmailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls sendMail with correct to and subject', async () => {
    await service.sendVerificationEmail('user@example.com', 'raw-token-abc');

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Verify your email',
      }),
    );
  });

  it('includes the raw token in both text and html body', async () => {
    await service.sendVerificationEmail('user@example.com', 'raw-token-abc');

    const call = sendMailMock.mock.calls[0][0] as { text: string; html: string };
    expect(call.text).toContain('raw-token-abc');
    expect(call.html).toContain('raw-token-abc');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/feature/email/email.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './email.service'`

- [ ] **Step 3: Install nodemailer**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 4: Create `src/feature/email/email.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      auth: {
        user: config.getOrThrow<string>('SMTP_USER'),
        pass: config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async sendVerificationEmail(to: string, rawToken: string): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const url = `${appUrl}/auth/verify-email?token=${rawToken}`;

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to,
      subject: 'Verify your email',
      text: `Click this link to verify your email (valid for 15 minutes): ${url}`,
      html: `<p>Click <a href="${url}">here</a> to verify your email. This link expires in 15 minutes.</p>`,
    });
  }
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
npx jest src/feature/email/email.service.spec.ts --no-coverage
```

Expected: PASS — 2 tests

- [ ] **Step 6: Create `src/feature/email/email.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

- [ ] **Step 7: Commit**

```bash
git add src/feature/email/ package.json package-lock.json
git commit -m "feat(email): add EmailModule with nodemailer SMTP transport"
```

---

## Task 3: Create EmailVerificationsRepository

**Files:**
- Create: `src/feature/auth/repositories/email-verifications.repository.ts`

No unit test here — repository methods are thin DB wrappers, covered by integration tests.

- [ ] **Step 1: Create `src/feature/auth/repositories/email-verifications.repository.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@src/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class EmailVerificationsRepository {
  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {}

  create(data: { userId: number; tokenHash: string; expiresAt: Date }) {
    return this.db
      .insert(schema.email_verifications)
      .values(data)
      .returning();
  }

  findByTokenHash(tokenHash: string) {
    return this.db.query.email_verifications.findFirst({
      where: eq(schema.email_verifications.tokenHash, tokenHash),
    });
  }

  deleteByUserId(userId: number) {
    return this.db
      .delete(schema.email_verifications)
      .where(eq(schema.email_verifications.userId, userId));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/feature/auth/repositories/email-verifications.repository.ts
git commit -m "feat(auth): add EmailVerificationsRepository"
```

---

## Task 4: Update JWT Payload Schema and JwtStrategy

**Files:**
- Modify: `src/feature/auth/schemas/jwt-payload.schema.ts`
- Modify: `src/feature/auth/strategies/jwt-strategy/jwt.strategy.ts`
- Modify: `src/feature/auth/strategies/jwt-strategy/jwt.strategy.spec.ts`

- [ ] **Step 1: Update the failing tests first**

Replace the contents of `src/feature/auth/strategies/jwt-strategy/jwt.strategy.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const configService: Pick<ConfigService, 'getOrThrow'> = {
      getOrThrow: jest
        .fn()
        .mockReturnValue('test-secret-min-32-characters-xxx'),
    } as jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  describe('validate', () => {
    it('returns {id, email, emailVerified} for a valid access token payload', () => {
      const payload = { sub: 1, email: 'user@example.com', emailVerified: true };

      expect(strategy.validate(payload)).toEqual({
        id: 1,
        email: 'user@example.com',
        emailVerified: true,
      });
    });

    it('ignores extra fields like jti/iat/exp', () => {
      const payload = {
        sub: 1,
        email: 'user@example.com',
        emailVerified: false,
        iat: 1700000000,
        exp: 1700000900,
      };

      expect(strategy.validate(payload)).toEqual({
        id: 1,
        email: 'user@example.com',
        emailVerified: false,
      });
    });

    it('throws UnauthorizedException when emailVerified is missing', () => {
      expect(() =>
        strategy.validate({ sub: 1, email: 'user@example.com' }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when sub is not a number', () => {
      expect(() =>
        strategy.validate({ sub: 'not-a-number', email: 'user@example.com', emailVerified: true }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when email is not a valid email', () => {
      expect(() =>
        strategy.validate({ sub: 1, email: 'not-email', emailVerified: true }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when sub is missing', () => {
      expect(() =>
        strategy.validate({ email: 'user@example.com', emailVerified: true }),
      ).toThrow(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/feature/auth/strategies/jwt-strategy/jwt.strategy.spec.ts --no-coverage
```

Expected: FAIL — `emailVerified` not in payload schema, `validate` doesn't return it

- [ ] **Step 3: Update `src/feature/auth/schemas/jwt-payload.schema.ts`**

```ts
import z from 'zod';

export const AccessTokenPayloadSchema = z.object({
  sub: z.number(),
  email: z.string().email(),
  emailVerified: z.boolean(),
});

export const JwtPayloadSchema = AccessTokenPayloadSchema.extend({
  jti: z.string(),
});

export type JwtPayloadType = z.infer<typeof JwtPayloadSchema>;
```

- [ ] **Step 4: Update `src/feature/auth/strategies/jwt-strategy/jwt.strategy.ts`**

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayloadSchema } from '@feature/auth/schemas/jwt-payload.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: unknown): { id: number; email: string; emailVerified: boolean } {
    const result = AccessTokenPayloadSchema.safeParse(payload);

    if (!result.success) throw new UnauthorizedException();

    return {
      id: result.data.sub,
      email: result.data.email,
      emailVerified: result.data.emailVerified,
    };
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest src/feature/auth/strategies/jwt-strategy/jwt.strategy.spec.ts --no-coverage
```

Expected: PASS — 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/feature/auth/schemas/jwt-payload.schema.ts src/feature/auth/strategies/jwt-strategy/
git commit -m "feat(auth): add emailVerified claim to JWT payload schema and strategy"
```

---

## Task 5: Update UsersSchema and UsersRepository

**Files:**
- Modify: `src/feature/auth/schemas/users.schema.ts`
- Modify: `src/feature/users/users.repository.ts`

- [ ] **Step 1: Update `src/feature/auth/schemas/users.schema.ts`**

```ts
import z from 'zod';

export const UsersSchema = z.object({
  email: z.string(),
  name: z.string(),
  avatar: z.string().nullish(),
  provider: z.string(),
  password: z.string().nullish(),
  emailVerified: z.boolean().optional(),
});

export type UsersType = z.infer<typeof UsersSchema>;
```

- [ ] **Step 2: Update `src/feature/users/users.repository.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '@src/schema';
import { UsersType } from '@feature/auth/schemas/users.schema';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  findByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
  }

  findById(id: number) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
  }

  create(data: UsersType) {
    return this.db.insert(schema.users).values(data).returning();
  }

  setEmailVerified(userId: number) {
    return this.db
      .update(schema.users)
      .set({ emailVerified: true })
      .where(eq(schema.users.id, userId))
      .returning();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/feature/auth/schemas/users.schema.ts src/feature/users/users.repository.ts
git commit -m "feat(users): add emailVerified to UsersSchema and setEmailVerified to repository"
```

---

## Task 6: Create Input Schemas for New Endpoints

**Files:**
- Create: `src/feature/auth/schemas/verify-email.schema.ts`
- Create: `src/feature/auth/schemas/resend-verification.schema.ts`

- [ ] **Step 1: Create `src/feature/auth/schemas/verify-email.schema.ts`**

```ts
import z from 'zod';

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailType = z.infer<typeof VerifyEmailSchema>;
```

- [ ] **Step 2: Create `src/feature/auth/schemas/resend-verification.schema.ts`**

```ts
import z from 'zod';

export const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

export type ResendVerificationType = z.infer<typeof ResendVerificationSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add src/feature/auth/schemas/verify-email.schema.ts src/feature/auth/schemas/resend-verification.schema.ts
git commit -m "feat(auth): add Zod schemas for verify-email and resend-verification endpoints"
```

---

## Task 7: Create EmailVerifiedGuard

**Files:**
- Create: `src/feature/auth/guards/email-verified.guard.ts`
- Create: `src/feature/auth/guards/email-verified.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/feature/auth/guards/email-verified.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;

  beforeEach(() => {
    guard = new EmailVerifiedGuard();
  });

  const makeContext = (user: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  it('returns true when emailVerified is true', () => {
    expect(guard.canActivate(makeContext({ emailVerified: true }))).toBe(true);
  });

  it('throws ForbiddenException when emailVerified is false', () => {
    expect(() =>
      guard.canActivate(makeContext({ emailVerified: false })),
    ).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is undefined', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/feature/auth/guards/email-verified.guard.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './email-verified.guard'`

- [ ] **Step 3: Create `src/feature/auth/guards/email-verified.guard.ts`**

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { emailVerified?: boolean } }>();
    if (!request.user?.emailVerified) {
      throw new ForbiddenException('Email verification required');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest src/feature/auth/guards/email-verified.guard.spec.ts --no-coverage
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/feature/auth/guards/
git commit -m "feat(auth): add EmailVerifiedGuard"
```

---

## Task 8: Update AuthService and Its Tests

**Files:**
- Modify: `src/feature/auth/auth.service.ts`
- Modify: `src/feature/auth/auth.service.spec.ts`

- [ ] **Step 1: Update the tests to reflect new behavior**

Replace the entire contents of `src/feature/auth/auth.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { EmailVerificationsRepository } from './repositories/email-verifications.repository';
import { EmailService } from '../../email/email.service';
import type { GoogleRequest } from './schemas/google-request.schema';
import { PasswordStrengthService } from './password-strength.service';

jest.mock('bcrypt');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(() => Buffer.from('a'.repeat(32))),
}));

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

type UsersRepoMock = jest.Mocked<
  Pick<UsersRepository, 'findByEmail' | 'findById' | 'create' | 'setEmailVerified'>
>;
type RefreshTokensRepoMock = jest.Mocked<
  Pick<
    RefreshTokensRepository,
    | 'findByJti'
    | 'createRefreshToken'
    | 'deleteRefreshToken'
    | 'deleteAllByUserId'
    | 'runInTransaction'
  >
>;
type EmailVerificationsRepoMock = jest.Mocked<
  Pick<EmailVerificationsRepository, 'create' | 'findByTokenHash' | 'deleteByUserId'>
>;
type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: UsersRepoMock;
  let refreshTokensRepo: RefreshTokensRepoMock;
  let emailVerificationsRepo: EmailVerificationsRepoMock;
  let emailService: jest.Mocked<Pick<EmailService, 'sendVerificationEmail'>>;
  let jwtService: JwtServiceMock;

  beforeEach(async () => {
    usersRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      setEmailVerified: jest.fn(),
    } as UsersRepoMock;

    refreshTokensRepo = {
      findByJti: jest.fn(),
      createRefreshToken: jest.fn().mockResolvedValue([]),
      deleteRefreshToken: jest.fn().mockResolvedValue([{ id: 1 }]),
      deleteAllByUserId: jest.fn().mockResolvedValue(undefined),
      runInTransaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
          cb({}),
        ),
    } as RefreshTokensRepoMock;

    emailVerificationsRepo = {
      create: jest.fn().mockResolvedValue([]),
      findByTokenHash: jest.fn(),
      deleteByUserId: jest.fn().mockResolvedValue(undefined),
    } as EmailVerificationsRepoMock;

    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn(),
    } as JwtServiceMock;

    const configService: Pick<ConfigService, 'getOrThrow'> = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersRepository, useValue: usersRepo },
        { provide: RefreshTokensRepository, useValue: refreshTokensRepo },
        { provide: EmailVerificationsRepository, useValue: emailVerificationsRepo },
        { provide: EmailService, useValue: emailService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        {
          provide: PasswordStrengthService,
          useValue: { validate: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    bcryptMock.hash.mockResolvedValue('hashed-value' as never);
    bcryptMock.compare.mockResolvedValue(true as never);
  });

  afterEach(() => jest.clearAllMocks());

  const userFixture = {
    id: 1,
    email: 'user@example.com',
    password: 'stored-password-hash',
    name: 'Test User',
    avatar: null,
    emailVerified: true,
  };

  describe('login', () => {
    const dto = { email: 'user@example.com', password: 'plaintext' };

    it('throws when user does not exist', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user has no password (google-only account)', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        ...userFixture,
        password: null,
      } as never);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when password does not match', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);
      bcryptMock.compare.mockResolvedValue(false as never);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when email is not verified', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        ...userFixture,
        emailVerified: false,
      } as never);
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('issues tokens and persists refresh token on success', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);

      const result = await service.login(dto);

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(refreshTokensRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userFixture.id,
          token: 'hashed-value',
        }),
        undefined,
      );
    });
  });

  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      password: 'pw',
      name: 'New',
    };

    it('throws ConflictException when email is already taken', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates user, stores verification token, sends email, returns message', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      usersRepo.create.mockResolvedValue([
        { ...userFixture, email: dto.email, emailVerified: false },
      ] as never);

      const result = await service.register(dto);

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: dto.email,
          name: dto.name,
          password: 'hashed-value',
          emailVerified: false,
        }),
      );
      expect(emailVerificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userFixture.id }),
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        dto.email,
        expect.any(String),
      );
      expect(result).toEqual({ message: 'Check your email to verify your account' });
    });
  });

  describe('googleLogin', () => {
    const req = {
      user: {
        email: 'g@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        picture: 'pic.jpg',
        accessToken: 'g-token',
      },
    } as unknown as GoogleRequest;

    it('uses existing user when email is known', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);

      const result = await service.googleLogin(req);

      expect(usersRepo.create).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-token');
    });

    it('creates a new user with emailVerified true when email is unknown', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      usersRepo.create.mockResolvedValue([
        { ...userFixture, email: req.user.email, emailVerified: true },
      ] as never);

      await service.googleLogin(req);

      expect(usersRepo.create).toHaveBeenCalledWith({
        email: req.user.email,
        name: 'Alice Smith',
        avatar: 'pic.jpg',
        provider: 'google',
        emailVerified: true,
      });
    });
  });

  describe('verifyEmail', () => {
    const rawToken = 'a'.repeat(64);
    const verificationRow = {
      id: 1,
      userId: 1,
      tokenHash: 'some-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws BadRequestException when token not found', async () => {
      emailVerificationsRepo.findByTokenHash.mockResolvedValue(undefined);
      await expect(service.verifyEmail(rawToken)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token is expired', async () => {
      emailVerificationsRepo.findByTokenHash.mockResolvedValue({
        ...verificationRow,
        expiresAt: new Date(Date.now() - 1_000),
      } as never);
      await expect(service.verifyEmail(rawToken)).rejects.toThrow(BadRequestException);
    });

    it('verifies email, deletes token row, issues tokens on success', async () => {
      emailVerificationsRepo.findByTokenHash.mockResolvedValue(verificationRow as never);
      usersRepo.setEmailVerified.mockResolvedValue([userFixture] as never);
      usersRepo.findById.mockResolvedValue(userFixture as never);

      const result = await service.verifyEmail(rawToken);

      expect(usersRepo.setEmailVerified).toHaveBeenCalledWith(verificationRow.userId);
      expect(emailVerificationsRepo.deleteByUserId).toHaveBeenCalledWith(verificationRow.userId);
      expect(result).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    });
  });

  describe('resendVerification', () => {
    const SUCCESS_MSG = { message: 'If your email is pending verification, a new link has been sent' };

    it('returns success message when user not found (no enumeration)', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      const result = await service.resendVerification('unknown@example.com');
      expect(result).toEqual(SUCCESS_MSG);
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns success message when already verified (no enumeration)', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);
      const result = await service.resendVerification(userFixture.email);
      expect(result).toEqual(SUCCESS_MSG);
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('deletes old token, creates new token, sends email', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        ...userFixture,
        emailVerified: false,
      } as never);

      const result = await service.resendVerification(userFixture.email);

      expect(emailVerificationsRepo.deleteByUserId).toHaveBeenCalledWith(userFixture.id);
      expect(emailVerificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userFixture.id }),
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        userFixture.email,
        expect.any(String),
      );
      expect(result).toEqual(SUCCESS_MSG);
    });
  });

  describe('refresh', () => {
    const rawToken = 'old-refresh-token';
    const decoded = { sub: 1, email: 'user@example.com', jti: 'jti-123', emailVerified: true };
    const storedRow = {
      id: 42,
      userId: 1,
      jti: 'jti-123',
      token: 'stored-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws when JWT signature is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad signature');
      });
      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes all user tokens when no DB row exists (reuse detection)', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(undefined);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(decoded.sub);
    });

    it('throws when stored token is expired', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue({
        ...storedRow,
        expiresAt: new Date(Date.now() - 1_000),
      } as never);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('throws when bcrypt hash does not match', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('detects race (deleted.length === 0) and revokes all', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      refreshTokensRepo.deleteRefreshToken.mockResolvedValue([]);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(decoded.sub);
      expect(refreshTokensRepo.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rotates the token on success', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      refreshTokensRepo.deleteRefreshToken.mockResolvedValue([{ id: 42 }]);

      const result = await service.refresh(rawToken);

      expect(refreshTokensRepo.deleteRefreshToken).toHaveBeenCalledWith(storedRow.id, expect.anything());
      expect(refreshTokensRepo.createRefreshToken).toHaveBeenCalled();
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-token');
    });
  });

  describe('logout', () => {
    const rawToken = 'refresh-to-logout';
    const decoded = { sub: 1, email: 'user@example.com', jti: 'jti-123', emailVerified: true };
    const storedRow = {
      id: 7,
      userId: 1,
      jti: 'jti-123',
      token: 'stored-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws when JWT signature is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad signature');
      });
      await expect(service.logout(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes all user tokens when no DB row exists', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(undefined);

      await expect(service.logout(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(decoded.sub);
    });

    it('throws without deleting when bcrypt hash does not match', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.logout(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteRefreshToken).not.toHaveBeenCalled();
    });

    it('deletes the stored token on success', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);

      const result = await service.logout(rawToken);

      expect(refreshTokensRepo.deleteRefreshToken).toHaveBeenCalledWith(storedRow.id);
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/feature/auth/auth.service.spec.ts --no-coverage
```

Expected: Multiple failures — missing `EmailVerificationsRepository`, `EmailService` deps, wrong return types, missing methods

- [ ] **Step 3: Replace `src/feature/auth/auth.service.ts`**

```ts
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { EmailVerificationsRepository } from './repositories/email-verifications.repository';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GoogleRequest } from './schemas/google-request.schema';
import { RegisterType } from './schemas/register.schema';
import { AuthTokenType } from './schemas/auth-tokens.schema';
import * as bcrypt from 'bcrypt';
import { LoginType } from './schemas/login.schema';
import { JwtPayloadType } from './schemas/jwt-payload.schema';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Tx } from '@common/types/transaction.type';
import { BuildTokenType } from './schemas/build-token.schema';
import { PasswordStrengthService } from './password-strength.service';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: UsersRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private emailVerificationsRepo: EmailVerificationsRepository,
    private emailService: EmailService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private passwordStrength: PasswordStrengthService,
  ) {}
  private readonly logger = new Logger(AuthService.name);

  async googleLogin(req: GoogleRequest): Promise<AuthTokenType> {
    const { email, firstName, lastName, picture } = req.user;

    let user = await this.usersRepo.findByEmail(email);

    if (!user) {
      const [created] = await this.usersRepo.create({
        email,
        name: `${firstName} ${lastName}`,
        avatar: picture,
        provider: 'google',
        emailVerified: true,
      });
      user = created;
    }

    return this.issueNewSession(user.id, user.email, user.emailVerified);
  }

  async register(dto: RegisterType): Promise<{ message: string }> {
    const { name, email, password } = dto;

    const existing = await this.usersRepo.findByEmail(email);

    if (existing)
      throw new ConflictException(
        `Unable to complete registration. If you already have an account, sign in instead.`,
      );

    await this.passwordStrength.validate(password, { email, name });

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [user] = await this.usersRepo.create({
      name,
      email,
      password: hashedPassword,
      provider: 'local',
      emailVerified: false,
    });

    await this.sendVerificationToken(user.id, email);

    return { message: 'Check your email to verify your account' };
  }

  async login(dto: LoginType): Promise<AuthTokenType> {
    const { email, password } = dto;

    const existing = await this.usersRepo.findByEmail(email);

    if (!existing) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(
      password,
      existing.password ??
        '$2b$12$invalid.hash.to.keep.timing.stable.aaaaaaaaaaaaaaaaaaaa',
    );

    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    if (!existing.emailVerified)
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );

    return this.issueNewSession(existing.id, existing.email, true);
  }

  async verifyEmail(token: string): Promise<AuthTokenType> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.emailVerificationsRepo.findByTokenHash(tokenHash);

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.usersRepo.setEmailVerified(record.userId);
    await this.emailVerificationsRepo.deleteByUserId(record.userId);

    const user = await this.usersRepo.findById(record.userId);
    return this.issueNewSession(user!.id, user!.email, true);
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const SUCCESS_MSG = {
      message:
        'If your email is pending verification, a new link has been sent',
    };

    const user = await this.usersRepo.findByEmail(email);
    if (!user || user.emailVerified) return SUCCESS_MSG;

    await this.emailVerificationsRepo.deleteByUserId(user.id);
    await this.sendVerificationToken(user.id, email);

    return SUCCESS_MSG;
  }

  private async issueNewSession(
    userId: number,
    email: string,
    emailVerified: boolean,
  ): Promise<AuthTokenType> {
    const { accessToken, refreshToken, hashedRefreshToken, jti } =
      await this.buildTokens(userId, email, emailVerified);

    await this.persistRefreshToken(userId, hashedRefreshToken, jti);

    return { accessToken, refreshToken };
  }

  async refresh(oldRefreshToken: string): Promise<AuthTokenType> {
    let jwtPayload: JwtPayloadType;

    try {
      jwtPayload = this.jwtService.verify(oldRefreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokensRepo.findByJti(jwtPayload.jti);

    if (!stored) {
      this.logger.warn(
        `Refresh token reuse detected for user ${jwtPayload.sub}`,
      );
      await this.refreshTokensRepo.deleteAllByUserId(jwtPayload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const isMatch = await bcrypt.compare(oldRefreshToken, stored.token);

    if (!isMatch) throw new UnauthorizedException('Invalid refresh token');

    const { accessToken, refreshToken, hashedRefreshToken, jti } =
      await this.buildTokens(
        jwtPayload.sub,
        jwtPayload.email,
        jwtPayload.emailVerified,
      );

    let reused = false;

    await this.refreshTokensRepo.runInTransaction(async (tx) => {
      const deleted = await this.refreshTokensRepo.deleteRefreshToken(
        stored.id,
        tx,
      );

      if (deleted.length === 0) {
        reused = true;
        return;
      }

      await this.persistRefreshToken(
        jwtPayload.sub,
        hashedRefreshToken,
        jti,
        tx,
      );
    });

    if (reused) {
      this.logger.warn(
        `Refresh token reuse detected for user ${jwtPayload.sub}`,
      );
      await this.refreshTokensRepo.deleteAllByUserId(jwtPayload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    let decoded: JwtPayloadType;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokensRepo.findByJti(decoded.jti);

    if (!stored) {
      this.logger.warn(
        `Invalid refresh token reuse detected for user ${decoded.sub} during logout`,
      );
      await this.refreshTokensRepo.deleteAllByUserId(decoded.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isMatch = await bcrypt.compare(refreshToken, stored.token);

    if (!isMatch) throw new UnauthorizedException('Invalid refresh token');

    await this.refreshTokensRepo.deleteRefreshToken(stored.id);

    return { message: 'Logged out successfully' };
  }

  private async buildTokens(
    userId: number,
    email: string,
    emailVerified: boolean,
  ): Promise<BuildTokenType> {
    const payload = { sub: userId, email, emailVerified };
    const jti = randomUUID();

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
      jwtid: jti,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

    return { accessToken, refreshToken, hashedRefreshToken, jti };
  }

  private persistRefreshToken(
    userId: number,
    hashedRefreshToken: string,
    jti: string,
    tx?: Tx,
  ) {
    return this.refreshTokensRepo.createRefreshToken(
      {
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        token: hashedRefreshToken,
        jti,
      },
      tx,
    );
  }

  private async sendVerificationToken(
    userId: number,
    email: string,
  ): Promise<void> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.emailVerificationsRepo.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });

    await this.emailService.sendVerificationEmail(email, rawToken);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest src/feature/auth/auth.service.spec.ts --no-coverage
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/feature/auth/auth.service.ts src/feature/auth/auth.service.spec.ts
git commit -m "feat(auth): implement email verification flow in AuthService"
```

---

## Task 9: Add Endpoints to AuthController and Wire AuthModule

**Files:**
- Modify: `src/feature/auth/auth.controller.ts`
- Modify: `src/feature/auth/auth.module.ts`

- [ ] **Step 1: Update `src/feature/auth/auth.controller.ts`**

```ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import type { GoogleRequest } from './schemas/google-request.schema';
import type { JwtPayloadType } from './schemas/jwt-payload.schema';
import type { Request } from 'express';
import { RegisterSchema, type RegisterType } from './schemas/register.schema';
import { LoginSchema, type LoginType } from './schemas/login.schema';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import {
  RefreshTokenBodySchema,
  type RefreshTokenBodyType,
} from './schemas/refresh-token-body.schema';
import {
  VerifyEmailSchema,
  type VerifyEmailType,
} from './schemas/verify-email.schema';
import {
  ResendVerificationSchema,
  type ResendVerificationType,
} from './schemas/resend-verification.schema';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleAuthRedirect(@Req() req: GoogleRequest) {
    return this.authService.googleLogin(req);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: Request & { user: JwtPayloadType }) {
    return req.user;
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  localRegister(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterType,
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  localLogin(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginType) {
    return this.authService.login(dto);
  }

  @Post('verify-email')
  verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema)) dto: VerifyEmailType,
  ) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @Throttle({ default: { ttl: 60000, limit: 2 } })
  resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationSchema))
    dto: ResendVerificationType,
  ) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('refresh')
  refreshToken(
    @Body(new ZodValidationPipe(RefreshTokenBodySchema))
    dto: RefreshTokenBodyType,
  ) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  logout(
    @Body(new ZodValidationPipe(RefreshTokenBodySchema))
    dto: RefreshTokenBodyType,
  ) {
    return this.authService.logout(dto.refreshToken);
  }
}
```

- [ ] **Step 2: Update `src/feature/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt-strategy/jwt.strategy';
import { GoogleStrategy } from './strategies/google-strategy/googlestrategy.service';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { EmailVerificationsRepository } from './repositories/email-verifications.repository';
import { UsersRepository } from '../users/users.repository';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '@db/database/database.module';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TokenCleanupTask } from './tasks/token-cleanup.task';
import { PasswordStrengthService } from './password-strength.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    EmailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    RefreshTokensRepository,
    EmailVerificationsRepository,
    UsersRepository,
    TokenCleanupTask,
    PasswordStrengthService,
  ],
})
export class AuthModule {}
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/feature/auth/auth.controller.ts src/feature/auth/auth.module.ts
git commit -m "feat(auth): add verify-email and resend-verification endpoints, wire EmailModule"
```

---

## Task 10: Add Required Environment Variables

**Files:**
- Modify: `.env` (or `.env.example` if it exists)

- [ ] **Step 1: Add SMTP and APP_URL env vars**

Add the following to your `.env` file (and `.env.example` if present):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Kanban App <your-email@gmail.com>"
APP_URL=http://localhost:3000
```

- [ ] **Step 2: Verify the app starts without errors**

```bash
npm run start:dev
```

Expected: App starts, no missing config errors

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): add SMTP and APP_URL variables for email verification"
```

---

## Self-Review Against Spec

| Spec requirement | Covered by |
|---|---|
| `email_verified boolean not null default false` on users | Task 1 |
| `email_verifications` table with `(id, user_id, token_hash, expires_at)` | Task 1 |
| `POST /auth/verify-email` | Task 9 (controller) + Task 8 (service) |
| `POST /auth/resend-verification` (rate-limited) | Task 9 (controller, `limit: 2`) + Task 8 (service) |
| Gate sensitive actions on `emailVerified === true` | Task 7 (`EmailVerifiedGuard`) |
| Token TTL: 15 minutes | Task 8 (`VERIFICATION_TOKEN_TTL_MS`) |
| Google OAuth users auto-verified | Task 8 (`googleLogin` sets `emailVerified: true`) |
| No tokens until verified | Task 8 (`register` returns message, not tokens) |
| Login blocked for unverified accounts | Task 8 (`login` throws `ForbiddenException`) |
| Nodemailer + SMTP | Task 2 |
| SHA-256 hash stored, raw token in email | Task 8 (`sendVerificationToken`) |
| No enumeration on resend | Task 8 (same success message regardless) |
