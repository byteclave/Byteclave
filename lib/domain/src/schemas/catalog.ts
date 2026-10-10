import { z } from "zod";
import { resourceUrlSchema, slugSchema } from "./common";

export const categoryInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

export const subcategoryInputSchema = z.object({
  categoryId: z.string().uuid(),
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

export const discoveryInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(500).optional(),
  description: z.string().trim().max(10_000).optional(),
  url: resourceUrlSchema,
});

export const discoveryPlacementInputSchema = z.object({
  discoveryId: z.string().uuid(),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

export const tagInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(80),
});

export const collectionInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
});

export const applicationSettingInputSchema = z.object({
  key: z.string().trim().min(1).max(160),
  value: z.unknown(),
});

export type CategoryInput = z.input<typeof categoryInputSchema>;
export type ValidatedCategoryInput = z.output<typeof categoryInputSchema>;
export type SubcategoryInput = z.input<typeof subcategoryInputSchema>;
export type ValidatedSubcategoryInput = z.output<typeof subcategoryInputSchema>;
export type DiscoveryInput = z.input<typeof discoveryInputSchema>;
export type ValidatedDiscoveryInput = z.output<typeof discoveryInputSchema>;
export type DiscoveryPlacementInput = z.input<
  typeof discoveryPlacementInputSchema
>;
export type ValidatedDiscoveryPlacementInput = z.output<
  typeof discoveryPlacementInputSchema
>;
export type TagInput = z.input<typeof tagInputSchema>;
export type ValidatedTagInput = z.output<typeof tagInputSchema>;
export type CollectionInput = z.input<typeof collectionInputSchema>;
