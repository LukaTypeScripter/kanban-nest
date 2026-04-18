import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import type { GoogleRequest } from './schemas/google-request.schema';
import type { JwtPayloadType } from './schemas/jwt-payload.schema';
import type { Request } from 'express';
import { RegisterType } from './schemas/register.schema';
import { LoginType } from './schemas/login.schema';

@Controller('auth')
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
  localRegister(@Body() req: Request & RegisterType) {
    return this.authService.register(req);
  }

  @Post('login')
  localLogin(@Body() req: Request & LoginType) {
    return this.authService.login(req);
  }

  @Post('refresh')
  refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }
}
