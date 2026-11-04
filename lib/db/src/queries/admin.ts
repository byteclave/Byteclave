import { count, countDistinct, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../index";
import {
  auditLogs,
  categories,
  collections,
  discoveries,
  tags,
  userRoles,
  users,
} from "../schema";

export async function getAdminOverviewMetrics() {
  const db = getDb();
  const [
    [discoveryCount],
    [publishedCount],
    [unpublishedCount],
    [categoryCount],
    [collectionCount],
    [tagCount],
    [adminCount],
  ] = await Promise.all([
    db.select({ total: count() }).from(discoveries),
    db
      .select({ total: count() })
      .from(discoveries)
      .where(eq(discoveries.status, "published")),
    db
      .select({ total: count() })
      .from(discoveries)
      .where(inArray(discoveries.status, ["draft", "review", "archived"])),
    db.select({ total: count() }).from(categories),
    db.select({ total: count() }).from(collections),
    db.select({ total: count() }).from(tags),
    db
      .select({ total: countDistinct(userRoles.userId) })
      .from(userRoles)
      .where(inArray(userRoles.roleCode, ["OWNER", "ADMIN"])),
  ]);
  return {
    discoveries: discoveryCount?.total ?? 0,
    publishedDiscoveries: publishedCount?.total ?? 0,
    unpublishedDiscoveries: unpublishedCount?.total ?? 0,
    categories: categoryCount?.total ?? 0,
    collections: collectionCount?.total ?? 0,
    tags: tagCount?.total ?? 0,
    administrativeUsers: adminCount?.total ?? 0,
  };
}

export async function listManagedUsers(actorRoles: readonly string[]) {
  const query = getDb()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: userRoles.roleCode,
      disabledAt: users.disabledAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(userRoles, eq(users.id, userRoles.userId));
  return actorRoles.includes("OWNER")
    ? query.orderBy(users.email)
    : query.where(eq(userRoles.roleCode, "EDITOR")).orderBy(users.email);
}

export async function listAdminAuditEvents(limit = 100) {
  return getDb()
    .select({
      id: auditLogs.id,
      actorEmail: users.email,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      changes: auditLogs.changes,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}
