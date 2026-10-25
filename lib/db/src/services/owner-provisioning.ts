import { and, eq, sql } from "drizzle-orm";
import {
  userInputSchema,
  passwordSchema,
} from "@workspace/domain";
import { parseServerEnvironment } from "@workspace/config";
import { getDb } from "../index";
import {
  applicationSettings,
  authSessions,
  auditLogs,
  roles,
  userRoles,
  users,
} from "../schema";
import { hashPassword } from "./passwords";

const OWNER_PROVISION_LOCK = 1_970_423_611;

export async function provisionInitialOwner(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<{ id: string; email: string }> {
  const { INITIAL_OWNER_EMAIL } = parseServerEnvironment();
  const account = userInputSchema.parse(input);
  const password = passwordSchema.parse(input.password);
  if (account.email !== INITIAL_OWNER_EMAIL) {
    throw new Error("The initial Owner email must match INITIAL_OWNER_EMAIL.");
  }
  const passwordHash = await hashPassword(password);
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${OWNER_PROVISION_LOCK})`);
    const [existingOwner] = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleCode, "OWNER"))
      .for("update")
      .limit(1);
    const [ownerSetting] = await tx
      .select({ value: applicationSettings.value })
      .from(applicationSettings)
      .where(eq(applicationSettings.key, "security.ownerUserId"))
      .for("update")
      .limit(1);
    if (existingOwner || ownerSetting) {
      throw new Error("An Owner is already provisioned. Use the protected recovery command if needed.");
    }

    await tx
      .insert(roles)
      .values({
        code: "OWNER",
        name: "Owner",
        description: "Full control of the ByteClave instance.",
      })
      .onConflictDoNothing();
    await tx.execute(sql`SELECT set_config('app.owner_bootstrap', 'true', true)`);

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${account.email}`)
      .for("update")
      .limit(1);
    let owner: { id: string; email: string } | undefined;
    if (existingUser) {
      const [updated] = await tx
        .update(users)
        .set({
          displayName: account.displayName,
          passwordHash,
          disabledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning({ id: users.id, email: users.email });
      owner = updated;
      await tx.delete(userRoles).where(eq(userRoles.userId, existingUser.id));
    } else {
      const [created] = await tx
        .insert(users)
        .values({
          email: account.email,
          displayName: account.displayName,
          passwordHash,
        })
        .returning({ id: users.id, email: users.email });
      owner = created;
    }
    if (!owner) throw new Error("Could not provision the Owner account.");

    await tx
      .insert(applicationSettings)
      .values({
        key: "security.ownerUserId",
        value: owner.id,
      })
      .onConflictDoNothing();
    await tx.insert(userRoles).values({
      userId: owner.id,
      roleCode: "OWNER",
      assignedByUserId: owner.id,
    });
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(authSessions.userId, owner.id));
    await tx.insert(auditLogs).values({
      actorUserId: owner.id,
      entityType: "user",
      entityId: owner.id,
      action: "owner.provisioned",
      changes: { role: "OWNER" },
    });
    return owner;
  });
}

export async function recoverOwnerPassword(input: {
  email: string;
  password: string;
}): Promise<void> {
  const email = userInputSchema
    .pick({ email: true, displayName: true })
    .parse({ email: input.email, displayName: "Owner recovery" }).email;
  const passwordHash = await hashPassword(passwordSchema.parse(input.password));
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${OWNER_PROVISION_LOCK})`);
    const [ownerSetting] = await tx
      .select({ value: applicationSettings.value })
      .from(applicationSettings)
      .where(eq(applicationSettings.key, "security.ownerUserId"))
      .for("update")
      .limit(1);
    if (typeof ownerSetting?.value !== "string") {
      throw new Error("No provisioned Owner was found.");
    }
    const [owner] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, ownerSetting.value), sql`lower(${users.email}) = ${email}`))
      .for("update")
      .limit(1);
    if (!owner) throw new Error("The email does not match the provisioned Owner account.");
    await tx.execute(sql`SELECT set_config('app.owner_recovery', 'true', true)`);
    await tx
      .update(users)
      .set({ passwordHash, disabledAt: null, updatedAt: new Date() })
      .where(eq(users.id, owner.id));
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(authSessions.userId, owner.id));
    await tx.insert(auditLogs).values({
      actorUserId: null,
      entityType: "user",
      entityId: owner.id,
      action: "owner.credentials.recovered",
      changes: { passwordChanged: true, sessionsRevoked: true },
    });
  });
}
