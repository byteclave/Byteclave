import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  applicationSettings,
  categories,
  collectionDiscoveries,
  collections,
  discoveries,
  discoveryPlacements,
  getDb,
  getPool,
  media,
  permissions,
  rolePermissions,
  roles,
  subcategories,
  tags,
  userRoles,
  users,
} from "@workspace/db";
import {
  getConfiguredOwnerId,
  hashPassword,
  recoverOwnerPassword,
} from "@workspace/db/services";

type DiscoveryRecord = {
  id: string;
  slug: string;
  title: string;
  url: string;
  summary: string | null;
  description: string | null;
  status: string;
  tags: Array<{ id: string; slug: string; name: string }>;
  placements: Array<{
    categoryId: string;
    subcategoryId: string | null;
    categorySlug: string;
    subcategorySlug: string | null;
    sortOrder: number;
  }>;
};

type AdminCatalog = {
  discoveries: DiscoveryRecord[];
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    isVisible: boolean;
    subcategories: Array<{ id: string; slug: string; categoryId: string }>;
  }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  collections: Array<{ id: string; slug: string; discoveryIds: string[] }>;
};

type WriteResult = {
  discovery: DiscoveryRecord;
  created: boolean;
  duplicate: boolean;
};

test(
  "authenticated content management persists changes and keeps public catalog published-only",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const database = getDb();
    const roleCode = "OWNER" as const;
    const requiredPermissions = [
      "admin:access",
      "catalog:read",
      "categories:manage",
      "discoveries:manage",
      "publishing:review",
      "publishing:publish",
      "media:read",
      "media:manage",
      "versions:read",
      "versions:restore",
      "audit:read",
    ];
    const permissionDescriptions: Record<string, string> = {
      "admin:access": "Integration test administrator access.",
      "catalog:read": "Integration test catalog read.",
      "categories:manage": "Integration test taxonomy management.",
      "discoveries:manage": "Integration test discovery management.",
      "publishing:review": "Integration test review access.",
      "publishing:publish": "Integration test publish access.",
      "media:read": "Integration test media read.",
      "media:manage": "Integration test media management.",
      "versions:read": "Integration test version history.",
      "versions:restore": "Integration test version restoration.",
      "audit:read": "Integration test audit history.",
    };
    const [role] = await database
      .select({ code: roles.code })
      .from(roles)
      .where(eq(roles.code, roleCode))
      .limit(1);
    if (!role) {
      await database
        .insert(roles)
        .values({
          code: roleCode,
          name: "Temporary CMS test owner",
          description: "Automatically removed by the integration test.",
        })
        .onConflictDoNothing();
    }

    const existingPermissions = await database
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, requiredPermissions));
    const existingPermissionKeys = new Set(existingPermissions.map((item) => item.key));
    const addedPermissionKeys = requiredPermissions.filter(
      (key) => !existingPermissionKeys.has(key),
    );
    if (addedPermissionKeys.length > 0) {
      await database
        .insert(permissions)
        .values(
          addedPermissionKeys.map((key) => ({
            key,
            description: permissionDescriptions[key] ?? "Integration test permission.",
          })),
        )
        .onConflictDoNothing();
    }

    const existingMappings = await database
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleCode, roleCode),
          inArray(rolePermissions.permissionKey, requiredPermissions),
        ),
      );
    const existingMappingKeys = new Set(existingMappings.map((item) => item.permissionKey));
    const addedMappingKeys = requiredPermissions.filter(
      (key) => !existingMappingKeys.has(key),
    );
    if (addedMappingKeys.length > 0) {
      await database
        .insert(rolePermissions)
        .values(
          addedMappingKeys.map((permissionKey) => ({
            roleCode,
            permissionKey,
          })),
        )
        .onConflictDoNothing();
    }

    const suffix = randomUUID().slice(0, 8);
    const password = `Cms-test-${randomUUID()}-9`;
    const originalMediaStorageDirectory = process.env.MEDIA_STORAGE_DIR;
    const testMediaStorageDirectory = await mkdtemp(join(tmpdir(), "byteclave-cms-media-"));
    process.env.MEDIA_STORAGE_DIR = testMediaStorageDirectory;
    const configuredOwnerId = await getConfiguredOwnerId();
    let user: { id: string };
    let email: string;
    if (configuredOwnerId) {
      const [existingOwner] = await database
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, configuredOwnerId))
        .limit(1);
      assert.ok(existingOwner, "configured Owner account must exist in the test database");
      user = { id: existingOwner.id };
      email = existingOwner.email;
      await recoverOwnerPassword({ email, password });
    } else {
      email = `cms-test-${suffix}@example.invalid`;
      const [newOwner] = await database
        .insert(users)
        .values({
          email,
          displayName: "Temporary CMS test owner",
          passwordHash: await hashPassword(password),
        })
        .returning({ id: users.id });
      assert.ok(newOwner);
      user = { id: newOwner.id };
      await database.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.owner_bootstrap', 'true', true)`);
        await tx.insert(applicationSettings).values({
          key: "security.ownerUserId",
          value: user.id,
        });
        await tx.insert(userRoles).values({
          userId: user.id,
          roleCode,
          assignedByUserId: user.id,
        });
      });
    }

    const recordIds = {
      categories: [] as string[],
      subcategories: [] as string[],
      discoveries: [] as string[],
      collections: [] as string[],
      tags: [] as string[],
      media: [] as string[],
    };
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    let cookie = "";

    const call = async (
      path: string,
      method = "GET",
      body?: unknown,
    ): Promise<Response> => {
      const headers = new Headers({ accept: "application/json" });
      if (cookie) headers.set("cookie", cookie);
      if (body !== undefined) headers.set("content-type", "application/json");
      return fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    };

    const json = async <T>(
      response: Response,
      expectedStatus: number,
    ): Promise<T> => {
      const payload = await response.json().catch(() => null);
      assert.equal(
        response.status,
        expectedStatus,
        `Expected ${expectedStatus}, received ${response.status}: ${JSON.stringify(payload)}`,
      );
      return payload as T;
    };

    const testPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const uploadMedia = async (fileName: string) =>
      fetch(`${baseUrl}/admin/media`, {
        method: "POST",
        headers: {
          accept: "application/json",
          cookie,
          "content-type": "application/octet-stream",
          "x-upload-filename": encodeURIComponent(fileName),
          "x-upload-content-type": "image/png",
          "x-upload-alt-text": "",
        },
        body: testPng,
      });

    t.after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      if (recordIds.collections.length > 0) {
        await database
          .delete(collections)
          .where(inArray(collections.id, recordIds.collections));
      }
      if (recordIds.media.length > 0) {
        await database.delete(media).where(inArray(media.id, recordIds.media));
      }
      if (recordIds.discoveries.length > 0) {
        await database
          .delete(discoveries)
          .where(inArray(discoveries.id, recordIds.discoveries));
      }
      if (recordIds.subcategories.length > 0) {
        await database
          .delete(subcategories)
          .where(inArray(subcategories.id, recordIds.subcategories));
      }
      if (recordIds.categories.length > 0) {
        await database
          .delete(categories)
          .where(inArray(categories.id, recordIds.categories));
      }
      if (recordIds.tags.length > 0) {
        await database.delete(tags).where(inArray(tags.id, recordIds.tags));
      }
      // Audit history is append-only and Owner identity is protected. This test
      // therefore requires a dedicated disposable TEST_DATABASE_URL.
      await getPool().end();
      if (originalMediaStorageDirectory === undefined) {
        delete process.env.MEDIA_STORAGE_DIR;
      } else {
        process.env.MEDIA_STORAGE_DIR = originalMediaStorageDirectory;
      }
      await rm(testMediaStorageDirectory, { recursive: true, force: true });
    });

    const unauthenticated = await call("/admin/catalog");
    await json(unauthenticated, 401);
    await json(await call("/admin/audit"), 401);
    await json(await call("/admin/versions"), 401);

    const login = await call("/admin/auth/login", "POST", { email, password });
    await json(login, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie);
    cookie = setCookie.split(";", 1)[0] ?? "";
    assert.ok(cookie);
    await json(await call("/admin/session"), 200);

    const categoryA = await json<{
      id: string;
      slug: string;
    }>(
      await call("/admin/categories", "POST", {
        name: `CMS Category ${suffix}`,
        sortOrder: 0,
        isVisible: true,
      }),
      201,
    );
    recordIds.categories.push(categoryA.id);
    const categoryB = await json<{
      id: string;
      slug: string;
    }>(
      await call("/admin/categories", "POST", {
        name: `CMS Destination ${suffix}`,
        sortOrder: 1,
        isVisible: true,
      }),
      201,
    );
    recordIds.categories.push(categoryB.id);

    const subcategory = await json<{ id: string; slug: string }>(
      await call(`/admin/categories/${categoryA.id}/subcategories`, "POST", {
        categoryId: categoryA.id,
        name: `CMS Subcategory ${suffix}`,
        sortOrder: 0,
        isVisible: true,
      }),
      201,
    );
    recordIds.subcategories.push(subcategory.id);

    const tag = await json<{ id: string; slug: string; name: string }>(
      await call("/admin/tags", "POST", { name: ` CMS Research ${suffix} ` }),
      201,
    );
    recordIds.tags.push(tag.id);
    const reusedTag = await json<{ id: string }>(
      await call("/admin/tags", "POST", {
        name: `cms research ${suffix}`,
      }),
      201,
    );
    assert.equal(reusedTag.id, tag.id, "normalized tags should be reused");
    await assert.rejects(
      database.insert(tags).values({
        slug: `duplicate-tag-${suffix}`,
        name: `cms research ${suffix}`,
        normalizedName: `cms research ${suffix}`,
      }),
      "normalized tag uniqueness must be enforced by PostgreSQL",
    );

    const discoveryBody = {
      title: `CMS resource ${suffix}`,
      url: `HTTPS://Example.org/brief/?source=${suffix}#first`,
      summary: "Temporary test content.",
      description: "This integration record is removed after the test.",
      status: "published",
      tags: [`CMS Research ${suffix}`],
      placements: [
        { categoryId: categoryA.id, subcategoryId: null, sortOrder: 0 },
        {
          categoryId: categoryA.id,
          subcategoryId: subcategory.id,
          sortOrder: 0,
        },
      ],
    };
    const created = await json<WriteResult>(
      await call("/admin/discoveries", "POST", discoveryBody),
      201,
    );
    recordIds.discoveries.push(created.discovery.id);
    assert.equal(created.created, true);
    assert.equal(created.discovery.status, "draft");
    assert.equal(created.discovery.placements.length, 2);
    await json(await uploadMedia("../../unsafe.png"), 400);
    const mediaAsset = await json<{
      id: string;
      mediaUrl: string;
      fileName: string;
    }>(await uploadMedia("catalog-image.png"), 201);
    recordIds.media.push(mediaAsset.id);
    await json(
      await call(`/admin/media/${mediaAsset.id}`, "PATCH", {
        discoveryId: created.discovery.id,
        altText: "Catalog image",
      }),
      200,
    );
    await json(await call(`/admin/media/${mediaAsset.id}`, "DELETE"), 409);
    const draftMedia = await fetch(new URL(mediaAsset.mediaUrl, baseUrl));
    assert.equal(draftMedia.status, 401, "draft media must not be public");
    const removableMedia = await json<{ id: string }>(
      await uploadMedia("unused-image.png"),
      201,
    );
    recordIds.media.push(removableMedia.id);
    await json(
      await call(`/admin/media/${removableMedia.id}`, "DELETE"),
      204,
    );
    recordIds.media = recordIds.media.filter((id) => id !== removableMedia.id);
    const duplicate = await json<WriteResult>(
      await call("/admin/discoveries", "POST", {
        ...discoveryBody,
        url: `https://example.org/brief?source=${suffix}#second`,
      }),
      200,
    );
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.discovery.id, created.discovery.id);
    assert.equal(duplicate.discovery.placements.length, 2);

    await assert.rejects(
      database.insert(discoveries).values({
        slug: `direct-duplicate-${suffix}`,
        title: "Must fail at the unique URL index",
        url: `https://example.org/brief?source=${suffix}`,
        normalizedUrl: created.discovery.url,
      }),
      "normalized URL uniqueness must be enforced by PostgreSQL",
    );
    await assert.rejects(
      database.insert(discoveryPlacements).values({
        discoveryId: created.discovery.id,
        categoryId: categoryA.id,
        subcategoryId: subcategory.id,
        sortOrder: 99,
      }),
      "duplicate subcategory placements must be enforced by PostgreSQL",
    );
    await assert.rejects(
      database.insert(discoveryPlacements).values({
        discoveryId: created.discovery.id,
        categoryId: categoryA.id,
        subcategoryId: null,
        sortOrder: 99,
      }),
      "duplicate category-root placements must be enforced by PostgreSQL",
    );

    const duplicatePlacement = await call(
      `/admin/discoveries/${created.discovery.id}`,
      "PATCH",
      {
        ...discoveryBody,
        slug: created.discovery.slug,
        placements: [
          {
            categoryId: categoryA.id,
            subcategoryId: subcategory.id,
            sortOrder: 0,
          },
          {
            categoryId: categoryA.id,
            subcategoryId: subcategory.id,
            sortOrder: 1,
          },
        ],
      },
    );
    await json(duplicatePlacement, 409);

    const draftPublic = await call(
      `/catalog/discoveries/${created.discovery.slug}`,
    );
    await json(draftPublic, 404);
    const draftSearch = await json<DiscoveryRecord[]>(
      await call(
        `/catalog/search?q=${encodeURIComponent(`CMS resource ${suffix}`)}`,
      ),
      200,
    );
    assert.equal(draftSearch.length, 0, "drafts must not appear in public search");

    assert.equal(
      created.discovery.status,
      "draft",
      "content requests cannot directly set a publishing status",
    );
    const publishingAction = async (id: string, action: string) =>
      json<DiscoveryRecord>(
        await call(`/admin/discoveries/${id}/publishing-action`, "POST", { action }),
        200,
      );
    await publishingAction(created.discovery.id, "submit_for_review");
    await json(
      await call(`/catalog/discoveries/${created.discovery.slug}`),
      404,
    );
    const published = await publishingAction(created.discovery.id, "approve");
    const publicMedia = await fetch(new URL(mediaAsset.mediaUrl, baseUrl));
    assert.equal(publicMedia.status, 200, "media attached to published content is public");
    await publicMedia.arrayBuffer();

    const archived = await json<WriteResult>(
      await call("/admin/discoveries", "POST", {
        title: `CMS archived resource ${suffix}`,
        url: `https://archive.example.org/${suffix}`,
        summary: null,
        description: null,
        status: "published",
        tags: [],
        placements: [],
      }),
      201,
    );
    recordIds.discoveries.push(archived.discovery.id);
    await publishingAction(archived.discovery.id, "archive");
    await json(
      await call(`/catalog/discoveries/${archived.discovery.slug}`),
      404,
    );
    const archivedSearch = await json<DiscoveryRecord[]>(
      await call(
        `/catalog/search?q=${encodeURIComponent(`CMS archived resource ${suffix}`)}`,
      ),
      200,
    );
    assert.equal(archivedSearch.length, 0, "archived discoveries must not appear publicly");

    const second = await json<WriteResult>(
      await call("/admin/discoveries", "POST", {
        title: `CMS second resource ${suffix}`,
        url: `https://example.org/brief?source=other-${suffix}`,
        summary: null,
        description: null,
        status: "draft",
        tags: [],
        placements: [
          { categoryId: categoryA.id, subcategoryId: null, sortOrder: 1 },
        ],
      }),
      201,
    );
    recordIds.discoveries.push(second.discovery.id);
    await publishingAction(second.discovery.id, "submit_for_review");
    const secondPublished = await publishingAction(second.discovery.id, "approve");

    const categoryPage = await json<{
      discoveries: DiscoveryRecord[];
      subcategories: Array<{ id: string; slug: string }>;
    }>(
      await call(`/catalog/categories/${categoryA.slug}`),
      200,
    );
    assert.deepEqual(
      categoryPage.discoveries.map((item) => item.id).sort(),
      [published.id, secondPublished.id].sort(),
    );
    assert.equal(categoryPage.subcategories[0]?.id, subcategory.id);
    const subcategoryPage = await json<{ discoveries: DiscoveryRecord[] }>(
      await call(
        `/catalog/categories/${categoryA.slug}/${subcategory.slug}`,
      ),
      200,
    );
    assert.equal(subcategoryPage.discoveries[0]?.id, created.discovery.id);
    const searchResults = await json<DiscoveryRecord[]>(
      await call(`/catalog/search?q=${encodeURIComponent(`CMS resource ${suffix}`)}`),
      200,
    );
    assert.equal(searchResults[0]?.id, created.discovery.id);

    const movedSubcategory = await json<{ id: string; slug: string }>(
      await call(`/admin/subcategories/${subcategory.id}`, "PATCH", {
        categoryId: categoryB.id,
        name: `CMS Subcategory ${suffix}`,
        slug: subcategory.slug,
        sortOrder: 2,
        isVisible: true,
      }),
      200,
    );
    const afterMove = await json<AdminCatalog>(
      await call("/admin/catalog"),
      200,
    );
    const movedDiscovery = afterMove.discoveries.find(
      (item) => item.id === created.discovery.id,
    );
    assert.ok(
      movedDiscovery?.placements.some(
        (placement) =>
          placement.categoryId === categoryB.id &&
          placement.subcategoryId === movedSubcategory.id,
      ),
      "moving a subcategory must move its placement references",
    );
    await json(
      await call(`/catalog/categories/${categoryA.slug}/${subcategory.slug}`),
      404,
    );
    const movedPublicPage = await json<{ discoveries: DiscoveryRecord[] }>(
      await call(
        `/catalog/categories/${categoryB.slug}/${movedSubcategory.slug}`,
      ),
      200,
    );
    assert.equal(movedPublicPage.discoveries[0]?.id, created.discovery.id);

    await call(`/admin/categories/${categoryB.id}`, "PATCH").then((response) =>
      json(response, 400),
    );
    await json(
      await call(`/admin/categories/${categoryA.id}`, "DELETE"),
      409,
    );

    const hiddenCategory = await json<{ id: string; slug: string }>(
      await call(`/admin/categories/${categoryB.id}`, "PATCH", {
        name: `CMS Destination ${suffix}`,
        slug: categoryB.slug,
        description: null,
        sortOrder: 1,
        isVisible: false,
      }),
      200,
    );
    await json(
      await call(`/catalog/categories/${hiddenCategory.slug}`),
      404,
    );
    await json(
      await call(
        `/catalog/categories/${hiddenCategory.slug}/${movedSubcategory.slug}`,
      ),
      404,
    );
    await call(`/admin/categories/${categoryB.id}`, "PATCH", {
      name: `CMS Destination ${suffix}`,
      slug: categoryB.slug,
      description: null,
      sortOrder: 1,
      isVisible: true,
    }).then((response) => json(response, 200));

    await json(
      await call(`/admin/subcategories/${subcategory.id}`, "DELETE", {
        moveDiscoveriesToCategoryRoot: true,
      }),
      204,
    );
    recordIds.subcategories = recordIds.subcategories.filter(
      (id) => id !== subcategory.id,
    );
    const afterSubcategoryDelete = await json<AdminCatalog>(
      await call("/admin/catalog"),
      200,
    );
    assert.ok(
      afterSubcategoryDelete.discoveries
        .find((item) => item.id === created.discovery.id)
        ?.placements.some(
          (placement) =>
            placement.categoryId === categoryB.id &&
            placement.subcategoryId === null,
        ),
      "subcategory deletion should preserve placements at the category root",
    );

    const updatedTag = await json<{ id: string; name: string }>(
      await call(`/admin/tags/${tag.id}`, "PATCH", {
          name: "Research tools",
      }),
      200,
    );
    assert.equal(updatedTag.name, "Research tools");
    const adminCatalog = await json<AdminCatalog>(
      await call("/admin/catalog"),
      200,
    );
    assert.ok(
      adminCatalog.discoveries
        .find((item) => item.id === created.discovery.id)
        ?.tags.some((item) => item.name === "Research tools"),
    );

    const collection = await json<{
      id: string;
      slug: string;
      discoveryIds: string[];
    }>(
      await call("/admin/collections", "POST", {
        name: `CMS collection ${suffix}`,
        description: "Ordered integration test membership.",
        sortOrder: 4,
        discoveryIds: [secondPublished.id, created.discovery.id],
      }),
      201,
    );
    recordIds.collections.push(collection.id);
    assert.deepEqual(
      collection.discoveryIds,
      [secondPublished.id, created.discovery.id],
    );
    const collectionPage = await json<{ discoveries: DiscoveryRecord[] }>(
      await call(`/catalog/collections/${collection.slug}`),
      200,
    );
    assert.deepEqual(
      collectionPage.discoveries.map((item) => item.id),
      [secondPublished.id, created.discovery.id],
    );
    const reorderedCollection = await json<{ discoveryIds: string[] }>(
      await call(`/admin/collections/${collection.id}`, "PATCH", {
        name: `CMS collection ${suffix}`,
        slug: collection.slug,
        description: "Reordered test membership.",
        sortOrder: 5,
        discoveryIds: [created.discovery.id, secondPublished.id],
      }),
      200,
    );
    assert.deepEqual(
      reorderedCollection.discoveryIds,
      [created.discovery.id, secondPublished.id],
    );

    const overview = await json<{
      discoveries: number;
      publishedDiscoveries: number;
      draftDiscoveries: number;
      reviewDiscoveries: number;
      archivedDiscoveries: number;
    }>(await call("/admin/overview"), 200);
    assert.ok(overview.discoveries >= 2);
    assert.ok(overview.publishedDiscoveries >= 2);

    const versions = await json<Array<{
      id: string;
      action: string;
      entityId: string;
      snapshot: Record<string, unknown>;
    }>>(
      await call(
        `/admin/versions?entityType=discovery&entityId=${created.discovery.id}`,
      ),
      200,
    );
    const originalVersion = versions.find((version) => version.action === "created");
    assert.ok(originalVersion, "discovery creation should create a snapshot");
    const restored = await json<{ entityId: string; restoredFromVersionId: string }>(
      await call(`/admin/versions/${originalVersion.id}/restore`, "POST"),
      200,
    );
    assert.equal(restored.entityId, created.discovery.id);
    assert.equal(restored.restoredFromVersionId, originalVersion.id);
    await json(
      await call(`/catalog/discoveries/${created.discovery.slug}`),
      404,
    );
    const afterRestore = await json<Array<{ action: string }>>(
      await call(
        `/admin/versions?entityType=discovery&entityId=${created.discovery.id}`,
      ),
      200,
    );
    assert.equal(afterRestore[0]?.action, "restored");

    const auditEvents = await json<Array<{ action: string }>>(
      await call("/admin/audit"),
      200,
    );
    assert.ok(auditEvents.some((event) => event.action === "media.uploaded"));
    assert.ok(auditEvents.some((event) => event.action === "media.updated"));
    assert.ok(auditEvents.some((event) => event.action === "publishing.discovery.published"));
    assert.ok(auditEvents.some((event) => event.action === "content.discovery.restored"));

    await json(
      await call(`/admin/collections/${collection.id}`, "DELETE"),
      204,
    );
    recordIds.collections = recordIds.collections.filter(
      (id) => id !== collection.id,
    );
    await json(
      await call(`/admin/discoveries/${created.discovery.id}`, "DELETE"),
      204,
    );
    recordIds.discoveries = recordIds.discoveries.filter(
      (id) => id !== created.discovery.id,
    );
    await json(
      await call(`/admin/discoveries/${secondPublished.id}`, "DELETE"),
      204,
    );
    await json(
      await call(`/admin/discoveries/${archived.discovery.id}`, "DELETE"),
      204,
    );
    recordIds.discoveries = recordIds.discoveries.filter(
      (id) => id !== secondPublished.id,
    );
    await json(await call(`/admin/tags/${tag.id}`, "DELETE"), 204);
    recordIds.tags = recordIds.tags.filter((id) => id !== tag.id);

    await json(
      await call(`/admin/categories/${categoryA.id}`, "DELETE"),
      204,
    );
    recordIds.categories = recordIds.categories.filter(
      (id) => id !== categoryA.id,
    );
    await json(
      await call(`/admin/categories/${categoryB.id}`, "DELETE"),
      204,
    );
    recordIds.categories = recordIds.categories.filter(
      (id) => id !== categoryB.id,
    );
  },
);
