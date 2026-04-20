import z from 'zod';

export const AccessTokenPayloadSchema = z.object({
  sub: z.number(),
  email: z.string().email(),
  emailVerified: z.boolean(),
});

export const JwtPayloadSchema = AccessTokenPayloadSchema.extend({
  jti: z.string(),
});

export type JwtPayloadType = z.infer<typeof JwtPayloadSchema>;
