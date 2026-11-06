import { z } from "zod";
import {
  inspectionObservationResultSchema,
  inspectionRunStatusSchema,
  publishingStatusSchema,
} from "./common";

export const publishingTransitionInputSchema = z.object({
  discoveryId: z.string().uuid(),
  nextStatus: publishingStatusSchema,
  note: z.string().trim().max(2000).optional(),
});

export const contentVersionInputSchema = z.object({
  entityType: z.enum(["discovery", "category", "subcategory", "tag", "collection"]),
  entityId: z.string().uuid(),
  action: z.enum(["created", "updated", "deleted", "restored"]),
  snapshot: z.record(z.string(), z.unknown()),
});

export const publishingRecordInputSchema = z.object({
  discoveryId: z.string().uuid(),
  fromStatus: publishingStatusSchema.nullable(),
  toStatus: publishingStatusSchema,
  note: z.string().trim().max(2000).optional(),
});

export const publishingActionSchema = z.enum([
  "submit_for_review",
  "approve",
  "reject",
  "unpublish",
  "archive",
  "restore",
]);

export const publishingActionInputSchema = z.object({
  action: publishingActionSchema,
  note: z.string().trim().max(2000).optional(),
});

export const contentVersionEntitySchema = z.enum([
  "discovery",
  "category",
  "subcategory",
  "tag",
  "collection",
]);

export const mediaUploadRequestSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(
        /^(?!\.)(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._ ()-]*$/u,
        "Use a plain filename without folders or special characters.",
      ),
    contentType: z.enum([
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
    ]),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  })
  .superRefine((file, context) => {
    const extension = file.fileName.split(".").pop()?.toLowerCase() ?? "";
    const extensionsByType: Record<string, string[]> = {
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/webp": ["webp"],
      "application/pdf": ["pdf"],
    };
    if (!extensionsByType[file.contentType]?.includes(extension)) {
      context.addIssue({
        code: "custom",
        path: ["fileName"],
        message: "The filename extension must match the selected file type.",
      });
    }
  });

export const mediaAssignmentSchema = z.object({
  discoveryId: z.string().uuid().nullable(),
  altText: z.string().trim().max(500).nullable(),
});

export const appearanceSettingsSchema = z.object({
  homepageEyebrow: z.string().trim().min(1).max(120),
  homepageHeadline: z.string().trim().min(1).max(180),
  homepageDescription: z.string().trim().min(1).max(500),
  footerText: z.string().trim().min(1).max(180),
});

export const auditLogInputSchema = z.object({
  actorUserId: z.string().uuid().nullable().optional(),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  changes: z.record(z.string(), z.unknown()).default({}),
});
