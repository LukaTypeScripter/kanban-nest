import z from 'zod';

export const GoogleProfileSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  picture: z.string().url(),
  accessToken: z.string(),
});

export type GoogleProfile = z.infer<typeof GoogleProfileSchema>;
