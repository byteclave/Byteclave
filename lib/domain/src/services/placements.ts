import {
  discoveryPlacementInputSchema,
  type DiscoveryPlacementInput,
  type ValidatedDiscoveryPlacementInput,
} from "../schemas/catalog";

export interface DiscoveryPlacementRepository {
  insertIfAbsent(
    placement: ValidatedDiscoveryPlacementInput,
  ): Promise<boolean>;
}

export async function createDiscoveryPlacement(
  repository: DiscoveryPlacementRepository,
  input: DiscoveryPlacementInput,
): Promise<{ created: boolean }> {
  const placement = discoveryPlacementInputSchema.parse(input);
  return { created: await repository.insertIfAbsent(placement) };
}
