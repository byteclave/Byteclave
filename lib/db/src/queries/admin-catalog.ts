import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../index";
import {
  categories,
  collectionDiscoveries,
  collections,
  discoveries,
  discoveryPlacements,
  discoveryTags,
  subcategories,
  tags,
} from "../schema";

export async function getAdminCatalog() {
  const db = getDb();
  const [
    discoveryRows,
    categoryRows,
    subcategoryRows,
    tagRows,
    placementRows,
    discoveryTagRows,
    collectionRows,
    collectionDiscoveryRows,
  ] = await Promise.all([
    db
      .select({
        id: discoveries.id,
        slug: discoveries.slug,
        title: discoveries.title,
        url: discoveries.url,
        summary: discoveries.summary,
        description: discoveries.description,
        status: discoveries.status,
      })
      .from(discoveries)
      .orderBy(desc(discoveries.updatedAt), asc(discoveries.title)),
    db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        sortOrder: categories.sortOrder,
        isVisible: categories.isVisible,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({
        id: subcategories.id,
        categoryId: subcategories.categoryId,
        slug: subcategories.slug,
        name: subcategories.name,
        description: subcategories.description,
        sortOrder: subcategories.sortOrder,
        isVisible: subcategories.isVisible,
      })
      .from(subcategories)
      .orderBy(asc(subcategories.sortOrder), asc(subcategories.name)),
    db
      .select({
        id: tags.id,
        slug: tags.slug,
        name: tags.name,
      })
      .from(tags)
      .orderBy(asc(tags.name)),
    db
      .select({
        discoveryId: discoveryPlacements.discoveryId,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryName: categories.name,
        subcategoryId: subcategories.id,
        subcategorySlug: subcategories.slug,
        subcategoryName: subcategories.name,
        sortOrder: discoveryPlacements.sortOrder,
      })
      .from(discoveryPlacements)
      .innerJoin(categories, eq(discoveryPlacements.categoryId, categories.id))
      .leftJoin(
        subcategories,
        eq(discoveryPlacements.subcategoryId, subcategories.id),
      )
      .orderBy(asc(discoveryPlacements.sortOrder)),
    db
      .select({
        discoveryId: discoveryTags.discoveryId,
        tagId: tags.id,
        slug: tags.slug,
        name: tags.name,
      })
      .from(discoveryTags)
      .innerJoin(tags, eq(discoveryTags.tagId, tags.id))
      .orderBy(asc(tags.name)),
    db
      .select({
        id: collections.id,
        slug: collections.slug,
        name: collections.name,
        description: collections.description,
        sortOrder: collections.sortOrder,
      })
      .from(collections)
      .orderBy(asc(collections.sortOrder), asc(collections.name)),
    db
      .select({
        collectionId: collectionDiscoveries.collectionId,
        discoveryId: collectionDiscoveries.discoveryId,
      })
      .from(collectionDiscoveries)
      .orderBy(asc(collectionDiscoveries.sortOrder)),
  ]);

  const tagsByDiscovery = new Map<string, Array<{ id: string; slug: string; name: string }>>();
  for (const row of discoveryTagRows) {
    const list = tagsByDiscovery.get(row.discoveryId) ?? [];
    if (!list.some((tag) => tag.id === row.tagId)) {
      list.push({ id: row.tagId, slug: row.slug, name: row.name });
    }
    tagsByDiscovery.set(row.discoveryId, list);
  }

  const placementsByDiscovery = new Map<
    string,
    Array<{
      categoryId: string;
      categorySlug: string;
      categoryName: string;
      subcategoryId: string | null;
      subcategorySlug: string | null;
      subcategoryName: string | null;
      sortOrder: number;
    }>
  >();
  const categoryCounts = new Map<string, number>();
  const subcategoryCounts = new Map<string, number>();
  for (const row of placementRows) {
    const list = placementsByDiscovery.get(row.discoveryId) ?? [];
    if (
      !list.some(
        (placement) =>
          placement.categoryId === row.categoryId &&
          placement.subcategoryId === row.subcategoryId,
      )
    ) {
      list.push(row);
    }
    placementsByDiscovery.set(row.discoveryId, list);
    categoryCounts.set(row.categoryId, (categoryCounts.get(row.categoryId) ?? 0) + 1);
    if (row.subcategoryId) {
      subcategoryCounts.set(
        row.subcategoryId,
        (subcategoryCounts.get(row.subcategoryId) ?? 0) + 1,
      );
    }
  }

  const subcategoriesByCategory = new Map<string, typeof subcategoryRows>();
  for (const subcategory of subcategoryRows) {
    const list = subcategoriesByCategory.get(subcategory.categoryId) ?? [];
    list.push(subcategory);
    subcategoriesByCategory.set(subcategory.categoryId, list);
  }

  const categoryList = categoryRows.map((category) => ({
    ...category,
    subcategories: (subcategoriesByCategory.get(category.id) ?? []).map(
      (subcategory) => ({
        ...subcategory,
        discoveryCount: subcategoryCounts.get(subcategory.id) ?? 0,
      }),
    ),
    discoveryCount: categoryCounts.get(category.id) ?? 0,
  }));

  const collectionIds = new Map<string, string[]>();
  for (const row of collectionDiscoveryRows) {
    const list = collectionIds.get(row.collectionId) ?? [];
    list.push(row.discoveryId);
    collectionIds.set(row.collectionId, list);
  }

  const tagCounts = new Map<string, number>();
  for (const row of discoveryTagRows) {
    tagCounts.set(row.tagId, (tagCounts.get(row.tagId) ?? 0) + 1);
  }

  return {
    discoveries: discoveryRows.map((discovery) => ({
      ...discovery,
      tags: tagsByDiscovery.get(discovery.id) ?? [],
      placements: placementsByDiscovery.get(discovery.id) ?? [],
    })),
    categories: categoryList,
    tags: tagRows.map((tag) => ({
      ...tag,
      discoveryCount: tagCounts.get(tag.id) ?? 0,
    })),
    collections: collectionRows.map((collection) => ({
      ...collection,
      discoveryIds: collectionIds.get(collection.id) ?? [],
    })),
  };
}
