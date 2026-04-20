import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { GoogleRequest } from './schemas/google-request.schema';
import type { JwtPayloadType } from './schemas/jwt-payload.schema';
import type { Request } from 'express';

type AuthServiceMock = jest.Mocked<
  Pick<AuthService, 'googleLogin' | 'register' | 'login' | 'refresh' | 'logout'>
>;

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthServiceMock;

  beforeEach(async () => {
    authService = {
      googleLogin: jest.fn(),
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    } as AuthServiceMock;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('googleAuth', () => {
    it('is a no-op handler (guard handles the redirect)', async () => {
      await expect(controller.googleAuth()).resolves.toBeUndefined();
    });
  });

  describe('googleAuthRedirect', () => {
    it('delegates the request to authService.googleLogin', async () => {
      const req = { user: { email: 'x@y.z' } } as unknown as GoogleRequest;
      const tokens = { accessToken: 'a', refreshToken: 'r' };
      authService.googleLogin.mockResolvedValue(tokens);

      const result = await controller.googleAuthRedirect(req);

      expect(authService.googleLogin).toHaveBeenCalledWith(req);
      expect(result).toEqual(tokens);
    });
  });

  describe('getProfile', () => {
    it('returns the authenticated user from the request', () => {
      const user = {
        sub: 1,
        email: 'a@b.c',
      } as unknown as JwtPayloadType;
      const req = { user } as Request & { user: JwtPayloadType };

      expect(controller.getProfile(req)).toBe(user);
    });
  });

  describe('localRegister', () => {
    it('delegates the dto to authService.register', async () => {
      const dto = { email: 'a@b.c', password: 'pw', name: 'N' };
      const tokens = { message: 'Check your email to verify your account' };
      authService.register.mockResolvedValue(tokens);

      const result = await controller.localRegister(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(tokens);
    });
  });

  describe('localLogin', () => {
    it('delegates the dto to authService.login', async () => {
      const dto = { email: 'a@b.c', password: 'pw' };
      const tokens = { accessToken: 'a', refreshToken: 'r' };
      authService.login.mockResolvedValue(tokens);

      const result = await controller.localLogin(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(tokens);
    });
  });

  describe('refreshToken', () => {
    it('passes only the refreshToken string to authService.refresh', async () => {
      const dto = { refreshToken: 'raw-token' };
      const tokens = { accessToken: 'a', refreshToken: 'r' };
      authService.refresh.mockResolvedValue(tokens);

      const result = await controller.refreshToken(dto);

      expect(authService.refresh).toHaveBeenCalledWith('raw-token');
      expect(result).toEqual(tokens);
    });
  });

  describe('logout', () => {
    it('passes only the refreshToken string to authService.logout', async () => {
      const dto = { refreshToken: 'raw-token' };
      const expected = { message: 'Logged out successfully' };
      authService.logout.mockResolvedValue(expected);

      const result = await controller.logout(dto);

      expect(authService.logout).toHaveBeenCalledWith('raw-token');
      expect(result).toEqual(expected);
    });
  });
});
