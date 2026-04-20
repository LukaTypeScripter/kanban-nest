import z from 'zod';

export const EmailVerificationSchema = z.object({
  userId: z.number(),
  tokenHash: z.string(),
  expiresAt: z.date(),
});

export type EmailVerificationType = z.infer<typeof EmailVerificationSchema>;
