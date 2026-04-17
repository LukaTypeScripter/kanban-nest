import z from 'zod';

export const UsersSchema = z.object({
  email: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  password: z.string().optional(),
});

export type UsersType = z.infer<typeof UsersSchema>;
