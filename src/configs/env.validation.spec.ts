import { validateEnv } from './env.validation';

const validEnv: Record<string, unknown> = {
  DATABASE_URL: 'postgres://localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  SMTP_FROM: 'no-reply@example.com',
  APP_URL: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('parses a valid env and applies defaults', () => {
    const env = validateEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGIN).toBe('*');
  });

  it('coerces string PORT into a number', () => {
    const env = validateEnv({ ...validEnv, PORT: '8080' });
    expect(env.PORT).toBe(8080);
  });

  it('rejects non-positive PORT', () => {
    expect(() => validateEnv({ ...validEnv, PORT: '-1' })).toThrow();
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    void _omit;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('throws when JWT_REFRESH_SECRET is shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_REFRESH_SECRET: 'short' }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('throws when GOOGLE_CALLBACK_URL is not a URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, GOOGLE_CALLBACK_URL: 'not-a-url' }),
    ).toThrow(/GOOGLE_CALLBACK_URL/);
  });

  it('throws when NODE_ENV is outside the allowed enum', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow();
  });

  it('accepts a custom CORS_ORIGIN', () => {
    const env = validateEnv({
      ...validEnv,
      CORS_ORIGIN: 'http://localhost:5173',
    });
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('throws when JWT_SECRET and JWT_REFRESH_SECRET are identical', () => {
    const shared = 'x'.repeat(32);
    expect(() =>
      validateEnv({
        ...validEnv,
        JWT_SECRET: shared,
        JWT_REFRESH_SECRET: shared,
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });
});
