import { z } from "zod";
import { roleCodeSchema } from "./common";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use no more than 128 characters.")
  .refine((value) => !/[\u0000-\u0008\u000e-\u001f\u007f]/.test(value), {
    message: "Password contains unsupported control characters.",
  });

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const invitationInputSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["ADMIN", "EDITOR"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
});

export const accountCredentialUpdateSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newEmail: emailSchema.optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((value) => value.newEmail || value.newPassword, {
    message: "Provide a new email address or password.",
  });

export const passwordResetInputSchema = z.object({
  token: z.string().min(32).max(128),
  password: passwordSchema,
});

export const securitySettingsSchema = z.object({
  sessionHours: z.number().int().min(1).max(24),
  maxLoginAttempts: z.number().int().min(5).max(20),
  lockoutMinutes: z.number().int().min(5).max(60),
});

export const roleAssignmentSchema = z.object({
  userId: z.string().uuid(),
  role: roleCodeSchema,
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type InvitationInput = z.infer<typeof invitationInputSchema>;
