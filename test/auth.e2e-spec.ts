import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/(.*)', 'docs', 'docs/(.*)'],
    });
    await app.init();

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE',
    );
  });

  const creds = {
    email: 'alice@example.com',
    password: 'correct-horse-battery-staple',
    name: 'Alice',
  };

  type TokenResponse = { accessToken: string; refreshToken: string };
  type ProfileResponse = { id: number; email: string };

  async function registerAndVerify(): Promise<TokenResponse> {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(creds);
    await pool.query(
      'UPDATE users SET email_verified = true WHERE email = $1',
      [creds.email],
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    return res.body as TokenResponse;
  }

  describe('POST /api/v1/auth/register', () => {
    it('returns 201 with a verification message', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(creds);

      expect(res.status).toBe(201);
      expect((res.body as { message: string }).message).toBeDefined();
    });

    it('returns 400 on invalid body (Zod pipe)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'x', name: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 201 with tokens after register and email verification', async () => {
      const tokens = await registerAndVerify();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it('returns 401 on wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(creds);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    it('returns 401 without a token (JwtAuthGuard)', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/auth/profile',
      );
      expect(res.status).toBe(401);
    });

    it('returns 200 + user payload with a valid access token', async () => {
      const { accessToken } = await registerAndVerify();

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect((res.body as ProfileResponse).email).toBe(creds.email);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rotates the refresh token and returns new access + refresh', async () => {
      const { refreshToken: oldRefresh } = await registerAndVerify();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefresh });

      expect(res.status).toBe(201);
      const body = res.body as TokenResponse;
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).not.toBe(oldRefresh);
    });
  });
});
