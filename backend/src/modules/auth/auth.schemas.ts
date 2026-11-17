import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(250).email('Invalid email address'),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value,'utf8') <= 72,'Password is too long'),
  preferred_language: z.enum(['en', 'te']).optional().default('en'),
});

export const loginSchema = z.object({
  email: z.string().trim().max(250).email('Invalid email address'),
  password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value,'utf8') <= 72,'Password is too long'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
