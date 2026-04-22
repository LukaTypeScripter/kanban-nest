import { InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@src/schema';

export const BoardColorSchema = z.enum([
  'slate',
  'blue',
  'teal',
  'emerald',
  'amber',
  'rose',
  'violet',
  'indigo',
]);

export const CreateBoardSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(4000).default(''),
  color: BoardColorSchema.optional(),
});

export const UpdateBoardSchema = CreateBoardSchema.partial();

export type BoardColor = z.infer<typeof BoardColorSchema>;
export type CreateBoardType = z.infer<typeof CreateBoardSchema>;
export type UpdateBoardType = z.infer<typeof UpdateBoardSchema>;

export type Board = InferSelectModel<typeof schema.kanban_board>;
