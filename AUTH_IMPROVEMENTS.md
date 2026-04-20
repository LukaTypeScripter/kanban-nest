# Auth Improvements — Punch List

Prioritized backlog for the `auth` module. Ordered by impact. File paths refer to the current `main` branch.

---

## High priority

### 1. Login is vulnerable to timing-based email enumeration

**Where:** `src/feature/auth/auth.service.ts:77-92`

When the user doesn't exist, `login()` throws immediately. When they do, it runs `bcrypt.compare` (hundreds of ms). Response time leaks "this email has an account".

**Fix:**

```ts
async login(dto: LoginType): Promise<AuthTokenType> {
  const { email, password } = dto;

  const existing = await this.usersRepo.findByEmail(email);

  // Always run bcrypt.compare, even when the user doesn't exist, so timing is constant.
  const hash =
    existing?.password ??
    '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const isMatch = await bcrypt.compare(password, hash);

  if (!existing || !existing.password || !isMatch) {
    throw new UnauthorizedException('Invalid credentials');
  }

  return this.issueNewSession(existing.id, existing.email);
}
```

---

### 2. Google OAuth → local-account takeover

**Where:** `src/feature/auth/auth.service.ts:36-52`, `src/feature/auth/strategies/google-strategy/googlestrategy.service.ts`

`googleLogin` does `findByEmail` and issues tokens to whatever account matches. If Alice registers locally with `alice@example.com`, anyone with Google-auth access to that email address can sign in and take over her local account.

Also: the Google strategy does not check `profile.emails[0].verified === true`. Google normally only returns verified emails, but relying on this implicitly is a footgun.

**Fix (choose one):**
- Add a `provider` column on `users` (`'local' | 'google'`) and refuse cross-provider login.
- Only auto-link accounts if **both** sides are email-verified (see #3 for email verification).
- At minimum, verify `profile.emails[0].verified === true` in the Google strategy before creating/logging in a user.

---

### 3. No email verification after registration

Anyone can register with `victim@someoneelse.com` and immediately receive tokens + act as that identity.

**Fix:**
- Add `email_verified boolean not null default false` to the `users` table.
- Add an `email_verifications` table: `(id, user_id, token_hash, expires_at)`.
- New endpoints: `POST /auth/verify-email` (consume token), `POST /auth/resend-verification` (rate-limited).
- Gate sensitive actions (password change, profile edit, any kanban mutation) on `emailVerified === true`.

---

### 4. No password-reset flow

If a user forgets their password, they're stuck. You also can't ask users to rotate a breached password without manual DB surgery.

**Fix:**
- `POST /auth/forgot-password` — accepts email, always returns 200 (no enumeration), stores a short-lived single-use hashed token, emails a link.
- `POST /auth/reset-password` — consumes token, updates bcrypt hash, and calls `refreshTokensRepo.deleteAllByUserId(userId)` to invalidate every existing session.

---

## Medium priority

### 5. `/auth/refresh` has no rate limiting

**Where:** `src/feature/auth/auth.controller.ts:50-56`

Register, login, and logout all use `@Throttle({ default: { ttl: 60000, limit: 5 } })`, but `refresh` is wide open. A leaked refresh token can be spam-rotated.

**Fix:** add `@Throttle({ default: { ttl: 60000, limit: 10 } })` above `refreshToken()`.

---

### 6. `GET /auth/profile` returns stale JWT payload, not current DB state

**Where:** `src/feature/auth/auth.controller.ts:30-34`

`req.user` is whatever was in the JWT when it was issued. If the user's email changes, or the account is disabled/deleted, the API still acts like they're active until the 15-minute access token expires.

**Fix:** for `/profile` (and anywhere authorization decisions matter), fetch fresh from DB by `req.user.id` instead of trusting the payload.

---

### 7. No "sign out everywhere" / session management

Logout requires the refresh-token body. If a device is lost, the user can't revoke sessions.

**Fix:**
- `POST /auth/logout-all` — authenticated with access token, calls `refreshTokensRepo.deleteAllByUserId(userId)`.
- Nice-to-have: `GET /auth/sessions` listing active refresh tokens (add a `device_label` / `user_agent` column at issuance) with per-session revoke.

---

### 8. Sequential user IDs exposed via JWT `sub`

**Where:** `src/feature/auth/auth.service.ts:94-104`

`sub` is the numeric `users.id`. If any endpoint ever exposes `/users/:id` or similar, enumeration is trivial.

**Fix:** add a `public_id uuid not null unique default gen_random_uuid()` column on `users`. Put the UUID in the JWT; keep the integer id as an internal join key only.

---

## Low priority / nice-to-have

### 9. No 2FA/MFA

TOTP via `@otplib/core`. Add an `auth_totp_secrets` table and endpoints: `POST /auth/2fa/setup`, `POST /auth/2fa/verify`, `POST /auth/2fa/disable`. Big trust-and-safety win.

---

### 10. Refresh tokens aren't bound to a device fingerprint

A stolen refresh token works from any IP for 7 days. Store a hashed UA (not IP — mobile networks churn too much) at issuance, reject on mismatch.

---

### 11. No audit log

Add an `auth_events` table: `(user_id, event, ip, ua, at)` logged on login, logout, password reset, and the existing refresh-token-reuse detection. Invaluable during incident response.

---

### 12. Refresh token lives in JS-reachable memory

Currently sent in request/response bodies, which means it's vulnerable to XSS in the browser. For a real app, move refresh tokens to an `httpOnly; Secure; SameSite=Strict` cookie. Access token stays in memory. Larger change but meaningfully reduces the XSS blast radius.

---

## Already solid (for reference)

- Refresh token rotation with reuse detection and transaction-safe rotation (`auth.service.ts:134-164`).
- Bcrypt cost 12 on password + refresh-token storage.
- JWT payload validated with Zod on every request (`jwt.strategy.ts:17-23`).
- Password-strength gate: length + personal-info + zxcvbn + HIBP breach check (`password-strength.service.ts`).
- Rate limiting on register/login/logout.
- Helmet, CORS, global exception filter, env validation.
- Integration + e2e tests covering the happy path and the reuse-detection path.

---

## Suggested order of attack

1. → 2. → 3. → 4. — real security gaps.
5. → 7. — small wins, high value.
6. — correctness.
8. → 11. — polish.
9. → 10. → 12. — serious hardening when the app is going to production with real users.
