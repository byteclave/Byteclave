import { z } from "zod";
import {
  inspectionObservationResultSchema,
  inspectionRunStatusSchema,
  publishingStatusSchema,
} from "./common";

export const publishingTransitionInputSchema = z.object({
  discoveryId: z.string().uuid(),
  nextStatus: publishingStatusSchema,
  actorUserId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const contentVersionInputSchema = z.object({
  discoveryId: z.string().uuid(),
  snapshot: z.record(z.string(), z.unknown()),
});

export const publishingRecordInputSchema = z.object({
  discoveryId: z.string().uuid(),
  fromStatus: publishingStatusSchema.nullable(),
  toStatus: publishingStatusSchema,
  actorUserId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const auditLogInputSchema = z.object({
  actorUserId: z.string().uuid().nullable().optional(),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  changes: z.record(z.string(), z.unknown()).default({}),
});
