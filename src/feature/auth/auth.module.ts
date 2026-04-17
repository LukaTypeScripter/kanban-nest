import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt-strategy/jwt.strategy';
import { GoogleStrategy } from './strategies/google-strategy/googlestrategy.service';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { UsersRepository } from '../users/users.repository';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../db/database/database.module';
import { ConfigService } from '@nestjs/config';
import { LocalStrategy } from './strategies/local-strategy/local.strategy';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    RefreshTokensRepository,
    UsersRepository,
    LocalStrategy,
  ],
})
export class AuthModule {}
