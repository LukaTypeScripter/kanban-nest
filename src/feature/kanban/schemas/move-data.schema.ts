import { z } from 'zod';

export const MoveCardSchema = z.object({
  beforeCardId: z.number().nullable(),
  afterCardId: z.number().nullable(),
});

export type MoveCardType = z.infer<typeof MoveCardSchema>;
