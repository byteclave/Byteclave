import type { PublishingStatus } from "../schemas/common";

const allowedTransitions: Record<PublishingStatus, readonly PublishingStatus[]> =
  {
    draft: ["review", "archived"],
    review: ["draft", "published", "archived"],
    published: ["review", "draft", "archived"],
    archived: ["draft"],
  };

export class InvalidPublishingTransitionError extends Error {
  constructor(from: PublishingStatus, to: PublishingStatus) {
    super(`Cannot change publishing state from ${from} to ${to}.`);
    this.name = "InvalidPublishingTransitionError";
  }
}

export function assertPublishingTransition(
  from: PublishingStatus,
  to: PublishingStatus,
): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new InvalidPublishingTransitionError(from, to);
  }
}

export function getAllowedPublishingTransitions(
  from: PublishingStatus,
): readonly PublishingStatus[] {
  return allowedTransitions[from];
}
