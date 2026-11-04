import { eq } from "drizzle-orm";
import { publishingTransitionInputSchema } from "@workspace/domain/schemas";
import {
  assertPublishingTransition,
  InvalidPublishingTransitionError,
} from "@workspace/domain/services";
import { getDb } from "../index";
import { discoveries, publishingRecords } from "../schema/index";

export class DiscoveryNotFoundError extends Error {
  constructor(discoveryId: string) {
    super(`Discovery "${discoveryId}" does not exist.`);
    this.name = "DiscoveryNotFoundError";
  }
}

export async function transitionDiscovery(input: unknown) {
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
      actorUserId: transition.actorUserId ?? null,
      note: transition.note ?? null,
    });

    return updated;
  });
}

export { InvalidPublishingTransitionError };
