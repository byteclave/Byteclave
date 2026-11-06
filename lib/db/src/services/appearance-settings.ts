import { eq } from "drizzle-orm";
import {
  PermissionDeniedError,
  appearanceSettingsSchema,
  hasPermission,
  type RoleCode,
} from "@workspace/domain";
import { getDb } from "../index";
import { applicationSettings, auditLogs } from "../schema";

export type AppearanceSettings = {
  homepageEyebrow: string;
  homepageHeadline: string;
  homepageDescription: string;
  footerText: string;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  homepageEyebrow: "An open catalog for digital resources",
  homepageHeadline: "Discover resources. Understand what’s behind them.",
  homepageDescription:
    "Find trustworthy digital tools with useful context about what they are and how they work.",
  footerText: "ByteClave · An open catalog for digital resources.",
};

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  const [row] = await getDb()
    .select({ value: applicationSettings.value })
    .from(applicationSettings)
    .where(eq(applicationSettings.key, "appearance.public"))
    .limit(1);
  if (!row) return { ...DEFAULT_APPEARANCE_SETTINGS };
  const parsed = appearanceSettingsSchema.safeParse(row.value);
  if (!parsed.success) {
    throw new Error("Stored public appearance settings are invalid.");
  }
  return parsed.data;
}

export async function updateAppearanceSettings(
  rawInput: unknown,
  actor: {
    userId: string;
    roles: readonly RoleCode[];
    permissions: readonly string[];
  },
): Promise<AppearanceSettings> {
  if (
    !actor.roles.some((role) => role === "OWNER" || role === "ADMIN") ||
    !hasPermission(actor.permissions, "appearance:manage")
  ) {
    throw new PermissionDeniedError("An Owner or Admin role is required.");
  }
  const settings = appearanceSettingsSchema.parse(rawInput);
  const before = await getAppearanceSettings();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(applicationSettings)
      .values({
        key: "appearance.public",
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
      entityType: "appearance_settings",
      entityId: actor.userId,
      action: "appearance.settings.updated",
      changes: { before, after: settings },
    });
  });
  return settings;
}
