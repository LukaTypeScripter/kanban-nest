# Kanban App — Tomorrow's Plan

## 1. Refactor & Architecture

### 1.1 Rename & clean up classes

- `RefreshTokens` → `RefreshTokensRepository` (naming is inconsistent with `UsersRepository`)
- `GooglestrategyService` → `GoogleStrategy` (it's not a service, it's a strategy)
- Remove unused `GooglestrategyService` import from `auth.controller.ts`

### 1.2 Extract types into dedicated files

Replace all `any` types with proper interfaces/types.

Create `feature/auth/types/auth.types.ts`:

```ts
export interface GoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  accessToken: string;
}

export interface JwtPayload {
  sub: number;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
```

### 1.3 Replace `any` with proper types

- `auth.controller.ts` — `@Req() req: Request` → use a typed request interface
- `auth.service.ts` — `req: any` → `req: { user: GoogleProfile }`
- `googlestrategy.service.ts` — `profile: any` → use `Profile` from `passport-google-oauth20`
- `jwt.strategy.ts` — `validate` return type should be `JwtPayload`

### 1.4 Move `UsersRepository` into a proper `UsersModule`

Currently `UsersRepository` lives in `feature/users/` but has no module — it's just manually added to `AuthModule` providers. Fix:

```
feature/
└── users/
    ├── users.repository.ts
    └── users.module.ts       ← create this
```

`UsersModule` should export `UsersRepository`, then `AuthModule` imports `UsersModule` instead of declaring `UsersRepository` directly.

---

## 2. Zod Validation

### 2.1 Install

```bash
pnpm add zod
```

### 2.2 Create Zod schemas

Create `feature/auth/schemas/google-profile.schema.ts`:

```ts
import { z } from 'zod';

export const GoogleProfileSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  picture: z.string().url(),
  accessToken: z.string(),
});

export type GoogleProfile = z.infer<typeof GoogleProfileSchema>;
```

Create `feature/auth/schemas/jwt-payload.schema.ts`:

```ts
import { z } from 'zod';

export const JwtPayloadSchema = z.object({
  sub: z.number(),
  email: z.string().email(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
```

### 2.3 Validate in GoogleStrategy

```ts
validate(accessToken, refreshToken, profile, done) {
  const raw = {
    email: profile.emails[0].value,
    firstName: profile.name.givenName,
    lastName: profile.name.familyName,
    picture: profile.photos[0].value,
    accessToken,
  };

  const result = GoogleProfileSchema.safeParse(raw);
  if (!result.success) return done(new Error('Invalid profile'), null);

  done(null, result.data);
}
```

### 2.4 Validate JWT payload in JwtStrategy

```ts
validate(payload: unknown) {
  const result = JwtPayloadSchema.safeParse(payload);
  if (!result.success) throw new UnauthorizedException();
  return { id: result.data.sub, email: result.data.email };
}
```

---

## 3. Local Auth (Email + Password)

### 3.1 Update schema

Add `password` column to `users` table (nullable since Google users won't have one):

```ts
password: text('password'),
```

Then run migration.

### 3.2 Install bcrypt

```bash
pnpm add bcrypt
pnpm add -D @types/bcrypt
```

### 3.3 Create DTOs with Zod

Create `feature/auth/schemas/register.schema.ts`:

```ts
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;
```

Create `feature/auth/schemas/login.schema.ts`:

```ts
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginDto = z.infer<typeof LoginSchema>;
```

### 3.4 Create LocalStrategy

```
feature/auth/strategies/local-strategy/local.strategy.ts
```

- Validates email + password using `passport-local`
- Calls `AuthService.validateUser(email, password)`

### 3.5 Add to AuthService

```ts
async register(dto: RegisterDto): Promise<AuthTokens>
async validateUser(email: string, password: string): Promise<User>
async localLogin(user: User): Promise<AuthTokens>
```

### 3.6 Add endpoints to AuthController

```
POST /auth/register   → register with email + password
POST /auth/login      → login with email + password
```

---

## 4. Refresh Token Endpoint

```
POST /auth/refresh
Body: { refreshToken: string }
```

Logic:

1. Validate the refresh token signature (`JWT_REFRESH_SECRET`)
2. Find it in DB — reject if not found or expired
3. Delete old token (rotation)
4. Issue new access token + new refresh token
5. Return `{ accessToken, refreshToken }`

---

## Order of Work Tomorrow

1. Refactor naming + types (no `any`)
2. Create `UsersModule`
3. Install Zod + add schemas
4. Implement `/auth/refresh`
5. Add `password` column + migration
6. Implement local register + login
