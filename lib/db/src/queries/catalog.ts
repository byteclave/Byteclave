import { asc, count, eq } from "drizzle-orm";
import { getDb } from "../index";
import { categories, collections, discoveries, subcategories } from "../schema/index";

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
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      database
        .select({
          categoryId: subcategories.categoryId,
          slug: subcategories.slug,
          name: subcategories.name,
        })
        .from(subcategories)
        .orderBy(asc(subcategories.sortOrder), asc(subcategories.name)),
      database
        .select({
          slug: collections.slug,
          name: collections.name,
          description: collections.description,
        })
        .from(collections)
        .orderBy(asc(collections.name)),
      database
        .select({ value: count() })
        .from(discoveries)
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
