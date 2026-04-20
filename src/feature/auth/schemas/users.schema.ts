import z from 'zod';

export const UsersSchema = z.object({
  email: z.string(),
  name: z.string(),
  avatar: z.string().nullish(),
  provider: z.string(),
  emailVerified: z.boolean().default(false),
  password: z.string().nullish(),
});

export type UsersType = z.infer<typeof UsersSchema>;
