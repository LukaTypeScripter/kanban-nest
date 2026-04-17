import z from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginType = z.infer<typeof LoginSchema>;
