import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { EmailService } from '../email/email.service';
import type { GoogleRequest } from './schemas/google-request.schema';
import { PasswordStrengthService } from './password-strength.service';

jest.mock('bcrypt');

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

type UsersRepoMock = jest.Mocked<
  Pick<UsersRepository, 'findByEmail' | 'findById' | 'create' | 'update'>
>;
type RefreshTokensRepoMock = jest.Mocked<
  Pick<
    RefreshTokensRepository,
    | 'findByJti'
    | 'createRefreshToken'
    | 'deleteRefreshToken'
    | 'deleteAllByUserId'
  >
> & { transaction: { runInTransaction: jest.Mock } };
type EmailVerificationRepoMock = jest.Mocked<
  Pick<
    EmailVerificationRepository,
    'createEmailVerification' | 'findByTokenHash' | 'deleteById' | 'deleteByUserId'
  >
> & { transaction: { runInTransaction: jest.Mock } };
type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: UsersRepoMock;
  let refreshTokensRepo: RefreshTokensRepoMock;
  let emailVerificationRepo: EmailVerificationRepoMock;
  let emailService: jest.Mocked<Pick<EmailService, 'sendVerificationEmail'>>;
  let jwtService: JwtServiceMock;

  beforeEach(async () => {
    usersRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue([]),
      transaction: {
        runInTransaction: jest
          .fn()
          .mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
            cb({}),
          ),
      },
    } as unknown as UsersRepoMock;

    refreshTokensRepo = {
      findByJti: jest.fn(),
      createRefreshToken: jest.fn().mockResolvedValue([]),
      deleteRefreshToken: jest.fn().mockResolvedValue([{ id: 1 }]),
      deleteAllByUserId: jest.fn().mockResolvedValue(undefined),
      transaction: {
        runInTransaction: jest
          .fn()
          .mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
            cb({}),
          ),
      },
    } as RefreshTokensRepoMock;

    emailVerificationRepo = {
      createEmailVerification: jest.fn().mockResolvedValue([]),
      findByTokenHash: jest.fn(),
      deleteById: jest.fn().mockResolvedValue([]),
      deleteByUserId: jest.fn().mockResolvedValue([]),
      transaction: {
        runInTransaction: jest
          .fn()
          .mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
            cb({}),
          ),
      },
    } as EmailVerificationRepoMock;

    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

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
        { provide: EmailVerificationRepository, useValue: emailVerificationRepo },
        { provide: EmailService, useValue: emailService },
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
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

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
    emailVerified: true,
    provider: 'local',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('login', () => {
    const dto = { email: 'user@example.com', password: 'plaintext' };

    it('throws when user does not exist', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user has no password (google-only account)', async () => {
      usersRepo.findByEmail.mockResolvedValue({ ...userFixture, password: null } as never);
      bcryptMock.compare.mockResolvedValue(false as never);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when password does not match', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);
      bcryptMock.compare.mockResolvedValue(false as never);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when email is not verified', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        ...userFixture,
        emailVerified: false,
      } as never);
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('issues tokens and persists refresh token on success', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);

      const result = await service.login(dto);

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(refreshTokensRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userFixture.id, token: 'hashed-value' }),
        undefined,
      );
    });
  });

  describe('register', () => {
    const dto = { email: 'new@example.com', password: 'pw', name: 'New' };

    it('throws ConflictException when email is already taken', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates user, stores verification token, sends email, returns message', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      usersRepo.create.mockResolvedValue([
        { ...userFixture, email: dto.email, emailVerified: false },
      ] as never);

      const result = await service.register(dto);

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: dto.email, password: 'hashed-value', emailVerified: false }),
      );
      expect(emailVerificationRepo.createEmailVerification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userFixture.id }),
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        dto.email,
        expect.any(String),
      );
      expect(result).toEqual({ message: 'Check your email to verify your account' });
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

    it('creates a new user with emailVerified true when email is unknown', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      usersRepo.create.mockResolvedValue([
        { ...userFixture, email: req.user.email, emailVerified: true },
      ] as never);

      await service.googleLogin(req);

      expect(usersRepo.create).toHaveBeenCalledWith({
        email: req.user.email,
        name: 'Alice Smith',
        avatar: 'pic.jpg',
        provider: 'google',
        emailVerified: true,
      });
    });
  });

  describe('verifyEmail', () => {
    const rawToken = 'some-raw-token';
    const verificationRow = {
      id: 1,
      userId: 1,
      tokenHash: 'hashed',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws BadRequestException when token not found', async () => {
      emailVerificationRepo.findByTokenHash.mockResolvedValue(undefined);
      await expect(service.verifyEmail(rawToken)).rejects.toThrow();
    });

    it('throws BadRequestException when token is expired', async () => {
      emailVerificationRepo.findByTokenHash.mockResolvedValue({
        ...verificationRow,
        expiresAt: new Date(Date.now() - 1_000),
      } as never);
      await expect(service.verifyEmail(rawToken)).rejects.toThrow();
    });

    it('verifies email, deletes token row, issues tokens on success', async () => {
      emailVerificationRepo.findByTokenHash.mockResolvedValue(verificationRow as never);
      usersRepo.findById.mockResolvedValue(userFixture as never);

      const result = await service.verifyEmail(rawToken);

      expect(usersRepo.update).toHaveBeenCalledWith(
        verificationRow.userId,
        { emailVerified: true },
        expect.anything(),
      );
      expect(emailVerificationRepo.deleteById).toHaveBeenCalledWith(
        verificationRow.id,
        expect.anything(),
      );
      expect(result).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    });
  });

  describe('resendVerification', () => {
    const SUCCESS_MSG = { message: 'If your email is pending verification, a new link has been sent' };

    it('returns success without sending when user not found', async () => {
      usersRepo.findByEmail.mockResolvedValue(undefined);
      const result = await service.resendVerification('unknown@example.com');
      expect(result).toEqual(SUCCESS_MSG);
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns success without sending when already verified', async () => {
      usersRepo.findByEmail.mockResolvedValue(userFixture as never);
      const result = await service.resendVerification(userFixture.email);
      expect(result).toEqual(SUCCESS_MSG);
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('deletes old token, creates new token, sends email', async () => {
      usersRepo.findByEmail.mockResolvedValue({ ...userFixture, emailVerified: false } as never);

      const result = await service.resendVerification(userFixture.email);

      expect(emailVerificationRepo.deleteByUserId).toHaveBeenCalledWith(userFixture.id, expect.anything());
      expect(emailVerificationRepo.createEmailVerification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userFixture.id }),
        expect.anything(),
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        userFixture.email,
        expect.any(String),
      );
      expect(result).toEqual(SUCCESS_MSG);
    });
  });

  describe('refresh', () => {
    const rawToken = 'old-refresh-token';
    const decoded = { sub: 1, email: 'user@example.com', jti: 'jti-123', emailVerified: true };
    const storedRow = {
      id: 42,
      userId: 1,
      jti: 'jti-123',
      token: 'stored-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws when JWT signature is invalid', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('bad signature'); });
      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes all user tokens when no DB row exists (reuse detection)', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(undefined);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(decoded.sub);
    });

    it('throws when stored token is expired', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue({
        ...storedRow,
        expiresAt: new Date(Date.now() - 1_000),
      } as never);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('throws when bcrypt hash does not match', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('detects race (deleted.length === 0) and revokes all', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      refreshTokensRepo.deleteRefreshToken.mockResolvedValue([]);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(decoded.sub);
      expect(refreshTokensRepo.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rotates the token on success', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      refreshTokensRepo.deleteRefreshToken.mockResolvedValue([{ id: 42 }]);

      const result = await service.refresh(rawToken);

      expect(refreshTokensRepo.deleteRefreshToken).toHaveBeenCalledWith(storedRow.id, expect.anything());
      expect(refreshTokensRepo.createRefreshToken).toHaveBeenCalled();
      expect(refreshTokensRepo.deleteAllByUserId).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-token');
    });
  });

  describe('logout', () => {
    const rawToken = 'refresh-to-logout';
    const decoded = { sub: 1, email: 'user@example.com', jti: 'jti-123', emailVerified: true };
    const storedRow = {
      id: 7,
      userId: 1,
      jti: 'jti-123',
      token: 'stored-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws when JWT signature is invalid', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('bad signature'); });
      await expect(service.logout(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes all user tokens when no DB row exists', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(undefined);

      await expect(service.logout(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteAllByUserId).toHaveBeenCalledWith(decoded.sub);
    });

    it('throws without deleting when bcrypt hash does not match', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.logout(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokensRepo.deleteRefreshToken).not.toHaveBeenCalled();
    });

    it('deletes the stored token on success', async () => {
      jwtService.verify.mockReturnValue(decoded as never);
      refreshTokensRepo.findByJti.mockResolvedValue(storedRow as never);

      const result = await service.logout(rawToken);

      expect(refreshTokensRepo.deleteRefreshToken).toHaveBeenCalledWith(storedRow.id);
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
