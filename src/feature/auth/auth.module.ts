import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt-strategy/jwt.strategy';
import { GooglestrategyService } from './strategies/google-strategy/googlestrategy.service';
import { RefreshTokens } from './repositories/refresh-tokens.repository';
import { UsersRepository } from '../users/users.repository';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../db/database/database.module';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
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
    GooglestrategyService,
    RefreshTokens,
    UsersRepository,
  ],
})
export class AuthModule {}
