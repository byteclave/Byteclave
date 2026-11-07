import { eq } from "drizzle-orm";
import { publishingTransitionInputSchema } from "@workspace/domain/schemas";
import {
  assertPublishingTransition,
  InvalidPublishingTransitionError,
} from "@workspace/domain/services";
import { getDb } from "../index";
import { discoveries, publishingRecords } from "../schema/index";
import { recordContentAudit } from "./content-management";

export class DiscoveryNotFoundError extends Error {
  constructor(discoveryId: string) {
    super(`Discovery "${discoveryId}" does not exist.`);
    this.name = "DiscoveryNotFoundError";
  }
}

export async function transitionDiscovery(
  input: unknown,
  actorUserId: string | null = null,
) {
  const transition = publishingTransitionInputSchema.parse(input);
  const database = getDb();

  return database.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: discoveries.id, status: discoveries.status })
      .from(discoveries)
      .where(eq(discoveries.id, transition.discoveryId))
      .for("update")
      .limit(1);

    if (!current) throw new DiscoveryNotFoundError(transition.discoveryId);
    assertPublishingTransition(current.status, transition.nextStatus);

    const [updated] = await tx
      .update(discoveries)
      .set({ status: transition.nextStatus, updatedAt: new Date() })
      .where(eq(discoveries.id, transition.discoveryId))
      .returning();

    if (!updated) {
      throw new Error("Discovery status update did not return a record.");
    }

    await tx.insert(publishingRecords).values({
      discoveryId: transition.discoveryId,
      fromStatus: current.status,
      toStatus: transition.nextStatus,
      actorUserId,
      note: transition.note ?? null,
    });
    await recordContentAudit(tx, {
      actorUserId,
      entityType: "discovery",
      entityId: transition.discoveryId,
      action: `publishing.discovery.${transition.nextStatus}`,
      changes: {
        before: { status: current.status },
        after: { status: transition.nextStatus },
        note: transition.note ?? null,
      },
    });

    return updated;
  });
}

export async function performPublishingAction(
  discoveryId: string,
  action: "submit_for_review" | "approve" | "reject" | "unpublish" | "archive" | "restore",
  actorUserId: string,
  note?: string,
) {
  const [current] = await getDb()
    .select({ status: discoveries.status })
    .from(discoveries)
    .where(eq(discoveries.id, discoveryId))
    .limit(1);
  if (!current) throw new DiscoveryNotFoundError(discoveryId);

  const nextStatus = {
    submit_for_review: "review",
    approve: "published",
    reject: "draft",
    unpublish: "draft",
    archive: "archived",
    restore: "draft",
  }[action] as typeof current.status;

  if (
    (action === "submit_for_review" && current.status !== "draft") ||
    ((action === "approve" || action === "reject") && current.status !== "review") ||
    (action === "unpublish" && current.status !== "published") ||
    (action === "restore" && current.status !== "archived") ||
    (action === "archive" && current.status === "archived")
  ) {
    throw new InvalidPublishingTransitionError(current.status, nextStatus);
  }

  return transitionDiscovery(
    { discoveryId, nextStatus, note },
    actorUserId,
  );
}

export { InvalidPublishingTransitionError };
