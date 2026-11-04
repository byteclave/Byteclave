import { describe, expect, it } from "vitest";
import {
  categoryInputSchema,
  discoveryInputSchema,
  discoveryPlacementInputSchema,
  mediaInputSchema,
  publishingStatusSchema,
} from "./schemas/index";
import {
  assertRoleChangeAllowed,
  assertPublishingTransition,
  createDiscoveryPlacement,
  LastOwnerError,
  ProtectedOwnerError,
} from "./services/index";
import { seedCatalog } from "./seed";
import { catalogSeed } from "./seed-data";
import type { ValidatedDiscoveryPlacementInput } from "./schemas/catalog";
import type { CatalogSeedRepository, SeedRecord } from "./seed";

const discoveryId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const subcategoryId = "00000000-0000-4000-8000-000000000003";

describe("domain schemas", () => {
  it("normalizes discovery URLs and validates core catalog entities", () => {
    const discovery = discoveryInputSchema.parse({
      slug: "example-resource",
      title: "Example resource",
      url: "https://EXAMPLE.com/resource/#about",
    });
    expect(discovery.url).toBe("https://example.com/resource");

    expect(
      categoryInputSchema.parse({ slug: "utilities", name: "Utilities" })
        .sortOrder,
    ).toBe(0);
    expect(() =>
      discoveryInputSchema.parse({
        slug: "not-valid",
        title: "",
        url: "file:///tmp/private",
      }),
    ).toThrow();
  });

  it("does not use matching names as Discovery identity", () => {
    const first = discoveryInputSchema.parse({
      slug: "same-name-one",
      title: "Same product name",
      url: "https://example.com/one",
    });
    const second = discoveryInputSchema.parse({
      slug: "same-name-two",
      title: "Same product name",
      url: "https://example.com/two",
    });

    expect(first.title).toBe(second.title);
    expect(first.url).not.toBe(second.url);
  });

  it("permits categories with no subcategories", () => {
    expect(
      categoryInputSchema.parse({
        slug: "utilities",
        name: "Utilities",
        description: "Standalone category.",
      }),
    ).toMatchObject({ slug: "utilities", name: "Utilities" });
  });

  it("defines all required publishing states", () => {
    expect(publishingStatusSchema.options).toEqual([
      "draft",
      "review",
      "published",
      "archived",
    ]);
  });

  it("rejects invalid placement identifiers before persistence", () => {
    expect(() =>
      discoveryPlacementInputSchema.parse({
        discoveryId: "not-a-uuid",
        categoryId,
      }),
    ).toThrow();
  });

  it("validates media metadata without requiring a proprietary storage provider", () => {
    expect(() =>
      mediaInputSchema.parse({
        storageKey: "catalog/image.png",
        fileName: "image.png",
        contentType: "image/png",
        sizeBytes: -1,
      }),
    ).toThrow();
    expect(
      mediaInputSchema.parse({
        storageKey: "catalog/image.png",
        fileName: "image.png",
        contentType: "image/png",
        sizeBytes: 1024,
      }).sizeBytes,
    ).toBe(1024);
  });
});

describe("publishing transitions", () => {
  it("allows deliberate forward and return transitions", () => {
    expect(() => assertPublishingTransition("draft", "review")).not.toThrow();
    expect(() => assertPublishingTransition("review", "published")).not.toThrow();
    expect(() => assertPublishingTransition("published", "review")).not.toThrow();
    expect(() => assertPublishingTransition("archived", "draft")).not.toThrow();
  });

  it("rejects skipping review or publishing directly from an archived state", () => {
    expect(() => assertPublishingTransition("draft", "published")).toThrow();
    expect(() => assertPublishingTransition("archived", "published")).toThrow();
  });
});

describe("Owner role protection", () => {
  it("prevents an administrator from demoting or changing the Owner", () => {
    expect(() =>
      assertRoleChangeAllowed({
        actorRoles: ["ADMIN"],
        targetRoles: ["OWNER"],
        nextTargetRoles: ["ADMIN"],
        ownerCount: 2,
      }),
    ).toThrow(ProtectedOwnerError);
  });

  it("does not let an administrator grant the Owner role", () => {
    expect(() =>
      assertRoleChangeAllowed({
        actorRoles: ["ADMIN"],
        targetRoles: ["EDITOR"],
        nextTargetRoles: ["OWNER"],
        ownerCount: 1,
      }),
    ).toThrow(ProtectedOwnerError);
  });

  it("protects the configured Owner account from changes by another Owner", () => {
    expect(() =>
      assertRoleChangeAllowed({
        actorRoles: ["OWNER"],
        targetRoles: ["OWNER"],
        nextTargetRoles: ["ADMIN"],
        ownerCount: 2,
        actorUserId: "00000000-0000-4000-8000-000000000010",
        targetUserId: "00000000-0000-4000-8000-000000000011",
        protectedOwnerUserId: "00000000-0000-4000-8000-000000000011",
      }),
    ).toThrow(ProtectedOwnerError);
  });

  it("does not permit removal of the last Owner, even by another Owner", () => {
    expect(() =>
      assertRoleChangeAllowed({
        actorRoles: ["OWNER"],
        targetRoles: ["OWNER"],
        nextTargetRoles: ["ADMIN"],
        ownerCount: 1,
      }),
    ).toThrow(LastOwnerError);
  });

  it("allows an Owner to change another Owner when an Owner remains", () => {
    expect(() =>
      assertRoleChangeAllowed({
        actorRoles: ["OWNER"],
        targetRoles: ["OWNER", "EDITOR"],
        nextTargetRoles: ["EDITOR"],
        ownerCount: 2,
      }),
    ).not.toThrow();
  });
});

describe("duplicate discovery placement prevention", () => {
  it("creates a destination placement once and treats retries as idempotent", async () => {
    const destinations = new Set<string>();
    const repository = {
      async insertIfAbsent(placement: ValidatedDiscoveryPlacementInput) {
        const key = `${placement.discoveryId}:${placement.categoryId}:${placement.subcategoryId ?? "root"}`;
        if (destinations.has(key)) return false;
        destinations.add(key);
        return true;
      },
    };
    const input = { discoveryId, categoryId, subcategoryId };

    await expect(createDiscoveryPlacement(repository, input)).resolves.toEqual({
      created: true,
    });
    await expect(createDiscoveryPlacement(repository, input)).resolves.toEqual({
      created: false,
    });
    expect(destinations.size).toBe(1);
  });
});

class MemorySeedRepository implements CatalogSeedRepository {
  readonly categories = new Map<string, SeedRecord>();
  readonly subcategories = new Map<string, SeedRecord>();
  readonly discoveries = new Map<string, SeedRecord>();
  readonly tags = new Map<string, SeedRecord>();
  readonly collections = new Map<string, SeedRecord>();
  readonly placements = new Set<string>();
  readonly discoveryTags = new Set<string>();
  readonly collectionDiscoveries = new Set<string>();
  readonly publishedDiscoveries = new Set<string>();
  private nextId = 1;

  private upsert(
    table: Map<string, SeedRecord>,
    key: string,
  ): Promise<SeedRecord> {
    let record = table.get(key);
    if (!record) {
      const suffix = String(this.nextId++).padStart(12, "0");
      record = { id: `00000000-0000-4000-8000-${suffix}`, slug: key };
      table.set(key, record);
    }
    return Promise.resolve(record);
  }

  upsertCategory(input: { slug: string }): Promise<SeedRecord> {
    return this.upsert(this.categories, input.slug);
  }

  upsertSubcategory(input: {
    categoryId: string;
    slug: string;
  }): Promise<SeedRecord> {
    return this.upsert(
      this.subcategories,
      `${input.categoryId}/${input.slug}`,
    ).then((record) => ({ ...record, slug: input.slug }));
  }

  upsertDiscovery(input: { slug: string }): Promise<SeedRecord> {
    return this.upsert(this.discoveries, input.slug);
  }

  upsertTag(input: { slug: string }): Promise<SeedRecord> {
    return this.upsert(this.tags, input.slug);
  }

  upsertCollection(input: { slug: string }): Promise<SeedRecord> {
    return this.upsert(this.collections, input.slug);
  }

  async ensurePlacement(input: {
    discoveryId: string;
    categoryId: string;
    subcategoryId: string | null;
  }): Promise<void> {
    this.placements.add(
      `${input.discoveryId}:${input.categoryId}:${input.subcategoryId ?? "root"}`,
    );
  }

  async ensureDiscoveryTag(input: {
    discoveryId: string;
    tagId: string;
  }): Promise<void> {
    this.discoveryTags.add(`${input.discoveryId}:${input.tagId}`);
  }

  async ensureCollectionDiscovery(input: {
    collectionId: string;
    discoveryId: string;
  }): Promise<void> {
    this.collectionDiscoveries.add(
      `${input.collectionId}:${input.discoveryId}`,
    );
  }

  async publishDiscovery(discoveryId: string): Promise<void> {
    this.publishedDiscoveries.add(discoveryId);
  }
}

describe("catalog seed", () => {
  it("preserves relationships and remains idempotent across repeated runs", async () => {
    const repository = new MemorySeedRepository();

    await seedCatalog(repository);
    const firstCounts = [
      repository.categories.size,
      repository.subcategories.size,
      repository.discoveries.size,
      repository.tags.size,
      repository.collections.size,
      repository.placements.size,
      repository.discoveryTags.size,
      repository.collectionDiscoveries.size,
      repository.publishedDiscoveries.size,
    ];

    await seedCatalog(repository);
    const secondCounts = [
      repository.categories.size,
      repository.subcategories.size,
      repository.discoveries.size,
      repository.tags.size,
      repository.collections.size,
      repository.placements.size,
      repository.discoveryTags.size,
      repository.collectionDiscoveries.size,
      repository.publishedDiscoveries.size,
    ];

    expect(secondCounts).toEqual(firstCounts);
    expect(repository.categories.has("utilities")).toBe(true);
    expect(repository.subcategories.size).toBeGreaterThan(0);
    expect(repository.collections.size).toBeGreaterThanOrEqual(2);
    expect(repository.placements.size).toBeGreaterThan(5);
    expect(repository.publishedDiscoveries.size).toBe(repository.discoveries.size);
    expect(
      repository.placements.has(
        `${repository.discoveries.get("obsidian")?.id}:${repository.categories.get("knowledge-work")?.id}:${repository.subcategories.get(`${repository.categories.get("knowledge-work")?.id}/notes-research`)?.id}`,
      ),
    ).toBe(true);
    expect(
      repository.placements.has(
        `${repository.discoveries.get("obsidian")?.id}:${repository.categories.get("productivity")?.id}:${repository.subcategories.get(`${repository.categories.get("productivity")?.id}/planning`)?.id}`,
      ),
    ).toBe(true);
  });

  it("fails explicitly when a seed relationship points to a missing category", async () => {
    const repository = new MemorySeedRepository();
    const brokenSeed = {
      ...catalogSeed,
      discoveries: [
        {
          ...catalogSeed.discoveries[0]!,
          placements: [{ categorySlug: "missing-category" }],
        },
      ],
      collections: [],
    };

    await expect(seedCatalog(repository, brokenSeed)).rejects.toThrow(
      /missing category/,
    );
  });
});
