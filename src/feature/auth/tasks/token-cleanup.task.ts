import { RefreshTokensRepository } from './../repositories/refresh-tokens.repository';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TokenCleanupTask {
  constructor(private refreshTokensRepository: RefreshTokensRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    await this.refreshTokensRepository.deleteExpiredTokens();
  }
}
