import { sql } from "drizzle-orm";
import { parseServerEnvironment } from "@workspace/config";
import { seedCatalog } from "@workspace/domain/seed";
import { transitionDiscovery } from "../services/publishing";
import { getDb, getPool } from "../index";
import {
  applicationSettings,
  categories,
  collectionDiscoveries,
  collections,
  discoveries,
  discoveryPlacements,
  discoveryTags,
  permissions,
  rolePermissions,
  roles,
  subcategories,
  tags,
} from "../schema/index";

const roleDefinitions = [
  {
    code: "OWNER",
    name: "Owner",
    description: "Full control of the ByteClave instance.",
  },
  {
    code: "ADMIN",
    name: "Admin",
    description: "Administrative access, excluding protected Owner changes.",
  },
  {
    code: "EDITOR",
    name: "Editor",
    description: "Creates and updates catalog content.",
  },
] as const;

const permissionDefinitions = [
  ["catalog:read", "Read catalog records."],
  ["categories:manage", "Create and update categories and subcategories."],
  ["discoveries:manage", "Create and update Discovery records."],
  ["publishing:review", "Move content into or out of review."],
  ["publishing:publish", "Publish or archive reviewed content."],
  ["users:manage", "Manage user roles, subject to Owner protection."],
  ["settings:manage", "Change application settings."],
  ["audit:read", "Read audit history."],
] as const;

const rolePermissionKeys = {
  OWNER: permissionDefinitions.map(([key]) => key),
  ADMIN: [
    "catalog:read",
    "categories:manage",
    "discoveries:manage",
    "publishing:review",
    "publishing:publish",
    "users:manage",
    "settings:manage",
    "audit:read",
  ],
  EDITOR: ["catalog:read", "discoveries:manage", "publishing:review"],
} as const;

function firstOrThrow<T>(rows: T[] | undefined, label: string): T {
  const row = rows?.[0];
  if (!row) throw new Error(`Database did not return ${label}.`);
  return row;
}

let databasePool: ReturnType<typeof getPool> | undefined;
const queuedPublications = new Set<string>();

async function main(): Promise<void> {
  const env = parseServerEnvironment();
  databasePool = getPool();
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .insert(roles)
      .values([...roleDefinitions])
      .onConflictDoUpdate({
        target: roles.code,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(permissions)
      .values(
        permissionDefinitions.map(([key, description]) => ({ key, description })),
      )
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          description: sql`excluded.description`,
          updatedAt: new Date(),
        },
      });

    for (const [roleCode, permissionKeys] of Object.entries(rolePermissionKeys)) {
      await tx
        .insert(rolePermissions)
        .values(
          permissionKeys.map((permissionKey) => ({
            roleCode: roleCode as "OWNER" | "ADMIN" | "EDITOR",
            permissionKey,
          })),
        )
        .onConflictDoNothing();
    }

    await tx
      .insert(applicationSettings)
      .values({
        key: "bootstrap.initialOwnerEmail",
        value: env.INITIAL_OWNER_EMAIL,
      })
      .onConflictDoUpdate({
        target: applicationSettings.key,
        set: {
          value: env.INITIAL_OWNER_EMAIL,
          updatedAt: new Date(),
        },
      });

    await seedCatalog({
      async upsertCategory(input) {
        const rows = await tx
          .insert(categories)
          .values(input)
          .onConflictDoUpdate({
            target: categories.slug,
            set: {
              name: input.name,
              description: input.description ?? null,
              sortOrder: input.sortOrder,
              updatedAt: new Date(),
            },
          })
          .returning({ id: categories.id, slug: categories.slug });
        return firstOrThrow(rows, `category "${input.slug}"`);
      },
      async upsertSubcategory(input) {
        const rows = await tx
          .insert(subcategories)
          .values(input)
          .onConflictDoUpdate({
            target: [subcategories.categoryId, subcategories.slug],
            set: {
              name: input.name,
              description: input.description ?? null,
              sortOrder: input.sortOrder,
              updatedAt: new Date(),
            },
          })
          .returning({ id: subcategories.id, slug: subcategories.slug });
        return firstOrThrow(rows, `subcategory "${input.slug}"`);
      },
      async upsertDiscovery(input) {
        const rows = await tx
          .insert(discoveries)
          .values({
            slug: input.slug,
            title: input.title,
            summary: input.summary ?? null,
            description: input.description ?? null,
            url: input.url,
            normalizedUrl: input.url,
          })
          .onConflictDoUpdate({
            target: discoveries.slug,
            set: {
              title: input.title,
              summary: input.summary ?? null,
              description: input.description ?? null,
              url: input.url,
              normalizedUrl: input.url,
              updatedAt: new Date(),
            },
          })
          .returning({ id: discoveries.id, slug: discoveries.slug });
        return firstOrThrow(rows, `discovery "${input.slug}"`);
      },
      async upsertTag(input) {
        const rows = await tx
          .insert(tags)
          .values(input)
          .onConflictDoUpdate({
            target: tags.slug,
            set: { name: input.name, updatedAt: new Date() },
          })
          .returning({ id: tags.id, slug: tags.slug });
        return firstOrThrow(rows, `tag "${input.slug}"`);
      },
      async upsertCollection(input) {
        const rows = await tx
          .insert(collections)
          .values(input)
          .onConflictDoUpdate({
            target: collections.slug,
            set: {
              name: input.name,
              description: input.description ?? null,
              updatedAt: new Date(),
            },
          })
          .returning({ id: collections.id, slug: collections.slug });
        return firstOrThrow(rows, `collection "${input.slug}"`);
      },
      async ensurePlacement(input) {
        await tx.insert(discoveryPlacements).values(input).onConflictDoNothing();
      },
      async ensureDiscoveryTag(input) {
        await tx.insert(discoveryTags).values(input).onConflictDoNothing();
      },
      async ensureCollectionDiscovery(input) {
        await tx
          .insert(collectionDiscoveries)
          .values(input)
          .onConflictDoUpdate({
            target: [
              collectionDiscoveries.collectionId,
              collectionDiscoveries.discoveryId,
            ],
            set: { sortOrder: input.sortOrder },
          });
      },
      async publishDiscovery(discoveryId) {
        queuedPublications.add(discoveryId);
      },
    });
  });

  for (const discoveryId of queuedPublications) {
    for (let step = 0; step < 3; step += 1) {
      const [current] = await db
        .select({ status: discoveries.status })
        .from(discoveries)
        .where(sql`${discoveries.id} = ${discoveryId}`)
        .limit(1);
      if (!current || current.status === "published") break;
      const nextStatus =
        current.status === "draft"
          ? "review"
          : current.status === "archived"
            ? "draft"
            : "published";
      await transitionDiscovery({
        discoveryId,
        nextStatus,
        note: "Development seed: publish a maintained catalog example.",
      });
    }
  }

  process.stdout.write("Development roles and catalog examples seeded.\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await databasePool?.end();
  });
