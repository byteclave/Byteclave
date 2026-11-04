import { z } from "zod";
import {
  inspectionObservationResultSchema,
  inspectionRunStatusSchema,
} from "./common";

export const permissionInputSchema = z.object({
  key: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
});

export const mediaInputSchema = z.object({
  discoveryId: z.string().uuid().nullable().optional(),
  storageKey: z.string().trim().min(1).max(1024),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().regex(/^[\w.+-]+\/[\w.+-]+$/),
  sizeBytes: z.number().int().safe().nonnegative(),
  altText: z.string().trim().max(500).nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
});

export const inspectionRunInputSchema = z.object({
  discoveryId: z.string().uuid(),
  status: inspectionRunStatusSchema.default("queued"),
  inspector: z.string().trim().min(1).max(160),
  inspectorVersion: z.string().trim().max(120).optional(),
});

export const inspectionObservationInputSchema = z.object({
  inspectionRunId: z.string().uuid(),
  code: z.string().trim().min(1).max(120),
  result: inspectionObservationResultSchema,
  summary: z.string().trim().min(1).max(500),
  details: z.record(z.string(), z.unknown()).default({}),
});
