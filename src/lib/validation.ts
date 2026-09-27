// Zod-Schemata für alle Formulare. Die serverseitige Validierung
// (Constraints, Trigger, RPCs) bleibt davon unabhängig bestehen.

import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-Mail-Adresse fehlt')
  .email('Bitte eine gültige E-Mail-Adresse eingeben');

export const passwordSchema = z
  .string()
  .min(8, 'Mindestens 8 Zeichen')
  .max(72, 'Höchstens 72 Zeichen');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Passwort fehlt'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Mindestens 2 Zeichen').max(60, 'Höchstens 60 Zeichen'),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Die Passwörter stimmen nicht überein',
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Die Passwörter stimmen nicht überein',
  });
export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'Mindestens 2 Zeichen').max(60, 'Höchstens 60 Zeichen'),
  timezone: z.string().min(1, 'Zeitzone fehlt').max(64),
});
export type ProfileValues = z.infer<typeof profileSchema>;
