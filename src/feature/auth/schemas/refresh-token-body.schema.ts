import z from 'zod';

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string(),
});

export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>;
