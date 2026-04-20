import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database/database.module';
import { AuthModule } from './feature/auth/auth.module';
import { HealthModule } from '@feature/health/health.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core/constants';
import { validateEnv } from '@configs/env.validation';
import { EmailModule } from '@feature/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    process.env.NODE_ENV === 'test'
      ? { provide: APP_GUARD, useValue: { canActivate: () => true } }
      : { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
