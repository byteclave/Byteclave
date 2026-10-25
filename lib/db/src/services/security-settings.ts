import { eq } from "drizzle-orm";
import {
  PermissionDeniedError,
  hasPermission,
  securitySettingsSchema,
  type RoleCode,
} from "@workspace/domain";
import { getDb } from "../index";
import { applicationSettings, auditLogs } from "../schema";

export type SecuritySettings = {
  sessionHours: number;
  maxLoginAttempts: number;
  lockoutMinutes: number;
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  sessionHours: 8,
  maxLoginAttempts: 10,
  lockoutMinutes: 15,
};

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const [row] = await getDb()
    .select({ value: applicationSettings.value })
    .from(applicationSettings)
    .where(eq(applicationSettings.key, "security.auth"))
    .limit(1);
  if (!row) return { ...DEFAULT_SECURITY_SETTINGS };
  const parsed = securitySettingsSchema.safeParse(row.value);
  if (!parsed.success) {
    throw new Error("Stored administrative security settings are invalid.");
  }
  return parsed.data;
}

export async function updateSecuritySettings(
  input: unknown,
  actor: {
    userId: string;
    roles: readonly RoleCode[];
    permissions: readonly string[];
  },
): Promise<SecuritySettings> {
  if (
    !actor.roles.includes("OWNER") ||
    !hasPermission(actor.permissions, "security:manage")
  ) {
    throw new PermissionDeniedError("Only the Owner can change security settings.");
  }
  const settings = securitySettingsSchema.parse(input);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(applicationSettings)
      .values({
        key: "security.auth",
        value: settings,
        updatedByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: applicationSettings.key,
        set: {
          value: settings,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      entityType: "security_settings",
      entityId: actor.userId,
      action: "security.settings.updated",
      changes: { settings },
    });
  });
  return settings;
}

export async function getConfiguredOwnerId(): Promise<string | null> {
  const [row] = await getDb()
    .select({ value: applicationSettings.value })
    .from(applicationSettings)
    .where(eq(applicationSettings.key, "security.ownerUserId"))
    .limit(1);
  return typeof row?.value === "string" ? row.value : null;
}
