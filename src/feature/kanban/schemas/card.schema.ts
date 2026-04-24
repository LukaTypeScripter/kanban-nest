import { InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@src/schema';

export const CreateCardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20000).optional(),
  position: z.number().int().nonnegative(),
});

export const UpdateCardSchema = CreateCardSchema.partial();

export type CreateCardType = z.infer<typeof CreateCardSchema>;
export type UpdateCardType = z.infer<typeof UpdateCardSchema>;

export type CardType = InferSelectModel<typeof schema.kanban_card>;
