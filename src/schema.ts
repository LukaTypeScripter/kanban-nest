import { index } from 'drizzle-orm/pg-core';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  avatar: text('avatar'),
  name: text('name').notNull(),
  password: text('password'),
  provider: text('provider').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const email_verifications = pgTable('email_verifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
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

export const kanban_board = pgTable(
  'kanban_board',
  {
    id: serial('id').primaryKey(),
    description: text('description').notNull(),
    owner_id: integer('owner_id')
      .references(() => users.id)
      .notNull(),
    title: text('title').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },

  (t) => [
    uniqueIndex('kanban_board_owner_title_idx').on(t.owner_id, t.title),
    index('idx_boards_owner_id').on(t.owner_id),
  ],
);

export const kanban_column = pgTable('kanban_column', {
  id: serial('id').primaryKey(),
  board_id: integer('board_id').references(() => kanban_board.id),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const kanban_card = pgTable('kanban_card', {
  id: serial('id').primaryKey(),
  column_id: integer('column_id').references(() => kanban_column.id),
  title: text('title').notNull(),
  description: text('description'),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
