import * as path from 'path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connectionUri = container.getConnectionUri();

  const pool = new Pool({ connectionString: connectionUri });
  const db = drizzle(pool);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../drizzle'),
  });
  await pool.end();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionUri;
  process.env.JWT_SECRET = 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_CALLBACK_URL =
    'http://localhost:3000/auth/google/callback';
  process.env.CORS_ORIGIN = '*';
}
