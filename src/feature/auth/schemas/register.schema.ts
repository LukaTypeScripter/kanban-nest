import z from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

export type RegisterType = z.infer<typeof RegisterSchema>;
