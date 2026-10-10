import { z } from "zod";
import { roleCodeSchema } from "./common";

export const userInputSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  displayName: z.string().trim().min(1).max(120),
});

export const userRoleChangeSchema = z.object({
  userId: z.string().uuid(),
  roles: z
    .array(roleCodeSchema)
    .min(1)
    .max(3)
    .refine((roles) => new Set(roles).size === roles.length, {
      message: "A role may only be assigned once.",
    }),
});

export type UserInput = z.input<typeof userInputSchema>;
export type ValidatedUserInput = z.output<typeof userInputSchema>;
