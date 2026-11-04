import type { RoleCode } from "../schemas/common";

export class ProtectedOwnerError extends Error {
  constructor(message = "Only an Owner can change an Owner's role.") {
    super(message);
    this.name = "ProtectedOwnerError";
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super("At least one Owner must remain assigned.");
    this.name = "LastOwnerError";
  }
}

export function assertRoleChangeAllowed(input: {
  actorRoles: readonly RoleCode[];
  targetRoles: readonly RoleCode[];
  nextTargetRoles: readonly RoleCode[];
  ownerCount: number;
  actorUserId?: string;
  targetUserId?: string;
  protectedOwnerUserId?: string;
}): void {
  const targetIsOwner = input.targetRoles.includes("OWNER");
  const nextTargetIsOwner = input.nextTargetRoles.includes("OWNER");
  const actorIsTarget =
    input.actorUserId !== undefined &&
    input.actorUserId === input.targetUserId;

  if (
    input.protectedOwnerUserId !== undefined &&
    input.targetUserId === input.protectedOwnerUserId &&
    !actorIsTarget
  ) {
    throw new ProtectedOwnerError(
      "The configured Owner account cannot be changed by another user.",
    );
  }

  if (
    (targetIsOwner || nextTargetIsOwner) &&
    !input.actorRoles.includes("OWNER")
  ) {
    throw new ProtectedOwnerError();
  }
  if (targetIsOwner && !nextTargetIsOwner && input.ownerCount <= 1) {
    throw new LastOwnerError();
  }
}
