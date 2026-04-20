import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { createHash, randomUUID } from 'crypto';
import { Tx } from '@common/types/transaction.type';
import { BuildTokenType } from './schemas/build-token.schema';
import { PasswordStrengthService } from './password-strength.service';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { EmailService } from '@feature/email/email.service';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: UsersRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private passwordStrength: PasswordStrengthService,
    private emailVerificationRepo: EmailVerificationRepository,
    private emailService: EmailService,
  ) {}
  private readonly logger = new Logger(AuthService.name);

  async googleLogin(req: GoogleRequest): Promise<AuthTokenType> {
    const { email, firstName, lastName, picture } = req.user;

    let user = await this.usersRepo.findByEmail(email);

    if (!user) {
      const [created] = await this.usersRepo.create({
        email,
        name: `${firstName} ${lastName}`,
        avatar: picture,
        provider: 'google',
        emailVerified: true,
      });

      user = created;
    }

    return this.issueNewSession(user.id, user.email, user.emailVerified);
  }

  async register(dto: RegisterType): Promise<{ message: string }> {
    const { name, email, password } = dto;

    const existing = await this.usersRepo.findByEmail(email);

    if (existing)
      throw new ConflictException(
        `Unable to complete registration. If you already have an account, sign in instead.`,
      );

    await this.passwordStrength.validate(password, { email, name });

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [user] = await this.usersRepo.create({
      name,
      email,
      password: hashedPassword,
      provider: 'local',
      emailVerified: false,
    });

    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.emailVerificationRepo.createEmailVerification({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await this.emailService
      .sendVerificationEmail(email, rawToken)
      .catch((err) => {
        this.logger.error(
          `Failed to send verification email to ${email}: ${err.message}`,
        );
      });

    return { message: 'Check your email to verify your account' };
  }

  async login(dto: LoginType): Promise<AuthTokenType> {
    const { email, password } = dto;

    const existing = await this.usersRepo.findByEmail(email);

    if (!existing) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(
      password,
      existing.password ??
        '$2b$12$invalid.hash.to.keep.timing.stable.aaaaaaaaaaaaaaaaaaaa',
    );

    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    if (!existing.emailVerified)
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );

    return this.issueNewSession(
      existing.id,
      existing.email,
      existing.emailVerified,
    );
  }

  private async issueNewSession(
    userId: number,
    email: string,
    emailVerified: boolean,
  ): Promise<AuthTokenType> {
    const { accessToken, refreshToken, hashedRefreshToken, jti } =
      await this.buildTokens(userId, email, emailVerified);

    await this.persistRefreshToken(userId, hashedRefreshToken, jti);

    return { accessToken, refreshToken };
  }

  async refresh(oldRefreshToken: string): Promise<AuthTokenType> {
    let jwtPayload: JwtPayloadType;

    try {
      jwtPayload = this.jwtService.verify(oldRefreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokensRepo.findByJti(jwtPayload.jti);

    if (!stored) {
      this.logger.warn(
        `Refresh token reuse detected for user ${jwtPayload.sub}`,
      );
      await this.refreshTokensRepo.deleteAllByUserId(jwtPayload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    const isMatch = await bcrypt.compare(oldRefreshToken, stored.token);

    if (!isMatch) throw new UnauthorizedException('Invalid refresh token');

    const { accessToken, refreshToken, hashedRefreshToken, jti } =
      await this.buildTokens(
        jwtPayload.sub,
        jwtPayload.email,
        jwtPayload.emailVerified,
      );

    let reused = false;

    await this.refreshTokensRepo.transaction.runInTransaction(async (tx) => {
      const deleted = await this.refreshTokensRepo.deleteRefreshToken(
        stored.id,
        tx,
      );

      if (deleted.length === 0) {
        reused = true;
        return;
      }

      await this.persistRefreshToken(
        jwtPayload.sub,
        hashedRefreshToken,
        jti,
        tx,
      );
    });

    if (reused) {
      this.logger.warn(
        `Refresh token reuse detected for user ${jwtPayload.sub}`,
      );
      await this.refreshTokensRepo.deleteAllByUserId(jwtPayload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    let decoded: JwtPayloadType;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokensRepo.findByJti(decoded.jti);

    if (!stored) {
      this.logger.warn(
        `Invalid refresh token reuse detected for user ${decoded.sub} during logout`,
      );
      await this.refreshTokensRepo.deleteAllByUserId(decoded.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isMatch = await bcrypt.compare(refreshToken, stored.token);

    if (!isMatch) throw new UnauthorizedException('Invalid refresh token');

    await this.refreshTokensRepo.deleteRefreshToken(stored.id);

    return { message: 'Logged out successfully' };
  }

  private async buildTokens(
    userId: number,
    email: string,
    emailVerified: boolean,
  ): Promise<BuildTokenType> {
    const payload = { sub: userId, email, emailVerified };
    const jti = randomUUID();

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
      jwtid: jti,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

    return { accessToken, refreshToken, hashedRefreshToken, jti };
  }

  private persistRefreshToken(
    userId: number,
    hashedRefreshToken: string,
    jti: string,
    tx?: Tx,
  ) {
    return this.refreshTokensRepo.createRefreshToken(
      {
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        token: hashedRefreshToken,
        jti,
      },
      tx,
    );
  }

  async verifyEmail(token: string): Promise<AuthTokenType> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const record = await this.emailVerificationRepo.findByTokenHash(tokenHash);

    if (!record) throw new BadRequestException('Invalid or expired token');

    if (record.expiresAt < new Date())
      throw new BadRequestException('Invalid or expired token');

    const user = await this.usersRepo.findById(record.userId);

    if (!user) throw new BadRequestException('User not found');

    await this.usersRepo.transaction.runInTransaction(async (tx) => {
      await this.usersRepo.update(record.userId, { emailVerified: true }, tx);
      await this.emailVerificationRepo.deleteById(record.id, tx);
    });

    return this.issueNewSession(user.id, user.email, true);
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.usersRepo.findByEmail(email);

    if (!user || user.emailVerified) {
      return {
        message:
          'If your email is pending verification, a new link has been sent',
      };
    }
    let rawToken: string;

    await this.emailVerificationRepo.transaction.runInTransaction(
      async (tx) => {
        await this.emailVerificationRepo.deleteByUserId(user.id, tx);

        rawToken = randomUUID();
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');

        await this.emailVerificationRepo.createEmailVerification(
          {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
          tx,
        );
      },
    );

    await this.emailService
      .sendVerificationEmail(email, rawToken!)
      .catch((err) => {
        this.logger.error(
          `Failed to send verification email to ${email}: ${err.message}`,
        );
      });

    return {
      message:
        'If your email is pending verification, a new link has been sent',
    };
  }
}
