import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
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
    ];
    const permissionDescriptions: Record<string, string> = {
      "admin:access": "Integration test administrator access.",
      "catalog:read": "Integration test catalog read.",
      "categories:manage": "Integration test taxonomy management.",
      "discoveries:manage": "Integration test discovery management.",
      "publishing:review": "Integration test review access.",
      "publishing:publish": "Integration test publish access.",
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

    t.after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      if (recordIds.collections.length > 0) {
        await database
          .delete(collections)
          .where(inArray(collections.id, recordIds.collections));
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
    });

    const unauthenticated = await call("/admin/catalog");
    await json(unauthenticated, 401);

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
      status: "draft",
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

    let current = created.discovery;
    const updateStatus = async (status: string) => {
      const result = await json<WriteResult>(
        await call(`/admin/discoveries/${current.id}`, "PATCH", {
          slug: current.slug,
          title: current.title,
          url: current.url,
          summary: current.summary,
          description: current.description,
          status,
          tags: [`CMS Research ${suffix}`],
          placements: [
            { categoryId: categoryA.id, subcategoryId: null, sortOrder: 0 },
            {
              categoryId: categoryA.id,
              subcategoryId: subcategory.id,
              sortOrder: 0,
            },
          ],
        }),
        200,
      );
      current = result.discovery;
    };
    await updateStatus("review");
    await json(
      await call(`/catalog/discoveries/${created.discovery.slug}`),
      404,
    );
    await updateStatus("published");

    const archived = await json<WriteResult>(
      await call("/admin/discoveries", "POST", {
        title: `CMS archived resource ${suffix}`,
        url: `https://archive.example.org/${suffix}`,
        summary: null,
        description: null,
        status: "archived",
        tags: [],
        placements: [],
      }),
      201,
    );
    recordIds.discoveries.push(archived.discovery.id);
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
    const secondReview = await json<WriteResult>(
      await call(`/admin/discoveries/${second.discovery.id}`, "PATCH", {
        slug: second.discovery.slug,
        title: second.discovery.title,
        url: second.discovery.url,
        summary: second.discovery.summary,
        description: second.discovery.description,
        status: "review",
        tags: [],
        placements: [
          { categoryId: categoryA.id, subcategoryId: null, sortOrder: 1 },
        ],
      }),
      200,
    );
    const secondPublished = await json<WriteResult>(
      await call(`/admin/discoveries/${second.discovery.id}`, "PATCH", {
        slug: secondReview.discovery.slug,
        title: secondReview.discovery.title,
        url: secondReview.discovery.url,
        summary: secondReview.discovery.summary,
        description: secondReview.discovery.description,
        status: "published",
        tags: [],
        placements: [
          { categoryId: categoryA.id, subcategoryId: null, sortOrder: 1 },
        ],
      }),
      200,
    );

    const categoryPage = await json<{
      discoveries: DiscoveryRecord[];
      subcategories: Array<{ id: string; slug: string }>;
    }>(
      await call(`/catalog/categories/${categoryA.slug}`),
      200,
    );
    assert.deepEqual(
      categoryPage.discoveries.map((item) => item.id).sort(),
      [created.discovery.id, secondPublished.discovery.id].sort(),
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
        discoveryIds: [secondPublished.discovery.id, created.discovery.id],
      }),
      201,
    );
    recordIds.collections.push(collection.id);
    assert.deepEqual(
      collection.discoveryIds,
      [secondPublished.discovery.id, created.discovery.id],
    );
    const collectionPage = await json<{ discoveries: DiscoveryRecord[] }>(
      await call(`/catalog/collections/${collection.slug}`),
      200,
    );
    assert.deepEqual(
      collectionPage.discoveries.map((item) => item.id),
      [secondPublished.discovery.id, created.discovery.id],
    );
    const reorderedCollection = await json<{ discoveryIds: string[] }>(
      await call(`/admin/collections/${collection.id}`, "PATCH", {
        name: `CMS collection ${suffix}`,
        slug: collection.slug,
        description: "Reordered test membership.",
        sortOrder: 5,
        discoveryIds: [created.discovery.id, secondPublished.discovery.id],
      }),
      200,
    );
    assert.deepEqual(
      reorderedCollection.discoveryIds,
      [created.discovery.id, secondPublished.discovery.id],
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
      await call(`/admin/discoveries/${secondPublished.discovery.id}`, "DELETE"),
      204,
    );
    await json(
      await call(`/admin/discoveries/${archived.discovery.id}`, "DELETE"),
      204,
    );
    recordIds.discoveries = recordIds.discoveries.filter(
      (id) => id !== secondPublished.discovery.id,
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
