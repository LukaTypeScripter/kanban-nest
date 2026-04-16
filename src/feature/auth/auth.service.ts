import { RefreshTokens } from './repositories/refresh-tokens.repository';
import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: UsersRepository,
    private refreshTokensRepo: RefreshTokens,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async googleLogin(req: any) {
    const { email, firstName, lastName, picture } = req.user;

    let user = await this.usersRepo.findByEmail(email);

    if (!user) {
      const [created] = await this.usersRepo.create({
        email,
        name: `${firstName} ${lastName}`,
        avatar: picture,
      });

      user = created;
    }

    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    await this.refreshTokensRepo.createRefreshToken({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      token: refreshToken,
    });

    return { accessToken, refreshToken };
  }
}
