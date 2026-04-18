import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
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

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: GoogleRequest) {}

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
  localRegister(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterType,
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
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
  logout(
    @Body(new ZodValidationPipe(RefreshTokenBodySchema))
    dto: RefreshTokenBodyType,
  ) {
    return this.authService.logout(dto.refreshToken);
  }
}
