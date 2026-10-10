import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  assertRoleChangeAllowed,
  userRoleChangeSchema,
  type RoleCode,
} from "@workspace/domain";
import { parseServerEnvironment } from "@workspace/config";
import { getDb } from "../index";
import { auditLogs, userRoles, users } from "../schema";

export class InsufficientRoleChangePermissionError extends Error {
  constructor() {
    super("An ADMIN or OWNER role is required to change user roles.");
    this.name = "InsufficientRoleChangePermissionError";
  }
}

export async function changeUserRoles(
  input: unknown,
  actorUserId: string,
): Promise<RoleCode[]> {
  const change = userRoleChangeSchema.parse(input);
  const actorId = z.string().uuid().parse(actorUserId);
  const { INITIAL_OWNER_EMAIL } = parseServerEnvironment();

  return getDb().transaction(async (transaction) => {
    const [target] = await transaction
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, change.userId))
      .limit(1);
    if (!target) {
      throw new Error(`User "${change.userId}" does not exist.`);
    }

    const ownerRows = await transaction
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleCode, "OWNER"))
      .for("update");

    const [actorRoleRows, targetRoleRows] = await Promise.all([
      transaction
        .select({ roleCode: userRoles.roleCode })
        .from(userRoles)
        .where(eq(userRoles.userId, actorId)),
      transaction
        .select({ roleCode: userRoles.roleCode })
        .from(userRoles)
        .where(eq(userRoles.userId, target.id))
        .for("update"),
    ]);

    const actorRoles = actorRoleRows.map(({ roleCode }) => roleCode);
    if (!actorRoles.includes("OWNER") && !actorRoles.includes("ADMIN")) {
      throw new InsufficientRoleChangePermissionError();
    }

    const targetRoles = targetRoleRows.map(({ roleCode }) => roleCode);
    const protectedOwnerUserId =
      target.email.trim().toLowerCase() === INITIAL_OWNER_EMAIL
        ? target.id
        : undefined;

    assertRoleChangeAllowed({
      actorRoles,
      targetRoles,
      nextTargetRoles: change.roles,
      ownerCount: ownerRows.length,
      actorUserId: actorId,
      targetUserId: target.id,
      protectedOwnerUserId,
    });

    const currentSorted = [...targetRoles].sort();
    const nextSorted = [...change.roles].sort();
    if (
      currentSorted.length === nextSorted.length &&
      currentSorted.every((role, index) => role === nextSorted[index])
    ) {
      return targetRoles;
    }

    await transaction
      .delete(userRoles)
      .where(eq(userRoles.userId, target.id));
    await transaction.insert(userRoles).values(
      change.roles.map((roleCode) => ({
        userId: target.id,
        roleCode,
        assignedByUserId: actorId,
      })),
    );
    await transaction.insert(auditLogs).values({
      actorUserId: actorId,
      entityType: "user",
      entityId: target.id,
      action: "roles.updated",
      changes: {
        roles: {
          from: targetRoles,
          to: change.roles,
        },
      },
    });

    return change.roles;
  });
}
