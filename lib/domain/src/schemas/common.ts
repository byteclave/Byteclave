import { z } from "zod";
import { normalizeResourceUrl } from "../url";

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL-safe slug.");

export const resourceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .transform((value, context) => {
    try {
      return normalizeResourceUrl(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "The resource URL is invalid.",
      });
      return z.NEVER;
    }
  });

export const roleCodeSchema = z.enum(["OWNER", "ADMIN", "EDITOR"]);
export const publishingStatusSchema = z.enum([
  "draft",
  "review",
  "published",
  "archived",
]);
export const inspectionRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);
export const inspectionObservationResultSchema = z.enum([
  "pass",
  "warning",
  "fail",
  "not_applicable",
]);

export type RoleCode = z.infer<typeof roleCodeSchema>;
export type PublishingStatus = z.infer<typeof publishingStatusSchema>;
