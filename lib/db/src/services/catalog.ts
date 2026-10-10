import { createDiscoveryPlacement } from "@workspace/domain/services";
import type { DiscoveryPlacementInput } from "@workspace/domain/schemas";
import { getDb } from "../index";
import { discoveryPlacements } from "../schema/index";

export async function placeDiscovery(input: DiscoveryPlacementInput) {
  return createDiscoveryPlacement(
    {
      async insertIfAbsent(placement) {
        const inserted = await getDb()
          .insert(discoveryPlacements)
          .values(placement)
          .onConflictDoNothing()
          .returning({ id: discoveryPlacements.id });
        return inserted.length > 0;
      },
    },
    input,
  );
}
