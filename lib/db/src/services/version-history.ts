import { and, desc, eq } from "drizzle-orm";
import { contentVersionEntitySchema } from "@workspace/domain/schemas";
import { getDb } from "../index";
import { entityContentVersions, users } from "../schema";

export async function listContentVersions(input: {
  entityType?: string;
  entityId?: string;
  limit?: number;
} = {}) {
  const entityType = input.entityType
    ? contentVersionEntitySchema.parse(input.entityType)
    : undefined;
  const conditions = [
    entityType ? eq(entityContentVersions.entityType, entityType) : undefined,
    input.entityId ? eq(entityContentVersions.entityId, input.entityId) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const query = getDb()
    .select({
      id: entityContentVersions.id,
      entityType: entityContentVersions.entityType,
      entityId: entityContentVersions.entityId,
      action: entityContentVersions.action,
      snapshot: entityContentVersions.snapshot,
      sourceVersionId: entityContentVersions.sourceVersionId,
      actorUserId: entityContentVersions.actorUserId,
      actorEmail: users.email,
      createdAt: entityContentVersions.createdAt,
    })
    .from(entityContentVersions)
    .leftJoin(users, eq(entityContentVersions.actorUserId, users.id));
  const rows = await query
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(entityContentVersions.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 200));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
