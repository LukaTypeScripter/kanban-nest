# Email Verification Design

**Date:** 2026-04-20
**Status:** Approved

## Problem

Any user can register with an email they don't own and immediately receive auth tokens, allowing identity impersonation.

## Decisions

| Question                    | Decision                                                  |
| --------------------------- | --------------------------------------------------------- |
| Email provider              | Nodemailer + SMTP                                         |
| Tokens before verification? | No — tokens only issued after verification                |
| Token TTL                   | 15 minutes                                                |
| Google OAuth users          | Auto-verified (`emailVerified: true`) on creation         |
| Token strategy              | Signed URL (SHA-256 hash stored, raw token in email link) |

## Data Model

### `users` table (addition)

```
emailVerified: boolean, not null, default false
```

### New `email_verifications` table

| column      | type      | constraints                   |
| ----------- | --------- | ----------------------------- |
| `id`        | serial    | PK                            |
| `userId`    | integer   | FK → users.id, cascade delete |
| `tokenHash` | text      | not null                      |
| `expiresAt` | timestamp | not null                      |

One row per pending verification. Replaced on resend. Deleted on successful verification.

## New Module: EmailModule

Location: `src/feature/email/`

Wraps Nodemailer. Reads SMTP config from environment. Exports `EmailService` for use by `AuthModule`.

### New env vars

| var         | purpose                                  |
| ----------- | ---------------------------------------- |
| `SMTP_HOST` | SMTP server hostname                     |
| `SMTP_PORT` | SMTP server port                         |
| `SMTP_USER` | SMTP username                            |
| `SMTP_PASS` | SMTP password                            |
| `SMTP_FROM` | Sender address                           |
| `APP_URL`   | Base URL for building verification links |

### `EmailService` public API

```
sendVerificationEmail(to: string, rawToken: string): Promise<void>
```

Builds URL as `${APP_URL}/auth/verify-email?token=<rawToken>` and sends the email.

## Auth Flow Changes

### Registration (`POST /auth/register`)

1. Validate input, check for duplicate email, validate password strength
2. Hash password, create user with `emailVerified: false`
3. Generate `crypto.randomBytes(32)` raw token → SHA-256 hash
4. Insert row into `email_verifications` with `expiresAt = now + 15min`
5. Send verification email via `EmailService`
6. Return `{ message: 'Check your email to verify your account' }` — no tokens

### Google OAuth (`googleLogin`)

- Create user with `emailVerified: true`
- Issue tokens immediately — no verification email

### Login (`POST /auth/login`)

- After successful password check: if `emailVerified === false` → `403 ForbiddenException('Please verify your email before logging in')`
- Otherwise issue tokens as before

### New: `POST /auth/verify-email`

**Body:** `{ token: string }`

1. SHA-256 hash the incoming token
2. Look up matching row in `email_verifications`
3. If not found → `400 BadRequestException('Invalid or expired verification token')`
4. If `expiresAt < now` → `400 BadRequestException('Invalid or expired verification token')`
5. Set `users.emailVerified = true`
6. Delete the verification row
7. Issue and return auth tokens (access + refresh) — this is the user's first login

### New: `POST /auth/resend-verification`

**Body:** `{ email: string }`
**Throttle:** `{ ttl: 60000, limit: 2 }`

1. Look up user by email
2. If not found or already verified → return `{ message: 'If your email is pending verification, a new link has been sent' }` (no enumeration)
3. Delete existing `email_verifications` row for this user
4. Generate new token, insert new row, send email
5. Return same success message

## JWT Payload Change

Add `emailVerified: boolean` claim to the JWT payload at token-issue time (in `buildTokens()`).

## Gating: EmailVerifiedGuard

A custom NestJS guard at `src/feature/auth/guards/email-verified.guard.ts`.

- Reads `req.user.emailVerified` from the JWT payload
- If `false` → `403 ForbiddenException('Email verification required')`
- Applied to sensitive routes: `@UseGuards(AuthGuard('jwt'), EmailVerifiedGuard)`

**Note on stale JWTs:** After verifying, the user's existing access token still carries `emailVerified: false` until expiry (15 min max). The verify-email endpoint issues fresh tokens immediately, so users who verify and use those new tokens are unaffected.

## Files to Create / Modify

| action | path                                                              |
| ------ | ----------------------------------------------------------------- |
| modify | `src/schema.ts`                                                   |
| create | `src/feature/email/email.module.ts`                               |
| create | `src/feature/email/email.service.ts`                              |
| create | `src/feature/auth/repositories/email-verifications.repository.ts` |
| create | `src/feature/auth/guards/email-verified.guard.ts`                 |
| modify | `src/feature/auth/auth.service.ts`                                |
| modify | `src/feature/auth/auth.controller.ts`                             |
| modify | `src/feature/auth/auth.module.ts`                                 |
| modify | `src/feature/auth/schemas/jwt-payload.schema.ts`                  |
| create | `src/feature/auth/schemas/verify-email.schema.ts`                 |
| create | `src/feature/auth/schemas/resend-verification.schema.ts`          |
| create | `drizzle migration`                                               |
