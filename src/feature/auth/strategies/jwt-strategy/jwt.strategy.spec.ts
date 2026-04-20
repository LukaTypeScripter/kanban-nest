import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { JwtPayloadType } from '@feature/auth/schemas/jwt-payload.schema';

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
    it('returns {id, email} for a valid payload', () => {
      const payload: JwtPayloadType = {
        sub: 1,
        email: 'user@example.com',
        jti: 'jti-123',
      };

      expect(strategy.validate(payload)).toEqual({
        id: 1,
        email: 'user@example.com',
      });
    });

    it('throws UnauthorizedException when sub is not a number', () => {
      const payload = {
        sub: 'not-a-number',
        email: 'user@example.com',
        jti: 'j',
      } as unknown as JwtPayloadType;

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when email is not a valid email', () => {
      const payload = {
        sub: 1,
        email: 'not-email',
        jti: 'j',
      } as JwtPayloadType;

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when jti is missing', () => {
      const payload = {
        sub: 1,
        email: 'user@example.com',
      } as unknown as JwtPayloadType;

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });
  });
});
