import { and, eq, isNull, ne, sql } from "drizzle-orm";
import {
  PermissionDeniedError,
  acceptInvitationSchema,
  assertCanManageUser,
  accountCredentialUpdateSchema,
  hasPermission,
  invitationInputSchema,
  passwordResetInputSchema,
  roleAssignmentSchema,
  type RoleCode,
} from "@workspace/domain";
import { getDb } from "../index";
import {
  adminInvitations,
  applicationSettings,
  authSessions,
  auditLogs,
  passwordResetTokens,
  permissions,
  rolePermissions,
  userRoles,
  users,
} from "../schema";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "./passwords";

export type AdminActor = {
  userId: string;
  email: string;
  roles: readonly RoleCode[];
  permissions: readonly string[];
};

function requirePermission(actor: AdminActor, permission: string): void {
  if (!hasPermission(actor.permissions, permission)) {
    throw new PermissionDeniedError();
  }
}

async function getProtectedOwnerId(
  executor: Pick<ReturnType<typeof getDb>, "select">,
): Promise<string | null> {
  const [row] = await executor
    .select({ value: applicationSettings.value })
    .from(applicationSettings)
    .where(eq(applicationSettings.key, "security.ownerUserId"))
    .limit(1);
  return typeof row?.value === "string" ? row.value : null;
}

async function getUserRoles(userId: string): Promise<RoleCode[]> {
  const rows = await getDb()
    .select({ roleCode: userRoles.roleCode })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map(({ roleCode }) => roleCode);
}

export async function createAdminInvitation(
  rawInput: unknown,
  actor: AdminActor,
): Promise<{ id: string; token: string; expiresAt: Date; role: "ADMIN" | "EDITOR" }> {
  requirePermission(actor, "users:manage");
  const input = invitationInputSchema.parse(rawInput);
  assertCanManageUser({
    actorRoles: actor.roles,
    targetRoles: [],
    nextRole: input.role,
    isProtectedOwner: false,
  });

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (existing) {
      throw new Error("An account already exists for this email address.");
    }
    await tx
      .delete(adminInvitations)
      .where(
        and(
          eq(adminInvitations.email, input.email),
          isNull(adminInvitations.acceptedAt),
        ),
      );
    const [invitation] = await tx
      .insert(adminInvitations)
      .values({
        email: input.email,
        roleCode: input.role,
        tokenHash: hashOpaqueToken(token),
        createdByUserId: actor.userId,
        expiresAt,
      })
      .returning({ id: adminInvitations.id });
    if (!invitation) throw new Error("Could not create the administrator invitation.");
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      entityType: "admin_invitation",
      entityId: invitation.id,
      action: "admin.invitation.created",
      changes: { email: input.email, role: input.role, expiresAt: expiresAt.toISOString() },
    });
    return invitation;
  });
  return { id: result.id, token, expiresAt, role: input.role };
}

export async function acceptAdminInvitation(rawInput: unknown): Promise<{
  userId: string;
  email: string;
  displayName: string;
}> {
  const input = acceptInvitationSchema.parse(rawInput);
  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  return db.transaction(async (tx) => {
    const now = new Date();
    const [invitation] = await tx
      .select()
      .from(adminInvitations)
      .where(
        and(
          eq(adminInvitations.tokenHash, hashOpaqueToken(input.token)),
          isNull(adminInvitations.acceptedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!invitation || invitation.expiresAt <= now) {
      throw new Error("This invitation is invalid or has expired.");
    }
    if (!invitation.createdByUserId) {
      throw new Error("This invitation is no longer valid.");
    }
    const [inviter] = await tx
      .select({ id: users.id, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, invitation.createdByUserId))
      .for("update")
      .limit(1);
    if (!inviter || inviter.disabledAt) {
      throw new Error("This invitation is no longer valid.");
    }
    const [inviterRoleRows, inviterPermissionRows] = await Promise.all([
      tx
        .select({ roleCode: userRoles.roleCode })
        .from(userRoles)
        .where(eq(userRoles.userId, inviter.id)),
      tx
        .select({ key: permissions.key })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(userRoles.roleCode, rolePermissions.roleCode))
        .innerJoin(permissions, eq(rolePermissions.permissionKey, permissions.key))
        .where(eq(userRoles.userId, inviter.id)),
    ]);
    const inviterRoles = inviterRoleRows.map(({ roleCode }) => roleCode);
    const inviterPermissions = inviterPermissionRows.map(({ key }) => key);
    if (
      !hasPermission(inviterPermissions, "users:manage") ||
      (invitation.roleCode === "ADMIN" && !inviterRoles.includes("OWNER"))
    ) {
      throw new Error("This invitation is no longer authorized.");
    }
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${invitation.email}`)
      .limit(1);
    if (existing) throw new Error("An account already exists for this email address.");
    const [user] = await tx
      .insert(users)
      .values({
        email: invitation.email,
        displayName: input.displayName,
        passwordHash,
      })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });
    if (!user) throw new Error("Could not create the invited account.");
    await tx.execute(sql`SELECT set_config('app.actor_user_id', ${inviter.id}, true)`);
    await tx.insert(userRoles).values({
      userId: user.id,
      roleCode: invitation.roleCode,
      assignedByUserId: inviter.id,
    });
    await tx
      .update(adminInvitations)
      .set({ acceptedAt: now, updatedAt: now })
      .where(eq(adminInvitations.id, invitation.id));
    await tx.insert(auditLogs).values({
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      action: "admin.invitation.accepted",
      changes: { role: invitation.roleCode },
    });
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    };
  });
}

export async function changeManagedUserRole(
  rawInput: unknown,
  actor: AdminActor,
): Promise<RoleCode> {
  requirePermission(actor, "users:manage");
  const input = roleAssignmentSchema.parse(rawInput);
  if (input.userId === actor.userId) {
    throw new PermissionDeniedError("You cannot change your own role.");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1);
    if (!target) throw new Error("The requested user does not exist.");
    const targetRoles = await tx
      .select({ roleCode: userRoles.roleCode })
      .from(userRoles)
      .where(eq(userRoles.userId, target.id))
      .for("update");
    const currentRoles = targetRoles.map(({ roleCode }) => roleCode);
    const ownerId = await getProtectedOwnerId(tx);
    assertCanManageUser({
      actorRoles: actor.roles,
      targetRoles: currentRoles,
      nextRole: input.role,
      isProtectedOwner: ownerId === target.id,
    });
    if (currentRoles.length === 1 && currentRoles[0] === input.role) return input.role;

    await tx.execute(sql`SELECT set_config('app.actor_user_id', ${actor.userId}, true)`);
    await tx.delete(userRoles).where(eq(userRoles.userId, target.id));
    await tx.insert(userRoles).values({
      userId: target.id,
      roleCode: input.role,
      assignedByUserId: actor.userId,
    });
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(authSessions.userId, target.id), isNull(authSessions.revokedAt)));
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      entityType: "user",
      entityId: target.id,
      action: "user.role.updated",
      changes: { roles: { from: currentRoles, to: [input.role] } },
    });
    return input.role;
  });
}

export async function setManagedUserDisabled(
  userId: string,
  disabled: boolean,
  actor: AdminActor,
): Promise<void> {
  requirePermission(actor, "users:manage");
  if (userId === actor.userId) {
    throw new PermissionDeniedError("You cannot disable your own account.");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!target) throw new Error("The requested user does not exist.");
    const targetRoles = await tx
      .select({ roleCode: userRoles.roleCode })
      .from(userRoles)
      .where(eq(userRoles.userId, target.id))
      .for("update");
    const roles = targetRoles.map(({ roleCode }) => roleCode);
    const ownerId = await getProtectedOwnerId(tx);
    assertCanManageUser({
      actorRoles: actor.roles,
      targetRoles: roles,
      nextRole: roles[0],
      isProtectedOwner: ownerId === target.id,
    });
    if (Boolean(target.disabledAt) === disabled) return;
    const now = new Date();
    await tx.execute(sql`SELECT set_config('app.actor_user_id', ${actor.userId}, true)`);
    await tx
      .update(users)
      .set({ disabledAt: disabled ? now : null, updatedAt: now })
      .where(eq(users.id, target.id));
    if (disabled) {
      await tx
        .update(authSessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(authSessions.userId, target.id), isNull(authSessions.revokedAt)));
    }
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      entityType: "user",
      entityId: target.id,
      action: disabled ? "user.disabled" : "user.enabled",
      changes: { disabled: { from: Boolean(target.disabledAt), to: disabled } },
    });
  });
}

export async function issueManagedPasswordReset(
  targetUserId: string,
  currentPassword: string,
  actor: AdminActor,
): Promise<{ token: string; expiresAt: Date }> {
  requirePermission(actor, "users:manage");
  const db = getDb();
  const [target] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw new Error("The requested user does not exist.");
  const [actingUser] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  if (
    !actingUser?.passwordHash ||
    !(await verifyPassword(currentPassword, actingUser.passwordHash))
  ) {
    throw new PermissionDeniedError("Current password is incorrect.");
  }
  const targetRoles = await getUserRoles(target.id);
  const ownerId = await getProtectedOwnerId(db);
  assertCanManageUser({
    actorRoles: actor.roles,
    targetRoles,
    nextRole: targetRoles[0],
    isProtectedOwner: ownerId === target.id,
  });
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)));
    const [reset] = await tx
      .insert(passwordResetTokens)
      .values({
        userId: target.id,
        tokenHash: hashOpaqueToken(token),
        createdByUserId: actor.userId,
        expiresAt,
      })
      .returning({ id: passwordResetTokens.id });
    if (!reset) throw new Error("Could not create a password reset link.");
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      entityType: "password_reset",
      entityId: reset.id,
      action: "auth.password_reset.issued",
      changes: { userId: target.id, expiresAt: expiresAt.toISOString() },
    });
  });
  return { token, expiresAt };
}

export async function completePasswordReset(rawInput: unknown): Promise<void> {
  const input = passwordResetInputSchema.parse(rawInput);
  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  await db.transaction(async (tx) => {
    const now = new Date();
    const [reset] = await tx
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashOpaqueToken(input.token)),
          isNull(passwordResetTokens.usedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!reset || reset.expiresAt <= now) {
      throw new Error("This password reset link is invalid or has expired.");
    }
    await tx.execute(sql`SELECT set_config('app.password_reset_user_id', ${reset.userId}, true)`);
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, reset.userId));
    await tx
      .update(authSessions)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(authSessions.userId, reset.userId), isNull(authSessions.revokedAt)));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(passwordResetTokens.id, reset.id));
    await tx.insert(auditLogs).values({
      actorUserId: reset.userId,
      entityType: "user",
      entityId: reset.userId,
      action: "auth.password_reset.completed",
      changes: { passwordChanged: true, sessionsRevoked: true },
    });
  });
}

export async function updateOwnCredentials(
  rawInput: unknown,
  actor: AdminActor,
  currentSessionId: string,
): Promise<{ email: string }> {
  const input = accountCredentialUpdateSchema.parse(rawInput);
  const db = getDb();
  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  if (!account?.passwordHash || !(await verifyPassword(input.currentPassword, account.passwordHash))) {
    throw new PermissionDeniedError("Current password is incorrect.");
  }
  if (input.newEmail) {
    const [emailOwner] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.newEmail}`)
      .limit(1);
    if (emailOwner && emailOwner.id !== actor.userId) {
      throw new Error("That email address is already in use.");
    }
  }
  const nextPasswordHash = input.newPassword
    ? await hashPassword(input.newPassword)
    : undefined;
  const nextEmail = input.newEmail ?? account.email;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.actor_user_id', ${actor.userId}, true)`);
    await tx
      .update(users)
      .set({
        email: nextEmail,
        ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
        updatedAt: now,
      })
      .where(eq(users.id, actor.userId));
    await tx
      .update(authSessions)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(authSessions.userId, actor.userId),
          ne(authSessions.id, currentSessionId),
          isNull(authSessions.revokedAt),
        ),
      );
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      entityType: "user",
      entityId: actor.userId,
      action: "auth.credentials.updated",
      changes: {
        email: input.newEmail ? { from: account.email, to: nextEmail } : undefined,
        passwordChanged: Boolean(nextPasswordHash),
        otherSessionsRevoked: true,
      },
    });
  });
  return { email: nextEmail };
}
