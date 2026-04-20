import z from 'zod';

export const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

export type ResendVerificationType = z.infer<typeof ResendVerificationSchema>;
