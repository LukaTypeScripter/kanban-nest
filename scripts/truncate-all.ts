import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await db.execute(
    sql`TRUNCATE TABLE kanban_card, kanban_column, kanban_board, refresh_tokens, email_verifications, users RESTART IDENTITY CASCADE`,
  );

  console.log('All tables truncated.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
