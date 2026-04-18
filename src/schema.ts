import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  avatar: text('avatar'),
  name: text('name').notNull(),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const refresh_tokens = pgTable(
  'refresh_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    token: text('token').notNull(),
    jti: text('jti').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [uniqueIndex('refresh_tokens_jti_idx').on(t.jti)],
);
