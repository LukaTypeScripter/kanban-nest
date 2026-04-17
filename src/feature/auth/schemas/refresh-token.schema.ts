import z from 'zod';

export const RefreshTokenSchema = z.object({
  userId: z.number(),
  token: z.string(),
  expiresAt: z.date(),
});

export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>;
