import z from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export type RegisterType = z.infer<typeof RegisterSchema>;
