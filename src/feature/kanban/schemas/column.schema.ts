import { z } from 'zod';

export const CreateColumnSchema = z.object({
  title: z.string().min(1).max(80),
  position: z.number().int().nonnegative(),
});

export const UpdateColumnSchema = CreateColumnSchema.partial();

export type CreateColumnType = z.infer<typeof CreateColumnSchema>;
export type UpdateColumnType = z.infer<typeof UpdateColumnSchema>;
