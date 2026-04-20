import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import type { GoogleRequest } from './schemas/google-request.schema';
import type { JwtPayloadType } from './schemas/jwt-payload.schema';
import type { Request } from 'express';
import { RegisterSchema, type RegisterType } from './schemas/register.schema';
import { LoginSchema, type LoginType } from './schemas/login.schema';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import {
  RefreshTokenBodySchema,
  type RefreshTokenBodyType,
} from './schemas/refresh-token-body.schema';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleAuthRedirect(@Req() req: GoogleRequest) {
    return this.authService.googleLogin(req);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: Request & { user: JwtPayloadType }) {
    return req.user;
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  localRegister(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterType,
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  localLogin(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginType) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refreshToken(
    @Body(new ZodValidationPipe(RefreshTokenBodySchema))
    dto: RefreshTokenBodyType,
  ) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  logout(
    @Body(new ZodValidationPipe(RefreshTokenBodySchema))
    dto: RefreshTokenBodyType,
  ) {
    return this.authService.logout(dto.refreshToken);
  }
}
