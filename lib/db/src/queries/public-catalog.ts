import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import { getDb } from "../index";
import {
  categories,
  collectionDiscoveries,
  collections,
  discoveries,
  discoveryPlacements,
  discoveryTags,
  inspectionObservations,
  inspectionRuns,
  subcategories,
  tags,
} from "../schema";

export interface PublishedDiscovery {
  id: string;
  slug: string;
  title: string;
  url: string;
  summary: string | null;
  description: string | null;
  status: "published";
  tags: Array<{ id: string; slug: string; name: string }>;
  placements: Array<{
    categoryId: string;
    categorySlug: string;
    categoryName: string;
    subcategoryId: string | null;
    subcategorySlug: string | null;
    subcategoryName: string | null;
    sortOrder: number;
  }>;
}

export interface InspectionDetails {
  id: string;
  status: string;
  inspector: string;
  inspectorVersion: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  observations: Array<{
    code: string;
    result: string;
    summary: string;
    details: Record<string, unknown>;
  }>;
}

async function loadPublishedDiscoveries(
  discoveryIds: string[],
): Promise<PublishedDiscovery[]> {
  const ids = [...new Set(discoveryIds)];
  if (ids.length === 0) return [];

  const rows = await getDb()
    .select({
      id: discoveries.id,
      slug: discoveries.slug,
      title: discoveries.title,
      url: discoveries.url,
      summary: discoveries.summary,
      description: discoveries.description,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategoryId: subcategories.id,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name,
      placementSortOrder: discoveryPlacements.sortOrder,
      tagId: tags.id,
      tagSlug: tags.slug,
      tagName: tags.name,
    })
    .from(discoveries)
    .leftJoin(
      discoveryPlacements,
      eq(discoveryPlacements.discoveryId, discoveries.id),
    )
    .leftJoin(categories, eq(discoveryPlacements.categoryId, categories.id))
    .leftJoin(
      subcategories,
      eq(discoveryPlacements.subcategoryId, subcategories.id),
    )
    .leftJoin(discoveryTags, eq(discoveryTags.discoveryId, discoveries.id))
    .leftJoin(tags, eq(discoveryTags.tagId, tags.id))
    .where(
      and(
        eq(discoveries.status, "published"),
        inArray(discoveries.id, ids),
        or(isNull(categories.id), eq(categories.isVisible, true)),
        or(isNull(subcategories.id), eq(subcategories.isVisible, true)),
      ),
    )
    .orderBy(asc(discoveries.title), asc(discoveryPlacements.sortOrder));

  const byId = new Map<string, PublishedDiscovery>();
  for (const row of rows) {
    let discovery = byId.get(row.id);
    if (!discovery) {
      discovery = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        url: row.url,
        summary: row.summary,
        description: row.description,
        status: "published",
        tags: [],
        placements: [],
      };
      byId.set(row.id, discovery);
    }

    if (row.tagId && row.tagSlug && row.tagName && !discovery.tags.some((tag) => tag.id === row.tagId)) {
      discovery.tags.push({ id: row.tagId, slug: row.tagSlug, name: row.tagName });
    }

    if (
      row.categorySlug &&
      row.categoryName &&
      row.categoryId &&
      !discovery.placements.some(
        (placement) =>
          placement.categoryId === row.categoryId &&
          placement.subcategoryId === row.subcategoryId,
      )
    ) {
      discovery.placements.push({
        categoryId: row.categoryId,
        categorySlug: row.categorySlug,
        categoryName: row.categoryName,
        subcategoryId: row.subcategoryId,
        subcategorySlug: row.subcategorySlug,
        subcategoryName: row.subcategoryName,
        sortOrder: row.placementSortOrder ?? 0,
      });
    }
  }
  return [...byId.values()];
}

async function getPublishedIdsForPlacement(input: {
  categoryId: string;
  subcategoryId?: string;
}) {
  const isCategoryRoot = input.subcategoryId === undefined;
  const placementCondition = isCategoryRoot
    ? isNull(discoveryPlacements.subcategoryId)
    : eq(discoveryPlacements.subcategoryId, input.subcategoryId!);
  const rows = await getDb()
    .select({
      id: discoveries.id,
      title: discoveries.title,
    })
    .from(discoveries)
    .innerJoin(
      discoveryPlacements,
      eq(discoveryPlacements.discoveryId, discoveries.id),
    )
    .where(
      and(
        eq(discoveries.status, "published"),
        eq(discoveryPlacements.categoryId, input.categoryId),
        placementCondition,
      ),
    )
    .orderBy(asc(discoveries.title));
  return rows.map((row) => row.id);
}

async function getPublishedCollectionIds(collectionId: string) {
  const rows = await getDb()
    .select({ id: discoveries.id, sortOrder: collectionDiscoveries.sortOrder })
    .from(collectionDiscoveries)
    .innerJoin(discoveries, eq(collectionDiscoveries.discoveryId, discoveries.id))
    .where(
      and(
        eq(collectionDiscoveries.collectionId, collectionId),
        eq(discoveries.status, "published"),
      ),
    )
    .orderBy(asc(collectionDiscoveries.sortOrder), asc(discoveries.title));
  return rows.map((row) => row.id);
}

function orderedByIds(items: PublishedDiscovery[], ids: string[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });
}

export async function getCategoryPageData(categorySlug: string) {
  const database = getDb();
  const [category] = await database
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
    })
    .from(categories)
    .where(and(eq(categories.slug, categorySlug), eq(categories.isVisible, true)))
    .limit(1);
  if (!category) return null;

  const subcategoryRows = await database
    .select({
      id: subcategories.id,
      slug: subcategories.slug,
      name: subcategories.name,
      description: subcategories.description,
    })
    .from(subcategories)
    .where(and(eq(subcategories.categoryId, category.id), eq(subcategories.isVisible, true)))
    .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));
  const ids = await getPublishedIdsForPlacement({ categoryId: category.id });
  const discoveriesInCategory = await loadPublishedDiscoveries(ids);

  return {
    category,
    subcategories: subcategoryRows,
    discoveries: orderedByIds(discoveriesInCategory, ids),
  };
}

export async function getSubcategoryPageData(
  categorySlug: string,
  subcategorySlug: string,
) {
  const [subcategory] = await getDb()
    .select({
      id: subcategories.id,
      slug: subcategories.slug,
      name: subcategories.name,
      description: subcategories.description,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(subcategories)
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .where(
      and(
        eq(categories.slug, categorySlug),
        eq(subcategories.slug, subcategorySlug),
        eq(categories.isVisible, true),
        eq(subcategories.isVisible, true),
      ),
    )
    .limit(1);
  if (!subcategory) return null;

  const ids = await getPublishedIdsForPlacement({
    categoryId: subcategory.categoryId,
    subcategoryId: subcategory.id,
  });
  const items = await loadPublishedDiscoveries(ids);

  return {
    category: {
      slug: subcategory.categorySlug,
      name: subcategory.categoryName,
    },
    subcategory: {
      slug: subcategory.slug,
      name: subcategory.name,
      description: subcategory.description,
    },
    discoveries: orderedByIds(items, ids),
  };
}

export async function getCollectionPageData(collectionSlug: string) {
  const [collection] = await getDb()
    .select({
      id: collections.id,
      slug: collections.slug,
      name: collections.name,
      description: collections.description,
    })
    .from(collections)
    .where(eq(collections.slug, collectionSlug))
    .limit(1);
  if (!collection) return null;

  const ids = await getPublishedCollectionIds(collection.id);
  const items = await loadPublishedDiscoveries(ids);
  return { collection, discoveries: orderedByIds(items, ids) };
}

export async function getDiscoveryPageData(discoverySlug: string) {
  const [row] = await getDb()
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.slug, discoverySlug),
        eq(discoveries.status, "published"),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [discovery] = await loadPublishedDiscoveries([row.id]);
  if (!discovery) return null;

  const [run] = await getDb()
    .select({
      id: inspectionRuns.id,
      status: inspectionRuns.status,
      inspector: inspectionRuns.inspector,
      inspectorVersion: inspectionRuns.inspectorVersion,
      startedAt: inspectionRuns.startedAt,
      completedAt: inspectionRuns.completedAt,
    })
    .from(inspectionRuns)
    .where(eq(inspectionRuns.discoveryId, discovery.id))
    .orderBy(desc(inspectionRuns.createdAt))
    .limit(1);

  let inspection: InspectionDetails | null = null;
  if (run) {
    const observations = await getDb()
      .select({
        code: inspectionObservations.code,
        result: inspectionObservations.result,
        summary: inspectionObservations.summary,
        details: inspectionObservations.details,
      })
      .from(inspectionObservations)
      .where(eq(inspectionObservations.inspectionRunId, run.id))
      .orderBy(asc(inspectionObservations.createdAt));
    inspection = { ...run, observations };
  }

  return { discovery, inspection };
}

export async function searchPublishedDiscoveries(query: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  const escaped = cleanQuery
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const pattern = `%${escaped}%`;
  const conditions = [
    ilike(discoveries.title, pattern),
    ilike(discoveries.url, pattern),
    ilike(discoveries.summary, pattern),
    ilike(discoveries.description, pattern),
    and(eq(categories.isVisible, true), ilike(categories.name, pattern)),
    and(eq(subcategories.isVisible, true), ilike(subcategories.name, pattern)),
    ilike(tags.name, pattern),
    ilike(collections.name, pattern),
  ];
  const rows = await getDb()
    .selectDistinct({
      id: discoveries.id,
      title: discoveries.title,
    })
    .from(discoveries)
    .leftJoin(
      discoveryPlacements,
      eq(discoveryPlacements.discoveryId, discoveries.id),
    )
    .leftJoin(categories, eq(discoveryPlacements.categoryId, categories.id))
    .leftJoin(
      subcategories,
      eq(discoveryPlacements.subcategoryId, subcategories.id),
    )
    .leftJoin(discoveryTags, eq(discoveryTags.discoveryId, discoveries.id))
    .leftJoin(tags, eq(discoveryTags.tagId, tags.id))
    .leftJoin(
      collectionDiscoveries,
      eq(collectionDiscoveries.discoveryId, discoveries.id),
    )
    .leftJoin(
      collections,
      eq(collectionDiscoveries.collectionId, collections.id),
    )
    .where(
      and(
        eq(discoveries.status, "published"),
        or(...conditions),
      ),
    )
    .orderBy(asc(discoveries.title));
  const ids = rows.map((row) => row.id);
  const results = await loadPublishedDiscoveries(ids);
  return orderedByIds(results, ids);
}
