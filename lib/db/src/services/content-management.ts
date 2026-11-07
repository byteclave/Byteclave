import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import {
  normalizeResourceUrl,
  slugSchema,
  type PublishingStatus,
} from "@workspace/domain";
import {
  assertPublishingTransition,
  getAllowedPublishingTransitions,
} from "@workspace/domain/services";
import { getDb } from "../index";
import { getAdminCatalog } from "../queries/admin-catalog";
import {
  auditLogs,
  categories,
  collectionDiscoveries,
  collections,
  discoveries,
  discoveryPlacements,
  discoveryTags,
  entityContentVersions,
  media,
  publishingRecords,
  subcategories,
  tags,
} from "../schema";

export class ContentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentConflictError";
  }
}

export class ContentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentNotFoundError";
  }
}

export class InvalidContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidContentError";
  }
}

type PlacementInput = {
  categoryId: string;
  subcategoryId?: string | null;
  sortOrder: number;
};

type DiscoveryInput = {
  slug?: string;
  title: string;
  url: string;
  summary?: string | null;
  description?: string | null;
  tags: string[];
  placements: PlacementInput[];
};

type CategoryInput = {
  slug?: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isVisible: boolean;
};

type SubcategoryInput = CategoryInput & { categoryId: string };
type CollectionInput = {
  slug?: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  discoveryIds: string[];
};

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizedTagName(value: string): string {
  return normalizedText(value).toLocaleLowerCase("en-US");
}

function toSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return slug || "discovery";
}

function optionalText(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  requested?: string,
): Promise<string> {
  if (requested?.trim()) {
    const slug = slugSchema.parse(requested);
    if (await isTaken(slug)) throw new ContentConflictError("That slug is already in use.");
    return slug;
  }

  const candidateBase = slugSchema.parse(toSlug(base));
  if (!(await isTaken(candidateBase))) return candidateBase;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${candidateBase.slice(0, 120 - ending.length)}${ending}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new ContentConflictError("A unique slug could not be generated.");
}

async function uniqueTagSlug(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  name: string,
): Promise<string> {
  return uniqueSlug(name, async (candidate) => {
    const [row] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, candidate))
      .limit(1);
    return Boolean(row);
  });
}

async function addOrReuseTag(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  rawName: string,
): Promise<{ id: string }> {
  const name = normalizedText(rawName);
  const normalizedName = normalizedTagName(name);
  const [existing] = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.normalizedName, normalizedName))
    .limit(1);
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = await uniqueTagSlug(tx, name);
    const [created] = await tx
      .insert(tags)
      .values({ name, normalizedName, slug })
      .onConflictDoNothing()
      .returning({ id: tags.id });
    if (created) return created;

    const [reused] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.normalizedName, normalizedName))
      .limit(1);
    if (reused) return reused;
  }
  throw new ContentConflictError("The tag could not be created safely.");
}

async function replaceDiscoveryTags(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  discoveryId: string,
  names: string[],
): Promise<void> {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rawName of names) {
    const name = normalizedText(rawName);
    if (!name) continue;
    const normalizedName = normalizedTagName(name);
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    ids.push((await addOrReuseTag(tx, name)).id);
  }

  await tx.delete(discoveryTags).where(eq(discoveryTags.discoveryId, discoveryId));
  if (ids.length > 0) {
    await tx.insert(discoveryTags).values(
      ids.map((tagId) => ({ discoveryId, tagId })),
    );
  }
}

async function replaceDiscoveryPlacements(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  discoveryId: string,
  placements: PlacementInput[],
): Promise<void> {
  const seen = new Set<string>();
  for (const placement of placements) {
    const subcategoryId = placement.subcategoryId ?? null;
    const key = `${placement.categoryId}:${subcategoryId ?? "root"}`;
    if (seen.has(key)) {
      throw new ContentConflictError(
        "A discovery cannot be placed twice in the same category or subcategory.",
      );
    }
    seen.add(key);

    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, placement.categoryId))
      .limit(1);
    if (!category) throw new ContentNotFoundError("The selected category no longer exists.");

    if (subcategoryId) {
      const [subcategory] = await tx
        .select({ id: subcategories.id })
        .from(subcategories)
        .where(
          and(
            eq(subcategories.id, subcategoryId),
            eq(subcategories.categoryId, placement.categoryId),
          ),
        )
        .limit(1);
      if (!subcategory) {
        throw new InvalidContentError(
          "Each subcategory placement must belong to its selected category.",
        );
      }
    }
  }

  await tx
    .delete(discoveryPlacements)
    .where(eq(discoveryPlacements.discoveryId, discoveryId));
  if (placements.length > 0) {
    await tx.insert(discoveryPlacements).values(
      placements.map((placement) => ({
        discoveryId,
        categoryId: placement.categoryId,
        subcategoryId: placement.subcategoryId ?? null,
        sortOrder: placement.sortOrder,
      })),
    );
  }
}

async function replaceDiscoveryMedia(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  discoveryId: string,
  mediaIds: string[],
): Promise<void> {
  const requestedIds = [...new Set(mediaIds)];
  const current = await tx
    .select({ id: media.id })
    .from(media)
    .where(eq(media.discoveryId, discoveryId))
    .for("update");
  const requested = requestedIds.length
    ? await tx
        .select({ id: media.id, discoveryId: media.discoveryId })
        .from(media)
        .where(inArray(media.id, requestedIds))
        .for("update")
    : [];
  if (requested.length !== requestedIds.length) {
    throw new ContentConflictError(
      "A media asset from this version no longer exists.",
    );
  }
  if (
    requested.some(
      (asset) => asset.discoveryId !== null && asset.discoveryId !== discoveryId,
    )
  ) {
    throw new ContentConflictError(
      "A media asset from this version is attached to different content.",
    );
  }
  const requestedSet = new Set(requestedIds);
  const now = new Date();
  for (const asset of current) {
    if (!requestedSet.has(asset.id)) {
      await tx
        .update(media)
        .set({ discoveryId: null, updatedAt: now })
        .where(eq(media.id, asset.id));
    }
  }
  for (const asset of requested) {
    if (asset.discoveryId !== discoveryId) {
      await tx
        .update(media)
        .set({ discoveryId, updatedAt: now })
        .where(eq(media.id, asset.id));
    }
  }
}

export async function recordContentAudit(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    actorUserId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    changes?: Record<string, unknown>;
    sourceVersionId?: string;
  },
): Promise<void> {
  const versionEntityTypes = new Set([
    "discovery",
    "category",
    "subcategory",
    "tag",
    "collection",
  ]);
  const actionName = input.action.split(".").at(-1);
  const versionAction =
    actionName === "created" || actionName === "deleted" ||
    actionName === "restored" || actionName === "updated"
      ? actionName
      : input.entityType === "discovery" &&
          input.action.startsWith("publishing.discovery.")
        ? "updated"
        : null;
  let changes = input.changes ?? {};
  if (versionAction && versionEntityTypes.has(input.entityType)) {
    const snapshot = await readContentSnapshot(
      tx,
      input.entityType,
      input.entityId,
    );
    if (snapshot) {
      const [previous] = await tx
        .select({ snapshot: entityContentVersions.snapshot })
        .from(entityContentVersions)
        .where(
          and(
            eq(entityContentVersions.entityType, input.entityType),
            eq(entityContentVersions.entityId, input.entityId),
          ),
        )
        .orderBy(desc(entityContentVersions.createdAt))
        .limit(1);
      const before =
        Object.prototype.hasOwnProperty.call(input.changes ?? {}, "before")
          ? input.changes?.before ?? null
          : versionAction === "created"
            ? null
            : versionAction === "deleted"
              ? snapshot
              : previous?.snapshot ?? null;
      const after = versionAction === "deleted" ? null : snapshot;
      await tx.insert(entityContentVersions).values({
        entityType: input.entityType,
        entityId: input.entityId,
        action: versionAction,
        snapshot,
        sourceVersionId: input.sourceVersionId ?? null,
        actorUserId: input.actorUserId,
      });
      changes = { ...changes, before, after };
    }
  }
  await tx.insert(auditLogs).values({
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    changes,
  });
}

const recordAudit = recordContentAudit;

async function readContentSnapshot(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  if (entityType === "discovery") {
    const [row] = await tx
      .select()
      .from(discoveries)
      .where(eq(discoveries.id, entityId))
      .limit(1);
    if (!row) return null;
    const [tagRows, placementRows, mediaRows] = await Promise.all([
      tx
        .select({
          id: tags.id,
          slug: tags.slug,
          name: tags.name,
        })
        .from(discoveryTags)
        .innerJoin(tags, eq(discoveryTags.tagId, tags.id))
        .where(eq(discoveryTags.discoveryId, entityId))
        .orderBy(asc(tags.name)),
      tx
        .select({
          categoryId: discoveryPlacements.categoryId,
          subcategoryId: discoveryPlacements.subcategoryId,
          sortOrder: discoveryPlacements.sortOrder,
        })
        .from(discoveryPlacements)
        .where(eq(discoveryPlacements.discoveryId, entityId))
        .orderBy(asc(discoveryPlacements.sortOrder)),
      tx
        .select({
          id: media.id,
          storageKey: media.storageKey,
          fileName: media.fileName,
          contentType: media.contentType,
          sizeBytes: media.sizeBytes,
          altText: media.altText,
        })
        .from(media)
        .where(eq(media.discoveryId, entityId))
        .orderBy(asc(media.createdAt)),
    ]);
    return { ...row, tags: tagRows, placements: placementRows, media: mediaRows };
  }
  if (entityType === "category") {
    const [row] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, entityId))
      .limit(1);
    if (!row) return null;
    const children = await tx
      .select()
      .from(subcategories)
      .where(eq(subcategories.categoryId, entityId))
      .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));
    return { ...row, subcategories: children };
  }
  if (entityType === "subcategory") {
    const [row] = await tx
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, entityId))
      .limit(1);
    if (!row) return null;
    const placements = await tx
      .select({
        discoveryId: discoveryPlacements.discoveryId,
        sortOrder: discoveryPlacements.sortOrder,
      })
      .from(discoveryPlacements)
      .where(eq(discoveryPlacements.subcategoryId, entityId))
      .orderBy(asc(discoveryPlacements.sortOrder));
    return { ...row, placements };
  }
  if (entityType === "tag") {
    const [row] = await tx
      .select()
      .from(tags)
      .where(eq(tags.id, entityId))
      .limit(1);
    if (!row) return null;
    const linkedDiscoveries = await tx
      .select({ discoveryId: discoveryTags.discoveryId })
      .from(discoveryTags)
      .where(eq(discoveryTags.tagId, entityId))
      .orderBy(asc(discoveryTags.discoveryId));
    return {
      ...row,
      discoveryIds: linkedDiscoveries.map(({ discoveryId }) => discoveryId),
    };
  }
  if (entityType === "collection") {
    const [row] = await tx
      .select()
      .from(collections)
      .where(eq(collections.id, entityId))
      .limit(1);
    if (!row) return null;
    const members = await tx
      .select({
        discoveryId: collectionDiscoveries.discoveryId,
        sortOrder: collectionDiscoveries.sortOrder,
      })
      .from(collectionDiscoveries)
      .where(eq(collectionDiscoveries.collectionId, entityId))
      .orderBy(asc(collectionDiscoveries.sortOrder));
    return { ...row, discoveries: members };
  }
  return null;
}

async function getDiscoveryWriteResult(
  id: string,
  created: boolean,
  duplicate: boolean,
) {
  const catalog = await getAdminCatalog();
  const discovery = catalog.discoveries.find((item) => item.id === id);
  if (!discovery) throw new ContentNotFoundError("The discovery no longer exists.");
  return { discovery, created, duplicate };
}

async function findDiscoveryByNormalizedUrl(normalizedUrl: string) {
  const [row] = await getDb()
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(eq(discoveries.normalizedUrl, normalizedUrl))
    .limit(1);
  return row;
}

export async function createDiscovery(
  rawInput: DiscoveryInput,
  actorUserId: string,
) {
  const normalizedUrl = normalizeResourceUrl(rawInput.url);
  const duplicate = await findDiscoveryByNormalizedUrl(normalizedUrl);
  if (duplicate) return getDiscoveryWriteResult(duplicate.id, false, true);

  try {
    const id = await getDb().transaction(async (tx) => {
      const slug = await uniqueSlug(
        rawInput.title,
        async (candidate) => {
          const [row] = await tx
            .select({ id: discoveries.id })
            .from(discoveries)
            .where(eq(discoveries.slug, candidate))
            .limit(1);
          return Boolean(row);
        },
        rawInput.slug,
      );
      const [created] = await tx
        .insert(discoveries)
        .values({
          slug,
          title: normalizedText(rawInput.title),
          url: normalizedUrl,
          normalizedUrl,
          summary: optionalText(rawInput.summary),
          description: optionalText(rawInput.description),
          status: "draft",
          createdByUserId: actorUserId,
        })
        .returning({ id: discoveries.id });
      if (!created) throw new Error("The discovery could not be saved.");

      await replaceDiscoveryTags(tx, created.id, rawInput.tags);
      await replaceDiscoveryPlacements(tx, created.id, rawInput.placements);

      await recordAudit(tx, {
        actorUserId,
        entityType: "discovery",
        entityId: created.id,
        action: "content.discovery.created",
        changes: { slug, status: "draft", normalizedUrl },
      });
      return created.id;
    });
    return getDiscoveryWriteResult(id, true, false);
  } catch (error) {
    const racedDuplicate = await findDiscoveryByNormalizedUrl(normalizedUrl);
    if (racedDuplicate) return getDiscoveryWriteResult(racedDuplicate.id, false, true);
    throw error;
  }
}

export async function updateDiscovery(
  id: string,
  rawInput: DiscoveryInput,
  actorUserId: string,
) {
  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: discoveries.id,
        slug: discoveries.slug,
      })
      .from(discoveries)
      .where(eq(discoveries.id, id))
      .for("update")
      .limit(1);
    if (!current) throw new ContentNotFoundError("The discovery was not found.");

    const url = normalizeResourceUrl(rawInput.url);
    const [urlOwner] = await tx
      .select({ id: discoveries.id })
      .from(discoveries)
      .where(and(eq(discoveries.normalizedUrl, url), ne(discoveries.id, id)))
      .limit(1);
    if (urlOwner) {
      throw new ContentConflictError(
        "That canonical URL already belongs to another discovery.",
      );
    }

    const slug = rawInput.slug
      ? await uniqueSlug(
          rawInput.title,
          async (candidate) => {
            if (candidate === current.slug) return false;
            const [row] = await tx
              .select({ id: discoveries.id })
              .from(discoveries)
              .where(eq(discoveries.slug, candidate))
              .limit(1);
            return Boolean(row);
          },
          rawInput.slug,
        )
      : current.slug;

    await tx
      .update(discoveries)
      .set({
        slug,
        title: normalizedText(rawInput.title),
        url,
        normalizedUrl: url,
        summary: optionalText(rawInput.summary),
        description: optionalText(rawInput.description),
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));
    await replaceDiscoveryTags(tx, id, rawInput.tags);
    await replaceDiscoveryPlacements(tx, id, rawInput.placements);

    await recordAudit(tx, {
      actorUserId,
      entityType: "discovery",
      entityId: id,
      action: "content.discovery.updated",
      changes: {
        slug,
        normalizedUrl: url,
      },
    });
  });
  return getDiscoveryWriteResult(id, false, false);
}

export async function deleteDiscovery(id: string, actorUserId: string) {
  const [existing] = await getDb()
    .select({ id: discoveries.id, slug: discoveries.slug })
    .from(discoveries)
    .where(eq(discoveries.id, id))
    .limit(1);
  if (!existing) throw new ContentNotFoundError("The discovery was not found.");

  await getDb().transaction(async (tx) => {
    await recordAudit(tx, {
      actorUserId,
      entityType: "discovery",
      entityId: id,
      action: "content.discovery.deleted",
      changes: { slug: existing.slug },
    });
    await tx.delete(discoveries).where(eq(discoveries.id, id));
  });
}

async function categorySlug(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  name: string,
  requested?: string,
  excludeId?: string,
) {
  return uniqueSlug(
    name,
    async (candidate) => {
      const where = excludeId
        ? and(eq(categories.slug, candidate), ne(categories.id, excludeId))
        : eq(categories.slug, candidate);
      const [row] = await tx.select({ id: categories.id }).from(categories).where(where).limit(1);
      return Boolean(row);
    },
    requested,
  );
}

export async function createCategory(
  input: CategoryInput,
  actorUserId: string,
) {
  const id = await getDb().transaction(async (tx) => {
    const slug = await categorySlug(tx, input.name, input.slug);
    const [created] = await tx
      .insert(categories)
      .values({
        slug,
        name: normalizedText(input.name),
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
        isVisible: input.isVisible,
      })
      .returning({ id: categories.id });
    if (!created) throw new Error("The category could not be saved.");
    await recordAudit(tx, {
      actorUserId,
      entityType: "category",
      entityId: created.id,
      action: "content.category.created",
      changes: { slug },
    });
    return created.id;
  });
  const catalog = await getAdminCatalog();
  const category = catalog.categories.find((item) => item.id === id);
  if (!category) throw new ContentNotFoundError("The category could not be loaded.");
  return category;
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  actorUserId: string,
) {
  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, id))
      .for("update")
      .limit(1);
    if (!current) throw new ContentNotFoundError("The category was not found.");
    const slug = input.slug
      ? await categorySlug(tx, input.name, input.slug, id)
      : current.slug;
    await tx
      .update(categories)
      .set({
        slug,
        name: normalizedText(input.name),
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
        isVisible: input.isVisible,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id));
    await recordAudit(tx, {
      actorUserId,
      entityType: "category",
      entityId: id,
      action: "content.category.updated",
      changes: { slug, isVisible: input.isVisible, sortOrder: input.sortOrder },
    });
  });
  const catalog = await getAdminCatalog();
  const category = catalog.categories.find((item) => item.id === id);
  if (!category) throw new ContentNotFoundError("The category could not be loaded.");
  return category;
}

export async function deleteCategory(id: string, actorUserId: string) {
  await getDb().transaction(async (tx) => {
    const [category] = await tx
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, id))
      .for("update")
      .limit(1);
    if (!category) throw new ContentNotFoundError("The category was not found.");

    const [placement] = await tx
      .select({ id: discoveryPlacements.id })
      .from(discoveryPlacements)
      .where(eq(discoveryPlacements.categoryId, id))
      .limit(1);
    if (placement) {
      throw new ContentConflictError(
        "Move or remove this category’s discovery placements before deleting it.",
      );
    }

    const children = await tx
      .select({ id: subcategories.id, slug: subcategories.slug })
      .from(subcategories)
      .where(eq(subcategories.categoryId, id));
    for (const child of children) {
      await recordAudit(tx, {
        actorUserId,
        entityType: "subcategory",
        entityId: child.id,
        action: "content.subcategory.deleted",
        changes: { slug: child.slug, parentCategoryDeleted: true },
      });
    }
    await recordAudit(tx, {
      actorUserId,
      entityType: "category",
      entityId: id,
      action: "content.category.deleted",
      changes: { slug: category.slug },
    });
    await tx.delete(categories).where(eq(categories.id, id));
  });
}

async function subcategorySlug(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  categoryId: string,
  name: string,
  requested?: string,
  excludeId?: string,
) {
  return uniqueSlug(
    name,
    async (candidate) => {
      const where = excludeId
        ? and(
            eq(subcategories.categoryId, categoryId),
            eq(subcategories.slug, candidate),
            ne(subcategories.id, excludeId),
          )
        : and(
            eq(subcategories.categoryId, categoryId),
            eq(subcategories.slug, candidate),
          );
      const [row] = await tx
        .select({ id: subcategories.id })
        .from(subcategories)
        .where(where)
        .limit(1);
      return Boolean(row);
    },
    requested,
  );
}

export async function createSubcategory(
  input: SubcategoryInput,
  actorUserId: string,
) {
  const id = await getDb().transaction(async (tx) => {
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);
    if (!category) throw new ContentNotFoundError("The selected category was not found.");
    const slug = await subcategorySlug(tx, input.categoryId, input.name, input.slug);
    const [created] = await tx
      .insert(subcategories)
      .values({
        categoryId: input.categoryId,
        slug,
        name: normalizedText(input.name),
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
        isVisible: input.isVisible,
      })
      .returning({ id: subcategories.id });
    if (!created) throw new Error("The subcategory could not be saved.");
    await recordAudit(tx, {
      actorUserId,
      entityType: "subcategory",
      entityId: created.id,
      action: "content.subcategory.created",
      changes: { categoryId: input.categoryId, slug },
    });
    return created.id;
  });
  const catalog = await getAdminCatalog();
  for (const category of catalog.categories) {
    const subcategory = category.subcategories.find((item) => item.id === id);
    if (subcategory) return subcategory;
  }
  throw new ContentNotFoundError("The subcategory could not be loaded.");
}

export async function updateSubcategory(
  id: string,
  input: SubcategoryInput,
  actorUserId: string,
) {
  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: subcategories.id,
        categoryId: subcategories.categoryId,
        slug: subcategories.slug,
      })
      .from(subcategories)
      .where(eq(subcategories.id, id))
      .for("update")
      .limit(1);
    if (!current) throw new ContentNotFoundError("The subcategory was not found.");
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);
    if (!category) throw new ContentNotFoundError("The selected category was not found.");

    const moving = current.categoryId !== input.categoryId;
    const slug = input.slug
      ? await subcategorySlug(tx, input.categoryId, input.name, input.slug, id)
      : moving
        ? await subcategorySlug(tx, input.categoryId, input.name, undefined, id)
        : current.slug;
    let placements: Array<{ discoveryId: string; sortOrder: number }> = [];
    if (moving) {
      placements = await tx
        .select({
          discoveryId: discoveryPlacements.discoveryId,
          sortOrder: discoveryPlacements.sortOrder,
        })
        .from(discoveryPlacements)
        .where(eq(discoveryPlacements.subcategoryId, id));
      await tx
        .delete(discoveryPlacements)
        .where(eq(discoveryPlacements.subcategoryId, id));
    }

    await tx
      .update(subcategories)
      .set({
        categoryId: input.categoryId,
        slug,
        name: normalizedText(input.name),
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
        isVisible: input.isVisible,
        updatedAt: new Date(),
      })
      .where(eq(subcategories.id, id));

    if (placements.length > 0) {
      await tx.insert(discoveryPlacements).values(
        placements.map((placement) => ({
          discoveryId: placement.discoveryId,
          categoryId: input.categoryId,
          subcategoryId: id,
          sortOrder: placement.sortOrder,
        })),
      );
    }
    await recordAudit(tx, {
      actorUserId,
      entityType: "subcategory",
      entityId: id,
      action: "content.subcategory.updated",
      changes: {
        categoryId: input.categoryId,
        movedFromCategoryId: moving ? current.categoryId : null,
        slug,
        isVisible: input.isVisible,
        sortOrder: input.sortOrder,
      },
    });
  });
  const catalog = await getAdminCatalog();
  for (const category of catalog.categories) {
    const subcategory = category.subcategories.find((item) => item.id === id);
    if (subcategory) return subcategory;
  }
  throw new ContentNotFoundError("The subcategory could not be loaded.");
}

export async function deleteSubcategory(
  id: string,
  moveDiscoveriesToCategoryRoot: boolean,
  actorUserId: string,
) {
  await getDb().transaction(async (tx) => {
    const [subcategory] = await tx
      .select({
        id: subcategories.id,
        categoryId: subcategories.categoryId,
        slug: subcategories.slug,
      })
      .from(subcategories)
      .where(eq(subcategories.id, id))
      .for("update")
      .limit(1);
    if (!subcategory) throw new ContentNotFoundError("The subcategory was not found.");

    const placements = await tx
      .select({
        discoveryId: discoveryPlacements.discoveryId,
        sortOrder: discoveryPlacements.sortOrder,
      })
      .from(discoveryPlacements)
      .where(eq(discoveryPlacements.subcategoryId, id));
    await recordAudit(tx, {
      actorUserId,
      entityType: "subcategory",
      entityId: id,
      action: "content.subcategory.deleted",
      changes: {
        slug: subcategory.slug,
        movedToCategoryRoot: moveDiscoveriesToCategoryRoot,
        movedDiscoveryCount: placements.length,
      },
    });
    if (placements.length > 0 && !moveDiscoveriesToCategoryRoot) {
      throw new ContentConflictError(
        "Choose “move to category” to keep these discoveries, or remove their placements first.",
      );
    }
    if (placements.length > 0) {
      await tx
        .delete(discoveryPlacements)
        .where(eq(discoveryPlacements.subcategoryId, id));
      await tx
        .insert(discoveryPlacements)
        .values(
          placements.map((placement) => ({
            discoveryId: placement.discoveryId,
            categoryId: subcategory.categoryId,
            subcategoryId: null,
            sortOrder: placement.sortOrder,
          })),
        )
        .onConflictDoNothing();
    }
    await tx.delete(subcategories).where(eq(subcategories.id, id));
  });
}

export async function createTag(name: string, actorUserId: string) {
  const normalized = normalizedText(name);
  const normalizedName = normalizedTagName(normalized);
  if (!normalizedName) throw new InvalidContentError("Enter a tag name.");
  const result = await getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ id: tags.id, slug: tags.slug, name: tags.name })
      .from(tags)
      .where(eq(tags.normalizedName, normalizedName))
      .limit(1);
    if (existing[0]) return { tag: existing[0], created: false };

    const createdTag = await addOrReuseTag(tx, normalized);
    const [tag] = await tx
      .select({ id: tags.id, slug: tags.slug, name: tags.name })
      .from(tags)
      .where(eq(tags.id, createdTag.id))
      .limit(1);
    if (!tag) throw new Error("The tag could not be loaded.");
    if (tag) {
      await recordAudit(tx, {
        actorUserId,
        entityType: "tag",
        entityId: tag.id,
        action: "content.tag.created",
        changes: { slug: tag.slug, normalizedName },
      });
    }
    return { tag, created: true };
  });
  return result.tag;
}

export async function updateTag(id: string, name: string, actorUserId: string) {
  const normalized = normalizedText(name);
  const normalizedName = normalizedTagName(normalized);
  if (!normalizedName) throw new InvalidContentError("Enter a tag name.");
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ id: tags.id, slug: tags.slug })
      .from(tags)
      .where(eq(tags.id, id))
      .for("update")
      .limit(1);
    if (!current) throw new ContentNotFoundError("The tag was not found.");
    const [other] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.normalizedName, normalizedName), ne(tags.id, id)))
      .limit(1);
    if (other) throw new ContentConflictError("A tag with that normalized name already exists.");
    const [updated] = await tx
      .update(tags)
      .set({ name: normalized, normalizedName, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning({ id: tags.id, slug: tags.slug, name: tags.name });
    await recordAudit(tx, {
      actorUserId,
      entityType: "tag",
      entityId: id,
      action: "content.tag.updated",
      changes: { name: normalized, normalizedName },
    });
    return updated;
  });
}

export async function deleteTag(id: string, actorUserId: string) {
  await getDb().transaction(async (tx) => {
    const [tag] = await tx
      .select({ id: tags.id, slug: tags.slug })
      .from(tags)
      .where(eq(tags.id, id))
      .for("update")
      .limit(1);
    if (!tag) throw new ContentNotFoundError("The tag was not found.");
    await recordAudit(tx, {
      actorUserId,
      entityType: "tag",
      entityId: id,
      action: "content.tag.deleted",
      changes: { slug: tag.slug },
    });
    await tx.delete(tags).where(eq(tags.id, id));
  });
}

async function replaceCollectionDiscoveries(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  collectionId: string,
  discoveryIds: string[],
) {
  if (new Set(discoveryIds).size !== discoveryIds.length) {
    throw new ContentConflictError("A discovery can only appear once in a collection.");
  }
  if (discoveryIds.length > 0) {
    const existing = await tx
      .select({ id: discoveries.id })
      .from(discoveries)
      .where(inArray(discoveries.id, discoveryIds));
    if (existing.length !== discoveryIds.length) {
      throw new ContentNotFoundError("One or more selected discoveries no longer exist.");
    }
  }
  await tx
    .delete(collectionDiscoveries)
    .where(eq(collectionDiscoveries.collectionId, collectionId));
  if (discoveryIds.length > 0) {
    await tx.insert(collectionDiscoveries).values(
      discoveryIds.map((discoveryId, sortOrder) => ({
        collectionId,
        discoveryId,
        sortOrder,
      })),
    );
  }
}

async function collectionSlug(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  name: string,
  requested?: string,
  excludeId?: string,
) {
  return uniqueSlug(
    name,
    async (candidate) => {
      const where = excludeId
        ? and(eq(collections.slug, candidate), ne(collections.id, excludeId))
        : eq(collections.slug, candidate);
      const [row] = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(where)
        .limit(1);
      return Boolean(row);
    },
    requested,
  );
}

export async function createCollection(
  input: CollectionInput,
  actorUserId: string,
) {
  const id = await getDb().transaction(async (tx) => {
    const slug = await collectionSlug(tx, input.name, input.slug);
    const [created] = await tx
      .insert(collections)
      .values({
        slug,
        name: normalizedText(input.name),
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
      })
      .returning({ id: collections.id });
    if (!created) throw new Error("The collection could not be saved.");
    await replaceCollectionDiscoveries(tx, created.id, input.discoveryIds);
    await recordAudit(tx, {
      actorUserId,
      entityType: "collection",
      entityId: created.id,
      action: "content.collection.created",
      changes: { slug, sortOrder: input.sortOrder },
    });
    return created.id;
  });
  const catalog = await getAdminCatalog();
  const collection = catalog.collections.find((item) => item.id === id);
  if (!collection) throw new ContentNotFoundError("The collection could not be loaded.");
  return collection;
}

export async function updateCollection(
  id: string,
  input: CollectionInput,
  actorUserId: string,
) {
  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ id: collections.id, slug: collections.slug })
      .from(collections)
      .where(eq(collections.id, id))
      .for("update")
      .limit(1);
    if (!current) throw new ContentNotFoundError("The collection was not found.");
    const slug = input.slug
      ? await collectionSlug(tx, input.name, input.slug, id)
      : current.slug;
    await tx
      .update(collections)
      .set({
        slug,
        name: normalizedText(input.name),
        description: optionalText(input.description),
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, id));
    await replaceCollectionDiscoveries(tx, id, input.discoveryIds);
    await recordAudit(tx, {
      actorUserId,
      entityType: "collection",
      entityId: id,
      action: "content.collection.updated",
      changes: { slug, sortOrder: input.sortOrder, memberCount: input.discoveryIds.length },
    });
  });
  const catalog = await getAdminCatalog();
  const collection = catalog.collections.find((item) => item.id === id);
  if (!collection) throw new ContentNotFoundError("The collection could not be loaded.");
  return collection;
}

export async function deleteCollection(id: string, actorUserId: string) {
  await getDb().transaction(async (tx) => {
    const [collection] = await tx
      .select({ id: collections.id, slug: collections.slug })
      .from(collections)
      .where(eq(collections.id, id))
      .for("update")
      .limit(1);
    if (!collection) throw new ContentNotFoundError("The collection was not found.");
    await recordAudit(tx, {
      actorUserId,
      entityType: "collection",
      entityId: id,
      action: "content.collection.deleted",
      changes: { slug: collection.slug },
    });
    await tx.delete(collections).where(eq(collections.id, id));
  });
}

function snapshotRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidContentError("The saved content version is malformed.");
  }
  return value as Record<string, unknown>;
}

function snapshotText(
  snapshot: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = snapshot[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new InvalidContentError(`The saved version has an invalid ${key} field.`);
  }
  return value.trim();
}

function snapshotNullableText(
  snapshot: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null {
  const value = snapshot[key];
  if (value == null) return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new InvalidContentError(`The saved version has an invalid ${key} field.`);
  }
  return value.trim() || null;
}

function snapshotInteger(
  snapshot: Record<string, unknown>,
  key: string,
  minimum = 0,
  maximum = 100_000,
): number {
  const value = snapshot[key];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new InvalidContentError(`The saved version has an invalid ${key} field.`);
  }
  return value;
}

function snapshotArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new InvalidContentError(`The saved version has invalid ${label}.`);
  }
  return value.map(snapshotRecord);
}

function snapshotStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new InvalidContentError(`The saved version has invalid ${label}.`);
  }
  return value as string[];
}

function publishingPath(
  from: PublishingStatus,
  to: PublishingStatus,
): PublishingStatus[] {
  if (from === to) return [];
  const queue: Array<{ status: PublishingStatus; path: PublishingStatus[] }> = [
    { status: from, path: [] },
  ];
  const visited = new Set<PublishingStatus>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of getAllowedPublishingTransitions(current.status)) {
      if (visited.has(next)) continue;
      const path = [...current.path, next];
      if (next === to) return path;
      visited.add(next);
      queue.push({ status: next, path });
    }
  }
  throw new InvalidContentError(`Cannot restore content from ${from} to ${to}.`);
}

export async function restoreContentVersion(
  versionId: string,
  actorUserId: string,
) {
  return getDb().transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(entityContentVersions)
      .where(eq(entityContentVersions.id, versionId))
      .for("update")
      .limit(1);
    if (!version) throw new ContentNotFoundError("The selected version was not found.");
    const snapshot = snapshotRecord(version.snapshot);
    const entityType = version.entityType;
    const entityId = version.entityId;
    const before = await readContentSnapshot(tx, entityType, entityId);

    if (entityType === "discovery") {
      const slug = slugSchema.parse(snapshotText(snapshot, "slug", 120));
      const title = snapshotText(snapshot, "title", 180);
      const url = normalizeResourceUrl(snapshotText(snapshot, "url", 4096));
      const summary = snapshotNullableText(snapshot, "summary", 500);
      const description = snapshotNullableText(snapshot, "description", 10_000);
      const tagsInput = snapshotArray(snapshot.tags, "tags").map((tag) =>
        snapshotText(tag, "name", 80),
      );
      const placementInput = snapshotArray(snapshot.placements, "placements").map(
        (placement) => {
          const categoryId = snapshotText(placement, "categoryId", 64);
          const subcategoryId = placement.subcategoryId;
          if (subcategoryId !== null && typeof subcategoryId !== "string") {
            throw new InvalidContentError("The saved version has an invalid placement.");
          }
          return {
            categoryId,
            subcategoryId: subcategoryId as string | null,
            sortOrder: snapshotInteger(placement, "sortOrder"),
          };
        },
      );
      const mediaInput =
        snapshot.media === undefined
          ? []
          : snapshotArray(snapshot.media, "media").map((asset) =>
              snapshotText(asset, "id", 64),
            );
      const rawStatus = snapshot.status;
      if (!["draft", "review", "published", "archived"].includes(String(rawStatus))) {
        throw new InvalidContentError("The saved version has an invalid publishing status.");
      }
      const targetStatus = rawStatus as PublishingStatus;
      const [existing] = await tx
        .select({ status: discoveries.status })
        .from(discoveries)
        .where(eq(discoveries.id, entityId))
        .for("update")
        .limit(1);
      const [slugOwner] = await tx
        .select({ id: discoveries.id })
        .from(discoveries)
        .where(and(eq(discoveries.slug, slug), ne(discoveries.id, entityId)))
        .limit(1);
      const [urlOwner] = await tx
        .select({ id: discoveries.id })
        .from(discoveries)
        .where(and(eq(discoveries.normalizedUrl, url), ne(discoveries.id, entityId)))
        .limit(1);
      if (slugOwner || urlOwner) {
        throw new ContentConflictError(
          "The selected version conflicts with another discovery’s slug or canonical URL.",
        );
      }
      const initialStatus = existing?.status ?? "draft";
      if (existing) {
        await tx
          .update(discoveries)
          .set({
            slug,
            title,
            url,
            normalizedUrl: url,
            summary,
            description,
            updatedAt: new Date(),
          })
          .where(eq(discoveries.id, entityId));
      } else {
        await tx.insert(discoveries).values({
          id: entityId,
          slug,
          title,
          url,
          normalizedUrl: url,
          summary,
          description,
          status: "draft",
          createdByUserId: actorUserId,
        });
      }
      await replaceDiscoveryTags(tx, entityId, tagsInput);
      await replaceDiscoveryPlacements(tx, entityId, placementInput);
      await replaceDiscoveryMedia(tx, entityId, mediaInput);
      let currentStatus = initialStatus;
      for (const nextStatus of publishingPath(currentStatus, targetStatus)) {
        assertPublishingTransition(currentStatus, nextStatus);
        await tx
          .update(discoveries)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(discoveries.id, entityId));
        await tx.insert(publishingRecords).values({
          discoveryId: entityId,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          actorUserId,
          note: `Restored from content version ${version.id}.`,
        });
        await recordContentAudit(tx, {
          actorUserId,
          entityType: "discovery",
          entityId,
          action: `publishing.discovery.${nextStatus}`,
          changes: {
            before: { status: currentStatus },
            after: { status: nextStatus },
            sourceVersionId: version.id,
          },
        });
        currentStatus = nextStatus;
      }
    } else if (entityType === "category") {
      const slug = slugSchema.parse(snapshotText(snapshot, "slug", 120));
      const name = snapshotText(snapshot, "name", 120);
      const description = snapshotNullableText(snapshot, "description", 2000);
      const sortOrder = snapshotInteger(snapshot, "sortOrder");
      if (typeof snapshot.isVisible !== "boolean") {
        throw new InvalidContentError("The saved version has an invalid visibility setting.");
      }
      const [owner] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.slug, slug), ne(categories.id, entityId)))
        .limit(1);
      if (owner) throw new ContentConflictError("That category slug is already in use.");
      const [existing] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, entityId))
        .limit(1);
      const values = {
        slug,
        name,
        description,
        sortOrder,
        isVisible: snapshot.isVisible,
        updatedAt: new Date(),
      };
      if (existing) {
        await tx.update(categories).set(values).where(eq(categories.id, entityId));
      } else {
        await tx.insert(categories).values({ id: entityId, ...values });
      }
    } else if (entityType === "subcategory") {
      const categoryId = snapshotText(snapshot, "categoryId", 64);
      const slug = slugSchema.parse(snapshotText(snapshot, "slug", 120));
      const name = snapshotText(snapshot, "name", 120);
      const description = snapshotNullableText(snapshot, "description", 2000);
      const sortOrder = snapshotInteger(snapshot, "sortOrder");
      if (typeof snapshot.isVisible !== "boolean") {
        throw new InvalidContentError("The saved version has an invalid visibility setting.");
      }
      const [category] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);
      if (!category) {
        throw new ContentConflictError("Restore the parent category before this subcategory.");
      }
      const [owner] = await tx
        .select({ id: subcategories.id })
        .from(subcategories)
        .where(
          and(
            eq(subcategories.categoryId, categoryId),
            eq(subcategories.slug, slug),
            ne(subcategories.id, entityId),
          ),
        )
        .limit(1);
      if (owner) throw new ContentConflictError("That subcategory slug is already in use.");
      const [existing] = await tx
        .select({ id: subcategories.id })
        .from(subcategories)
        .where(eq(subcategories.id, entityId))
        .limit(1);
      const values = {
        categoryId,
        slug,
        name,
        description,
        sortOrder,
        isVisible: snapshot.isVisible,
      };
      if (existing) {
        await tx
          .update(subcategories)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(subcategories.id, entityId));
      } else {
        await tx.insert(subcategories).values({ id: entityId, ...values });
      }
      await tx
        .delete(discoveryPlacements)
        .where(eq(discoveryPlacements.subcategoryId, entityId));
      const snapshotPlacements = snapshotArray(snapshot.placements, "subcategory placements");
      const validIds = snapshotPlacements
        .map((item) => snapshotText(item, "discoveryId", 64));
      const existingDiscoveries = validIds.length
        ? await tx
            .select({ id: discoveries.id })
            .from(discoveries)
            .where(inArray(discoveries.id, validIds))
        : [];
      const existingIds = new Set(existingDiscoveries.map(({ id }) => id));
      const rows = snapshotPlacements.flatMap((item) => {
        const discoveryId = snapshotText(item, "discoveryId", 64);
        return existingIds.has(discoveryId)
          ? [{
              discoveryId,
              categoryId,
              subcategoryId: entityId,
              sortOrder: snapshotInteger(item, "sortOrder"),
            }]
          : [];
      });
      if (rows.length) {
        await tx.insert(discoveryPlacements).values(rows).onConflictDoNothing();
      }
    } else if (entityType === "tag") {
      const slug = slugSchema.parse(snapshotText(snapshot, "slug", 120));
      const name = snapshotText(snapshot, "name", 80);
      const normalizedName = normalizedTagName(name);
      const [owner] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.normalizedName, normalizedName), ne(tags.id, entityId)))
        .limit(1);
      if (owner) throw new ContentConflictError("That normalized tag name is already in use.");
      const [slugOwner] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.slug, slug), ne(tags.id, entityId)))
        .limit(1);
      if (slugOwner) throw new ContentConflictError("That tag slug is already in use.");
      const [existing] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.id, entityId))
        .limit(1);
      if (existing) {
        await tx
          .update(tags)
          .set({ slug, name, normalizedName, updatedAt: new Date() })
          .where(eq(tags.id, entityId));
      } else {
        await tx.insert(tags).values({ id: entityId, slug, name, normalizedName });
      }
      await tx.delete(discoveryTags).where(eq(discoveryTags.tagId, entityId));
      const linkedIds = snapshotStringArray(snapshot.discoveryIds, "tag discoveries");
      const existingDiscoveries = linkedIds.length
        ? await tx
            .select({ id: discoveries.id })
            .from(discoveries)
            .where(inArray(discoveries.id, linkedIds))
        : [];
      if (existingDiscoveries.length) {
        await tx
          .insert(discoveryTags)
          .values(existingDiscoveries.map(({ id }) => ({ discoveryId: id, tagId: entityId })))
          .onConflictDoNothing();
      }
    } else if (entityType === "collection") {
      const slug = slugSchema.parse(snapshotText(snapshot, "slug", 120));
      const name = snapshotText(snapshot, "name", 160);
      const description = snapshotNullableText(snapshot, "description", 2000);
      const sortOrder = snapshotInteger(snapshot, "sortOrder");
      const [slugOwner] = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.slug, slug), ne(collections.id, entityId)))
        .limit(1);
      if (slugOwner) throw new ContentConflictError("That collection slug is already in use.");
      const [existing] = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, entityId))
        .limit(1);
      const values = { slug, name, description, sortOrder, updatedAt: new Date() };
      if (existing) {
        await tx.update(collections).set(values).where(eq(collections.id, entityId));
      } else {
        await tx.insert(collections).values({ id: entityId, ...values });
      }
      const members = snapshotArray(snapshot.discoveries, "collection discoveries")
        .sort((a, b) => snapshotInteger(a, "sortOrder") - snapshotInteger(b, "sortOrder"))
        .map((item) => snapshotText(item, "discoveryId", 64));
      await replaceCollectionDiscoveries(tx, entityId, members);
    } else {
      throw new InvalidContentError("This version cannot be restored.");
    }

    await recordAudit(tx, {
      actorUserId,
      entityType,
      entityId,
      action: `content.${entityType}.restored`,
      changes: {
        sourceVersionId: version.id,
        before,
      },
      sourceVersionId: version.id,
    });
    return { entityType, entityId, restoredFromVersionId: version.id };
  });
}
