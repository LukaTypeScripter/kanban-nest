import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GoogleRequest } from './schemas/google-request.schema';
import { RegisterType } from './schemas/register.schema';
import { AuthTokenType } from './schemas/auth-tokens.schema';
import * as bcrypt from 'bcrypt';
import { LoginType } from './schemas/login.schema';
import { JwtPayloadType } from './schemas/jwt-payload.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: UsersRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async googleLogin(req: GoogleRequest) {
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
    const jti = randomUUID();

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
      jwtid: jti,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.refreshTokensRepo.createRefreshToken({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      token: hashedRefreshToken,
      jti,
    });

    return { accessToken, refreshToken };
  }

  async validateUser(email: string, pass: string) {
    let user = await this.usersRepo.findByEmail(email);

    if (!user || !user.password) return null;

    const isMatch = await bcrypt.compare(pass, user.password);

    if (isMatch) {
      const { password, ...result } = user;

      return result;
    }

    return null;
  }

  async register(dto: RegisterType): Promise<AuthTokenType> {
    const { name, email, password } = dto;

    let existing = await this.usersRepo.findByEmail(email);

    if (existing)
      throw new ConflictException(`Email ${email} is already registered`);

    const hashedPassword = await bcrypt.hash(password, 10);

    const [user] = await this.usersRepo.create({
      name,
      email,
      password: hashedPassword,
    });

    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload);

    const jti = randomUUID();

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
      jwtid: jti,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.refreshTokensRepo.createRefreshToken({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      token: hashedRefreshToken,
      jti,
    });

    return { accessToken, refreshToken };
  }

  async login(dto: LoginType): Promise<AuthTokenType> {
    const { email, password } = dto;

    let existing = await this.usersRepo.findByEmail(email);

    if (!existing) throw new UnauthorizedException('Invalid credentials');

    if (!existing.password)
      throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(password, existing.password);

    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: existing.id, email: existing.email };

    const accessToken = this.jwtService.sign(payload);

    const jti = randomUUID();

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
      jwtid: jti,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.refreshTokensRepo.createRefreshToken({
      userId: existing.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      token: hashedRefreshToken,
      jti,
    });

    return { accessToken, refreshToken };
  }

  async refresh(oldRefreshToken: string): Promise<AuthTokenType> {
    let jwtPayload: JwtPayloadType;

    try {
      jwtPayload = this.jwtService.verify(oldRefreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokensRepo.findByJti(jwtPayload.jti);

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.refreshTokensRepo.deleteRefreshToken(stored.id);

    const payload = { sub: jwtPayload.sub, email: jwtPayload.email };

    const accessToken = this.jwtService.sign(payload);

    const jti = randomUUID();

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
      jwtid: jti,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.refreshTokensRepo.createRefreshToken({
      userId: payload.sub,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      token: hashedRefreshToken,
      jti,
    });

    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string) {
    let decoded: JwtPayloadType;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokensRepo.findByJti(decoded.jti);

    if (stored) await this.refreshTokensRepo.deleteRefreshToken(stored.id);

    return { message: 'Logged out successfully' };
  }
}
