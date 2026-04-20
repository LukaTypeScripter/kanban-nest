import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class DrizzleHealthIndicator {
  constructor(
    private readonly indicatorService: HealthIndicatorService,
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.indicatorService.check(key);

    try {
      await this.db.execute('SELECT 1');
      return indicator.up();
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }
}
