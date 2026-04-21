import { RefreshTokensRepository } from './../repositories/refresh-tokens.repository';
import { EmailVerificationRepository } from './../repositories/email-verification.repository';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TokenCleanupTask {
  constructor(
    private refreshTokensRepository: RefreshTokensRepository,
    private emailVerificationRepository: EmailVerificationRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    await this.refreshTokensRepository.deleteExpiredTokens();
    await this.emailVerificationRepository.deleteExpired();
  }
}
