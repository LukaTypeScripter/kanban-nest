import { z } from 'zod';
import { InferSelectModel } from 'drizzle-orm';
import * as schema from '@src/schema';

export const CreateColumnSchema = z.object({
  title: z.string().min(1).max(80),
  position: z.number().int().nonnegative(),
});

export const UpdateColumnSchema = CreateColumnSchema.partial();

export type CreateColumnType = z.infer<typeof CreateColumnSchema>;
export type UpdateColumnType = z.infer<typeof UpdateColumnSchema>;

export type ColumnType = InferSelectModel<typeof schema.kanban_column>;
