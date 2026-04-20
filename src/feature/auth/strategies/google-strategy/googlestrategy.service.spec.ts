import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Profile, VerifyCallback } from 'passport-google-oauth20';
import { GoogleStrategy } from './googlestrategy.service';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  beforeEach(async () => {
    const configService: Pick<ConfigService, 'getOrThrow'> = {
      getOrThrow: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'GOOGLE_CALLBACK_URL'
            ? 'http://localhost:3000/auth/google/callback'
            : 'test-value',
        ),
    } as jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    strategy = module.get(GoogleStrategy);
  });

  describe('validate', () => {
    const profile = {
      name: { givenName: 'Alice', familyName: 'Smith' },
      emails: [{ value: 'alice@example.com' }],
      photos: [{ value: 'https://example.com/pic.jpg' }],
    } as unknown as Profile;

    it('calls done(null, user) on a valid profile', () => {
      const done = jest.fn() as VerifyCallback;

      strategy.validate('access', 'refresh', profile, done);

      expect(done).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          email: 'alice@example.com',
          firstName: 'Alice',
          lastName: 'Smith',
          picture: 'https://example.com/pic.jpg',
          accessToken: 'access',
        }),
      );
    });

    it('rejects when emails are missing', () => {
      const done = jest.fn() as VerifyCallback;
      const bad = { ...profile, emails: undefined } as unknown as Profile;

      strategy.validate('access', 'refresh', bad, done);

      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('rejects when name is missing', () => {
      const done = jest.fn() as VerifyCallback;
      const bad = { ...profile, name: undefined } as unknown as Profile;

      strategy.validate('access', 'refresh', bad, done);

      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('rejects when photos are missing', () => {
      const done = jest.fn() as VerifyCallback;
      const bad = { ...profile, photos: undefined } as unknown as Profile;

      strategy.validate('access', 'refresh', bad, done);

      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('rejects when the profile fails Zod validation (e.g. email is not an email)', () => {
      const done = jest.fn() as VerifyCallback;
      const bad = {
        ...profile,
        emails: [{ value: 'not-an-email' }],
      } as unknown as Profile;

      strategy.validate('access', 'refresh', bad, done);

      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });
  });
});
