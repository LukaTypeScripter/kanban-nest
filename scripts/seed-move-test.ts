import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import * as schema from '../src/schema';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  await db.execute(
    sql`TRUNCATE TABLE kanban_card, kanban_column, kanban_board, refresh_tokens, email_verifications, users RESTART IDENTITY CASCADE`,
  );

  const hashedPassword = await bcrypt.hash('Test1234!', 12);

  const [user] = await db
    .insert(schema.users)
    .values({
      email: 'move-test@example.com',
      name: 'Move Tester',
      password: hashedPassword,
      provider: 'local',
      emailVerified: true,
    })
    .returning();

  console.log(`user id=${user.id}`);

  const [board] = await db
    .insert(schema.kanban_board)
    .values({
      title: 'Move Test Board',
      description: 'for move testing',
      owner_id: user.id,
    })
    .returning();

  console.log(`board id=${board.id}`);

  const [colTodo] = await db
    .insert(schema.kanban_column)
    .values({ board_id: board.id, title: 'Todo', position: 1000 })
    .returning();

  const [colDoing] = await db
    .insert(schema.kanban_column)
    .values({ board_id: board.id, title: 'Doing', position: 2000 })
    .returning();

  console.log(`column Todo id=${colTodo.id}  Doing id=${colDoing.id}`);

  const todoCards = await db
    .insert(schema.kanban_card)
    .values([
      { column_id: colTodo.id, title: 'Card A', position: 1000 },
      { column_id: colTodo.id, title: 'Card B', position: 2000 },
      { column_id: colTodo.id, title: 'Card C', position: 3000 },
      { column_id: colTodo.id, title: 'Card D', position: 4000 },
    ])
    .returning();

  const doingCards = await db
    .insert(schema.kanban_card)
    .values([
      { column_id: colDoing.id, title: 'Card E', position: 1000 },
      { column_id: colDoing.id, title: 'Card F', position: 2000 },
    ])
    .returning();

  console.log('\n--- Todo column (id=%d) ---', colTodo.id);
  for (const c of todoCards)
    console.log(`  pos=${c.position}  id=${c.id}  "${c.title}"`);

  console.log('\n--- Doing column (id=%d) ---', colDoing.id);
  for (const c of doingCards)
    console.log(`  pos=${c.position}  id=${c.id}  "${c.title}"`);

  console.log('\n--- Scenarios to test ---');
  console.log(`
1. Same-column move UP
   Move Card D (pos=4000, index=4) → index=2 in Todo
   PATCH /api/v1/kanban/boards/${board.id}/columns/${colTodo.id}/cards/${todoCards[3].id}/move
   body: { positionIndex: 2, fromColumnId: ${colTodo.id}, newColumnId: ${colTodo.id}, fromPositionIndex: 4 }
   Expected Todo order: A(1000) C(2000) D(3000) B(4000)   ← B,C shift down; D takes 2000 wait...
   Actually expect: A(1000) D(2000) B(3000) C(4000)

2. Same-column move DOWN
   Move Card A (pos=1000, index=1) → index=3 in Todo
   body: { positionIndex: 3, fromColumnId: ${colTodo.id}, newColumnId: ${colTodo.id}, fromPositionIndex: 1 }
   Expected Todo order: B(1000) C(2000) A(3000) D(4000)

3. Cross-column move
   Move Card B (id=${todoCards[1].id}, pos=2000) from Todo → Doing at index=2 (between E and F)
   body: { positionIndex: 2, fromColumnId: ${colTodo.id}, newColumnId: ${colDoing.id}, fromPositionIndex: 2 }
   Expected Todo order:  A(1000) C(2000) D(3000)
   Expected Doing order: E(1000) B(2000) F(3000)
`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
