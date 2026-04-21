# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm start:dev          # watch mode
pnpm start              # single run
pnpm build              # compile to dist/

# Linting & formatting
pnpm lint               # ESLint with auto-fix
pnpm format             # Prettier

# Database migrations (Drizzle)
pnpm db:generate        # generate migration from schema changes
pnpm db:migrate         # apply pending migrations

# Tests
pnpm test                       # unit tests (src/**/*.spec.ts)
pnpm test:watch                 # unit tests in watch mode
pnpm test:integration           # integration tests (test/integration/)
pnpm test:e2e                   # e2e tests (test/auth.e2e-spec.ts)
pnpm test:all                   # unit + integration + e2e

# Run a single test file
pnpm test -- --testPathPattern=auth.service
```

## Architecture

**Stack:** NestJS 11 · Drizzle ORM · PostgreSQL · Passport (JWT + Google OAuth2) · Nodemailer · Zod · `@nestjs/swagger`

### Module layout

```
src/
  app.module.ts           # root — wires ConfigModule, DatabaseModule, ThrottlerModule, feature modules
  schema.ts               # single Drizzle schema file (users, email_verifications, refresh_tokens tables)
  db/database/            # DatabaseModule — exposes DrizzleAsyncProvider and DATABASE_POOL tokens
  feature/
    auth/                 # AuthModule — all auth logic
    users/                # UsersRepository (used inside AuthModule)
    email/                # EmailModule/EmailService (nodemailer, used by AuthModule)
    health/               # HealthModule (Terminus + DrizzleHealthIndicator)
  common/
    filters/              # GlobalExceptionFilter
    pipes/                # ZodValidationPipe
    types/                # Tx (Drizzle transaction type)
    utility/              # RunInTransactionUtility
  configs/
    env.validation.ts     # Zod EnvSchema — validated at startup via ConfigModule
    drizzle.config.ts     # drizzle-kit config
```

### Key design patterns

**Validation:** All request bodies are validated with `ZodValidationPipe` applied per-route (not globally). Schemas live in `feature/auth/schemas/` as Zod schemas that also export inferred types.

**Database access:** Repositories receive the `DrizzleAsyncProvider` token via `@Inject()`. Each repository exposes a `transaction` property (a `RunInTransactionUtility` instance) so callers can run multi-step operations atomically: `repo.transaction.runInTransaction(async (tx) => { ... })`. Repository methods accept an optional `tx?: Tx` to participate in a caller-controlled transaction.

**Auth flow:**
- Access tokens: HS256 JWT, 15-minute TTL, signed with `JWT_SECRET`
- Refresh tokens: HS256 JWT, 7-day TTL, signed with `JWT_REFRESH_SECRET`, stored **hashed** (bcrypt) in the DB with a `jti` unique index. Rotation is atomic — old token deleted and new one inserted in a single transaction; concurrent reuse detection triggers deletion of all user sessions.
- Email verification: raw token sent by email; only the SHA-256 hash stored in DB; 15-minute TTL.
- Google OAuth: Passport `google` strategy; users auto-created on first login with `emailVerified: true`.

**Throttling:** Global `ThrottlerGuard` (60 req/min default). Sensitive routes override with `@Throttle()`: register/login ×5, verify-email ×10, resend-verification ×2, refresh/logout ×10. Guard is replaced with a no-op stub when `NODE_ENV === 'test'`.

**Scheduled tasks:** `TokenCleanupTask` runs via `@nestjs/schedule` at midnight daily to purge expired refresh tokens and email verification records.

**Swagger:** Enabled only when `NODE_ENV !== 'production'`, available at `/docs`.

### Path aliases (tsconfig)

| Alias | Maps to |
|-------|---------|
| `@db/*` | `src/db/*` |
| `@feature/*` | `src/feature/*` |
| `@common/*` | `src/common/*` |
| `@configs/*` | `src/configs/*` |
| `@src/*` | `src/*` |

### Testing strategy

- **Unit tests** (`*.spec.ts` in `src/`): Jest with mocked dependencies, no real DB.
- **Integration tests** (`test/integration/*.spec.ts`): Each suite spins up a real `postgres:16-alpine` Testcontainer, runs Drizzle migrations from `drizzle/`, then tears down. The `truncateAll` helper resets state between tests.
- **E2E tests** (`test/auth.e2e-spec.ts`): Full NestJS app via `global-setup.ts`, which starts a Testcontainer and sets all env vars before Jest runs. Migrations are applied in `globalSetup`. Emails to `SMTP_HOST` are silenced (`PASSWORD_HIBP_CHECK_ENABLED=false` skips HIBP checks too).
- Migrations in `drizzle/` must be committed alongside schema changes — tests depend on them.

### Environment variables

All required variables are validated by `EnvSchema` at startup. Required: `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `JWT_REFRESH_SECRET` (≥32 chars, must differ from `JWT_SECRET`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`.

Global prefix for all routes is `api/v1` (health and docs endpoints are excluded).
