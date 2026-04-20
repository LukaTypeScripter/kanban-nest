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
    it('returns {id, email} for a valid access token payload', () => {
      const payload = { sub: 1, email: 'user@example.com' };

      expect(strategy.validate(payload)).toEqual({
        id: 1,
        email: 'user@example.com',
      });
    });

    it('ignores extra fields like jti/iat/exp', () => {
      const payload = {
        sub: 1,
        email: 'user@example.com',
        iat: 1700000000,
        exp: 1700000900,
      };

      expect(strategy.validate(payload)).toEqual({
        id: 1,
        email: 'user@example.com',
      });
    });

    it('throws UnauthorizedException when sub is not a number', () => {
      expect(() =>
        strategy.validate({ sub: 'not-a-number', email: 'user@example.com' }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when email is not a valid email', () => {
      expect(() =>
        strategy.validate({ sub: 1, email: 'not-email' }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when sub is missing', () => {
      expect(() =>
        strategy.validate({ email: 'user@example.com' }),
      ).toThrow(UnauthorizedException);
    });
  });
});
