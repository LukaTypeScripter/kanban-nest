import { z } from 'zod';

export const BuildTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  hashedRefreshToken: z.string(),
  jti: z.string(),
});

export type BuildTokenType = z.infer<typeof BuildTokenSchema>;
