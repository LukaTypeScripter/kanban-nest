import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@src/schema';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export const DrizzleAsyncProvider = 'DrizzleAsyncProvider';
export const DATABASE_POOL = 'DATABASE_POOL';

export const drizzleProvider = [
  {
    provide: DATABASE_POOL,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => {
      const connectionString = configService.getOrThrow<string>('DATABASE_URL');
      return new Pool({ connectionString });
    },
  },
  {
    provide: DrizzleAsyncProvider,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool) =>
      drizzle(pool, { schema }) as NodePgDatabase<typeof schema>,
  },
];
