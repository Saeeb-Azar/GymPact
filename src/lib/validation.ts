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

export const groupSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt').max(80, 'Höchstens 80 Zeichen'),
});
export type GroupValues = z.infer<typeof groupSchema>;

export const joinGroupSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(4, 'Code zu kurz')
    .max(16, 'Code zu lang')
    .transform((v) => v.toUpperCase()),
});
export type JoinGroupValues = z.infer<typeof joinGroupSchema>;

export const habitDraftSchema = z
  .object({
    name: z.string().trim().min(1, 'Name fehlt').max(80, 'Höchstens 80 Zeichen'),
    type: z.enum(['boolean', 'numeric']),
    targetValue: z
      .union([z.coerce.number().positive('Zielwert muss größer als 0 sein'), z.literal('')])
      .optional(),
    unit: z.string().trim().max(20, 'Höchstens 20 Zeichen').optional(),
    autoRemind: z.boolean(),
  })
  .refine(
    (h) => h.type === 'boolean' || (typeof h.targetValue === 'number' && h.targetValue > 0),
    { path: ['targetValue'], message: 'Numerische Gewohnheiten brauchen einen Zielwert' },
  );
export type HabitDraft = z.infer<typeof habitDraftSchema>;

export const challengeSchema = z
  .object({
    name: z.string().trim().min(1, 'Name fehlt').max(100, 'Höchstens 100 Zeichen'),
    description: z.string().trim().max(1000, 'Höchstens 1000 Zeichen'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Startdatum fehlt'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enddatum fehlt'),
    habits: z.array(habitDraftSchema).min(1, 'Mindestens eine Gewohnheit anlegen'),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Das Enddatum muss nach dem Startdatum liegen',
  });
export type ChallengeValues = z.infer<typeof challengeSchema>;

export const weightSchema = z
  .union([z.coerce.number().min(20, 'Unrealistischer Wert').max(400, 'Unrealistischer Wert'), z.literal('')])
  .optional();

export const noteSchema = z.string().max(500, 'Höchstens 500 Zeichen');

export const reminderMessageSchema = z.string().trim().max(200, 'Höchstens 200 Zeichen');
