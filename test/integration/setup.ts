import * as path from 'path';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import * as schema from '../../src/schema';

export type Schema = typeof schema;

export interface TestDb {
  container: StartedPostgreSqlContainer;
  pool: Pool;
  db: NodePgDatabase<Schema>;
  shutdown: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();

  const pool = new Pool({ connectionString: container.getConnectionUri() });
  const db = drizzle(pool, { schema });

  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
  });

  return {
    container,
    pool,
    db,
    shutdown: async () => {
      await pool.end();
      await container.stop();
    },
  };
}

export async function truncateAll(db: NodePgDatabase<Schema>) {
  await db.execute(
    sql`TRUNCATE TABLE kanban_card, kanban_column, kanban_board, refresh_tokens, users RESTART IDENTITY CASCADE`,
  );
}
