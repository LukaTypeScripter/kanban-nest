import z from 'zod';

export const AuthTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type AuthTokenType = z.infer<typeof AuthTokenSchema>;
