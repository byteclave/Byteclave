import { and, asc, countDistinct, eq } from "drizzle-orm";
import { getDb } from "../index";
import {
  categories,
  collectionDiscoveries,
  collections,
  discoveries,
  discoveryPlacements,
  subcategories,
} from "../schema/index";

export async function getExploreCatalog() {
  const database = getDb();
  const [categoryRows, subcategoryRows, collectionRows, publishedRows] =
    await Promise.all([
      database
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
        })
        .from(categories)
        .where(eq(categories.isVisible, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      database
        .select({
          categoryId: subcategories.categoryId,
          slug: subcategories.slug,
          name: subcategories.name,
        })
        .from(subcategories)
        .where(eq(subcategories.isVisible, true))
        .orderBy(asc(subcategories.sortOrder), asc(subcategories.name)),
      database
        .select({
          slug: collections.slug,
          name: collections.name,
          description: collections.description,
          publishedDiscoveryCount: countDistinct(discoveries.id),
        })
        .from(collections)
        .leftJoin(
          collectionDiscoveries,
          eq(collectionDiscoveries.collectionId, collections.id),
        )
        .leftJoin(
          discoveries,
          and(
            eq(collectionDiscoveries.discoveryId, discoveries.id),
            eq(discoveries.status, "published"),
          ),
        )
        .groupBy(collections.id)
        .orderBy(asc(collections.sortOrder), asc(collections.name)),
      database
        .select({ value: countDistinct(discoveries.id) })
        .from(discoveries)
        .innerJoin(
          discoveryPlacements,
          eq(discoveryPlacements.discoveryId, discoveries.id),
        )
        .where(eq(discoveries.status, "published")),
    ]);

  return {
    categories: categoryRows.map((category) => ({
      ...category,
      subcategories: subcategoryRows
        .filter((subcategory) => subcategory.categoryId === category.id)
        .map(({ slug, name }) => ({ slug, name })),
    })),
    collections: collectionRows,
    publishedDiscoveryCount: publishedRows[0]?.value ?? 0,
  };
}
