import { z } from 'zod';

export const MoveCardSchema = z.object({
  positionIndex: z.number(),
  fromColumnId: z.number(),
  fromPositionIndex: z.number(),
});

export type MoveCardType = z.infer<typeof MoveCardSchema>;
