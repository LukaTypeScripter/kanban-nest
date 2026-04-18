import z from 'zod';

export const JwtPayloadSchema = z.object({
  sub: z.number(),
  email: z.string().email(),
  jti: z.string(),
});

export type JwtPayloadType = z.infer<typeof JwtPayloadSchema>;
