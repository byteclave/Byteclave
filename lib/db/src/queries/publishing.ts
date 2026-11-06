import { desc, eq } from "drizzle-orm";
import { getDb } from "../index";
import {
  discoveries,
  publishingRecords,
  users,
} from "../schema";

export async function getPublishingQueue() {
  const db = getDb();
  const [items, history] = await Promise.all([
    db
      .select({
        id: discoveries.id,
        slug: discoveries.slug,
        title: discoveries.title,
        summary: discoveries.summary,
        description: discoveries.description,
        url: discoveries.url,
        status: discoveries.status,
        updatedAt: discoveries.updatedAt,
      })
      .from(discoveries)
      .orderBy(desc(discoveries.updatedAt)),
    db
      .select({
        id: publishingRecords.id,
        discoveryId: publishingRecords.discoveryId,
        fromStatus: publishingRecords.fromStatus,
        toStatus: publishingRecords.toStatus,
        actorUserId: publishingRecords.actorUserId,
        actorEmail: users.email,
        note: publishingRecords.note,
        createdAt: publishingRecords.createdAt,
      })
      .from(publishingRecords)
      .leftJoin(users, eq(publishingRecords.actorUserId, users.id))
      .orderBy(desc(publishingRecords.createdAt))
      .limit(200),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      updatedAt: item.updatedAt.toISOString(),
    })),
    history: history.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function getAdminDiscoveryPreview(id: string) {
  const [discovery] = await getDb()
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, id))
    .limit(1);
  if (!discovery) return null;
  return discovery;
}
