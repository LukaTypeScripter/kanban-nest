import { z } from 'zod';

export const MoveCardSchema = z.object({
  toColumnId: z.number(),
  beforeCardId: z.number(),
  afterCardId: z.number(),
});

export type MoveCardType = z.infer<typeof MoveCardSchema>;
