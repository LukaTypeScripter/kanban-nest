import z from 'zod';

export const JwtPayloadSchema = z.object({
  sub: z.number(),
  email: z.string().email(),
});

export type JwtPayloadType = z.infer<typeof JwtPayloadSchema>;
