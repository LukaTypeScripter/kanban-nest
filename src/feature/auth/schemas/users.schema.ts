import z from 'zod';

export const UsersSchema = z.object({
  email: z.string(),
  name: z.string(),
  avatar: z.string().nullish(),
  password: z.string().nullish(),
});

export type UsersType = z.infer<typeof UsersSchema>;
