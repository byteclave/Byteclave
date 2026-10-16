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
  tags: Array<{ slug: string; name: string }>;
  placements: Array<{
    categorySlug: string;
    categoryName: string;
    subcategorySlug: string | null;
    subcategoryName: string | null;
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
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name,
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
        tags: [],
        placements: [],
      };
      byId.set(row.id, discovery);
    }

    if (row.tagSlug && row.tagName && !discovery.tags.some((tag) => tag.slug === row.tagSlug)) {
      discovery.tags.push({ slug: row.tagSlug, name: row.tagName });
    }

    if (
      row.categorySlug &&
      row.categoryName &&
      !discovery.placements.some(
        (placement) =>
          placement.categorySlug === row.categorySlug &&
          placement.subcategorySlug === row.subcategorySlug,
      )
    ) {
      discovery.placements.push({
        categorySlug: row.categorySlug,
        categoryName: row.categoryName,
        subcategorySlug: row.subcategorySlug,
        subcategoryName: row.subcategoryName,
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
    .where(eq(categories.slug, categorySlug))
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
    .where(eq(subcategories.categoryId, category.id))
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
    ilike(categories.name, pattern),
    ilike(subcategories.name, pattern),
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
