import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import type { GoogleRequest } from './schemas/google-request.schema';
import { PasswordStrengthService } from './password-strength.service';

jest.mock('bcrypt');

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

type UsersRepoMock = jest.Mocked<
  Pick<UsersRepository, 'findByEmail' | 'create'>
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
type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: UsersRepoMock;
  let refreshTokensRepo: RefreshTokensRepoMock;
  let jwtService: JwtServiceMock;

  beforeEach(async () => {
    usersRepo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
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

    it('creates the user and issues tokens', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      usersRepo.create.mockResolvedValue([
        { ...userFixture, email: dto.email },
      ] as never);

      const result = await service.register(dto);

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: dto.email,
          name: dto.name,
          password: 'hashed-value',
        }),
      );
      expect(result.accessToken).toBe('signed-token');
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

    it('creates a new user when email is unknown', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      usersRepo.create.mockResolvedValue([
        { ...userFixture, email: req.user.email },
      ] as never);

      await service.googleLogin(req);

      expect(usersRepo.create).toHaveBeenCalledWith({
        email: req.user.email,
        name: 'Alice Smith',
        avatar: 'pic.jpg',
      });
    });
  });

  describe('refresh', () => {
    const rawToken = 'old-refresh-token';
    const decoded = { sub: 1, email: 'user@example.com', jti: 'jti-123' };
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
      await expect(service.refresh(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes all user tokens when no DB row exists (reuse detection)', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(undefined);

      await expect(service.refresh(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(
        decoded.sub,
      );
    });

    it('throws when stored token is expired', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue({
        ...storedRow,
        expiresAt: new Date(Date.now() - 1_000),
      } as never);

      await expect(service.refresh(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('throws when bcrypt hash does not match', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.refresh(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('detects race (deleted.length === 0) and revokes all', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      refreshTokensRepo.deleteRefreshToken.mockResolvedValue([]);

      await expect(service.refresh(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(
        decoded.sub,
      );
      expect(refreshTokensRepo.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rotates the token on success', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      refreshTokensRepo.deleteRefreshToken.mockResolvedValue([{ id: 42 }]);

      const result = await service.refresh(rawToken);

      expect(refreshTokensRepo.deleteRefreshToken).toHaveBeenCalledWith(
        storedRow.id,
        expect.anything(),
      );
      expect(refreshTokensRepo.createRefreshToken).toHaveBeenCalled();
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-token');
    });
  });

  describe('logout', () => {
    const rawToken = 'refresh-to-logout';
    const decoded = { sub: 1, email: 'user@example.com', jti: 'jti-123' };
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
      await expect(service.logout(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes all user tokens when no DB row exists', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(undefined);

      await expect(service.logout(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(
        decoded.sub,
      );
    });

    it('throws without deleting when bcrypt hash does not match', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.logout(rawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokensRepo.deleteRefreshToken).not.toHaveBeenCalled();
    });

    it('deletes the stored token on success', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);

      const result = await service.logout(rawToken);

      expect(refreshTokensRepo.deleteRefreshToken).toHaveBeenCalledWith(
        storedRow.id,
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
