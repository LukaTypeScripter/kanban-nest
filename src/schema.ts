import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  avatar: text('avatar'),
  name: text('name').notNull(),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const refresh_tokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: serial('user_id')
    .references(() => users.id)
    .notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
