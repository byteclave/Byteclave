import {
  categoryInputSchema,
  collectionInputSchema,
  discoveryInputSchema,
  subcategoryInputSchema,
  tagInputSchema,
  type CategoryInput,
  type CollectionInput,
  type ValidatedDiscoveryInput,
  type ValidatedSubcategoryInput,
  type ValidatedTagInput,
} from "./schemas/catalog";
import { catalogSeed, type CatalogSeed } from "./seed-data";

export interface SeedRecord {
  id: string;
  slug: string;
}

export interface CatalogSeedRepository {
  upsertCategory(input: ReturnType<typeof categoryInputSchema.parse>): Promise<SeedRecord>;
  upsertSubcategory(
    input: ValidatedSubcategoryInput,
  ): Promise<SeedRecord>;
  upsertDiscovery(input: ValidatedDiscoveryInput): Promise<SeedRecord>;
  upsertTag(input: ValidatedTagInput): Promise<SeedRecord>;
  upsertCollection(
    input: ReturnType<typeof collectionInputSchema.parse>,
  ): Promise<SeedRecord>;
  ensurePlacement(input: {
    discoveryId: string;
    categoryId: string;
    subcategoryId: string | null;
    sortOrder: number;
  }): Promise<void>;
  ensureDiscoveryTag(input: {
    discoveryId: string;
    tagId: string;
  }): Promise<void>;
  ensureCollectionDiscovery(input: {
    collectionId: string;
    discoveryId: string;
    sortOrder: number;
  }): Promise<void>;
  publishDiscovery(discoveryId: string): Promise<void>;
}

export async function seedCatalog(
  repository: CatalogSeedRepository,
  seed: CatalogSeed = catalogSeed,
): Promise<void> {
  const categoriesBySlug = new Map<string, SeedRecord>();
  const subcategoriesByKey = new Map<string, SeedRecord>();
  const discoveriesBySlug = new Map<string, SeedRecord>();
  const tagsBySlug = new Map<string, SeedRecord>();

  for (const category of seed.categories) {
    const { subcategories, ...input } = category;
    const categoryRecord = await repository.upsertCategory(
      categoryInputSchema.parse(input),
    );
    categoriesBySlug.set(categoryRecord.slug, categoryRecord);

    for (const subcategory of subcategories) {
      const record = await repository.upsertSubcategory(
        subcategoryInputSchema.parse({
          ...subcategory,
          categoryId: categoryRecord.id,
        }),
      );
      subcategoriesByKey.set(
        `${categoryRecord.slug}/${record.slug}`,
        record,
      );
    }
  }

  for (const tag of seed.tags) {
    const record = await repository.upsertTag(tagInputSchema.parse(tag));
    tagsBySlug.set(record.slug, record);
  }

  for (const discovery of seed.discoveries) {
    const { tags, placements, publish, ...input } = discovery;
    const record = await repository.upsertDiscovery(
      discoveryInputSchema.parse(input),
    );
    discoveriesBySlug.set(record.slug, record);

    for (const placement of placements) {
      const categoryRecord = categoriesBySlug.get(placement.categorySlug);
      if (!categoryRecord) {
        throw new Error(
          `Seed discovery "${record.slug}" references missing category "${placement.categorySlug}".`,
        );
      }

      let subcategoryId: string | null = null;
      if (placement.subcategorySlug) {
        const subcategoryRecord = subcategoriesByKey.get(
          `${placement.categorySlug}/${placement.subcategorySlug}`,
        );
        if (!subcategoryRecord) {
          throw new Error(
            `Seed discovery "${record.slug}" references missing subcategory "${placement.categorySlug}/${placement.subcategorySlug}".`,
          );
        }
        subcategoryId = subcategoryRecord.id;
      }

      await repository.ensurePlacement({
        discoveryId: record.id,
        categoryId: categoryRecord.id,
        subcategoryId,
        sortOrder: placement.sortOrder ?? 0,
      });
    }

    for (const tagSlug of tags) {
      const tagRecord = tagsBySlug.get(tagSlug);
      if (!tagRecord) {
        throw new Error(
          `Seed discovery "${record.slug}" references missing tag "${tagSlug}".`,
        );
      }
      await repository.ensureDiscoveryTag({
        discoveryId: record.id,
        tagId: tagRecord.id,
      });
    }

    if (publish) {
      await repository.publishDiscovery(record.id);
    }
  }

  for (const collection of seed.collections) {
    const { discoveries, ...input } = collection;
    const record = await repository.upsertCollection(
      collectionInputSchema.parse(input),
    );
    for (const [sortOrder, discoverySlug] of discoveries.entries()) {
      const discoveryRecord = discoveriesBySlug.get(discoverySlug);
      if (!discoveryRecord) {
        throw new Error(
          `Seed collection "${record.slug}" references missing discovery "${discoverySlug}".`,
        );
      }
      await repository.ensureCollectionDiscovery({
        collectionId: record.id,
        discoveryId: discoveryRecord.id,
        sortOrder,
      });
    }
  }
}

export type { CategoryInput, CollectionInput };
