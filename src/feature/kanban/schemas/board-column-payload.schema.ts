import z from 'zod';

export const BoardColumnPayloadSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(80),
  position: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BoardColumnPayloadType = z.infer<typeof BoardColumnPayloadSchema>;
