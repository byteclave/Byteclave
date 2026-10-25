import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  adminLoginSchema,
  hasPermission,
  type RoleCode,
} from "@workspace/domain";
import { parseServerEnvironment } from "@workspace/config";
import { getDb } from "../index";
import {
  authRateLimits,
  authSessions,
  auditLogs,
  permissions,
  rolePermissions,
  userRoles,
  users,
} from "../schema";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashRateLimitBucket,
  verifyPassword,
} from "./passwords";
import { getSecuritySettings } from "./security-settings";

export class LoginRateLimitError extends Error {
  constructor() {
    super("Too many unsuccessful sign-in attempts. Try again later.");
    this.name = "LoginRateLimitError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email or password is incorrect.");
    this.name = "InvalidCredentialsError";
  }
}

export type AdminSession = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  roles: RoleCode[];
  permissions: string[];
  expiresAt: Date;
};

export function isSessionUsable(
  state: {
    expiresAt: Date;
    revokedAt: Date | null;
    disabledAt: Date | null;
  },
  now = new Date(),
): boolean {
  return (
    state.revokedAt === null &&
    state.disabledAt === null &&
    state.expiresAt.getTime() > now.getTime()
  );
}

type AccessRecord = {
  id: string;
  email: string;
  displayName: string;
  disabledAt: Date | null;
  passwordHash: string | null;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD_HASH_PROMISE = import("./passwords").then(({ hashPassword }) =>
  hashPassword("byteclave-no-account-timing-padding"),
);

function rateLimitHashes(email: string, ipAddress: string): string[] {
  const secret = parseServerEnvironment().SESSION_SECRET;
  return [
    hashRateLimitBucket(`email:${email}`, secret),
    hashRateLimitBucket(`ip:${ipAddress.slice(0, 128)}`, secret),
  ];
}

async function isRateLimited(bucketHashes: string[]): Promise<boolean> {
  const now = new Date();
  const rows = await getDb()
    .select({ bucketHash: authRateLimits.bucketHash })
    .from(authRateLimits)
    .where(
      and(
        inArray(authRateLimits.bucketHash, bucketHashes),
        gt(authRateLimits.lockedUntil, now),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function recordLoginFailure(
  bucketHashes: string[],
  maxAttempts: number,
  lockoutMinutes: number,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const expiredBefore = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const lockedUntil = new Date(now.getTime() + lockoutMinutes * 60 * 1000);
  let locked = false;
  await db.transaction(async (tx) => {
    await tx
      .delete(authRateLimits)
      .where(lt(authRateLimits.windowStartedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
    for (const bucketHash of bucketHashes) {
      const [row] = await tx
        .insert(authRateLimits)
        .values({
          bucketHash,
          failedAttempts: 1,
          windowStartedAt: now,
          lockedUntil: null,
        })
        .onConflictDoUpdate({
          target: authRateLimits.bucketHash,
          set: {
            failedAttempts: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${expiredBefore} THEN 1 ELSE ${authRateLimits.failedAttempts} + 1 END`,
            windowStartedAt: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${expiredBefore} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
            lockedUntil: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${expiredBefore} THEN NULL WHEN ${authRateLimits.failedAttempts} + 1 >= ${maxAttempts} THEN ${lockedUntil} ELSE ${authRateLimits.lockedUntil} END`,
            updatedAt: now,
          },
        })
        .returning({
          failedAttempts: authRateLimits.failedAttempts,
          lockedUntil: authRateLimits.lockedUntil,
        });
      if (row && row.failedAttempts >= maxAttempts) locked = true;
    }
  });
  return locked;
}

async function readAccess(userId: string): Promise<{
  roles: RoleCode[];
  permissions: string[];
}> {
  const [roleRows, permissionRows] = await Promise.all([
    getDb()
      .select({ roleCode: userRoles.roleCode })
      .from(userRoles)
      .where(eq(userRoles.userId, userId)),
    getDb()
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleCode, rolePermissions.roleCode))
      .innerJoin(permissions, eq(rolePermissions.permissionKey, permissions.key))
      .where(eq(userRoles.userId, userId)),
  ]);
  return {
    roles: roleRows.map(({ roleCode }) => roleCode),
    permissions: [...new Set(permissionRows.map(({ key }) => key))],
  };
}

async function readAccountByEmail(email: string): Promise<AccessRecord | undefined> {
  const [account] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      disabledAt: users.disabledAt,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  return account;
}

export async function authenticatePassword(
  rawInput: unknown,
  ipAddress: string,
): Promise<Pick<AdminSession, "userId" | "email" | "displayName">> {
  const input = adminLoginSchema.parse(rawInput);
  const bucketHashes = rateLimitHashes(input.email, ipAddress || "unknown");
  if (await isRateLimited(bucketHashes)) throw new LoginRateLimitError();

  const account = await readAccountByEmail(input.email);
  const storedHash =
    account?.passwordHash ?? (await DUMMY_PASSWORD_HASH_PROMISE);
  const passwordMatches = await verifyPassword(input.password, storedHash);
  if (!account || account.disabledAt || !account.passwordHash || !passwordMatches) {
    const settings = await getSecuritySettings();
    await recordLoginFailure(
      bucketHashes,
      settings.maxLoginAttempts,
      settings.lockoutMinutes,
    );
    throw new InvalidCredentialsError();
  }

  const access = await readAccess(account.id);
  if (
    access.roles.length === 0 ||
    !hasPermission(access.permissions, "admin:access")
  ) {
    const settings = await getSecuritySettings();
    await recordLoginFailure(bucketHashes, settings.maxLoginAttempts, settings.lockoutMinutes);
    throw new InvalidCredentialsError();
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, account.id));
    await tx.delete(authRateLimits).where(inArray(authRateLimits.bucketHash, bucketHashes));
    await tx.insert(auditLogs).values({
      actorUserId: account.id,
      entityType: "user",
      entityId: account.id,
      action: "auth.login.succeeded",
      changes: {},
    });
  });
  return {
    userId: account.id,
    email: account.email,
    displayName: account.displayName,
  };
}

export async function createAdminSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const [account] = await getDb()
    .select({ id: users.id, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account || account.disabledAt) throw new InvalidCredentialsError();
  const access = await readAccess(userId);
  if (
    !access.roles.length ||
    !hasPermission(access.permissions, "admin:access")
  ) {
    throw new InvalidCredentialsError();
  }
  const settings = await getSecuritySettings();
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + settings.sessionHours * 60 * 60 * 1000);
  await getDb().transaction(async (tx) => {
    const [session] = await tx
      .insert(authSessions)
      .values({
        userId,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
      })
      .returning({ id: authSessions.id });
    if (!session) throw new Error("Could not create a secure session.");
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      entityType: "auth_session",
      entityId: session.id,
      action: "auth.session.created",
      changes: { expiresAt: expiresAt.toISOString() },
    });
  });
  return { token, expiresAt };
}

export async function getAdminSession(
  token: string | undefined,
): Promise<AdminSession | null> {
  if (!token || token.length > 128) return null;
  const now = new Date();
  const [row] = await getDb()
    .select({
      sessionId: authSessions.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      expiresAt: authSessions.expiresAt,
      revokedAt: authSessions.revokedAt,
      disabledAt: users.disabledAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(
      and(
        eq(authSessions.tokenHash, hashOpaqueToken(token)),
      ),
    )
    .limit(1);
  if (!row || !isSessionUsable(row, now)) return null;
  const access = await readAccess(row.userId);
  if (
    !access.roles.length ||
    !hasPermission(access.permissions, "admin:access")
  ) {
    return null;
  }
  await getDb()
    .update(authSessions)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(authSessions.id, row.sessionId),
        sql`${authSessions.lastSeenAt} < ${new Date(now.getTime() - 5 * 60 * 1000)}`,
      ),
    );
  return {
    id: row.sessionId,
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    roles: access.roles,
    permissions: access.permissions,
    expiresAt: row.expiresAt,
  };
}

export async function revokeAdminSession(
  token: string | undefined,
  actorUserId: string,
): Promise<void> {
  if (!token || token.length > 128) return;
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const [session] = await tx
      .update(authSessions)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(authSessions.tokenHash, hashOpaqueToken(token)),
          eq(authSessions.userId, actorUserId),
          isNull(authSessions.revokedAt),
        ),
      )
      .returning({ id: authSessions.id });
    if (!session) return;
    await tx.insert(auditLogs).values({
      actorUserId,
      entityType: "auth_session",
      entityId: session.id,
      action: "auth.logout",
      changes: {},
    });
  });
}
