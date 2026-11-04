import { eq } from "drizzle-orm";
import { z } from "zod";
import { userRoleChangeSchema } from "@workspace/domain";
import { getDb } from "../index";
import { permissions, rolePermissions, userRoles, users } from "../schema";
import { changeManagedUserRole } from "./user-management";

export async function changeUserRoles(
  input: unknown,
  actorUserId: string,
): Promise<("OWNER" | "ADMIN" | "EDITOR")[]> {
  const change = userRoleChangeSchema.parse(input);
  const actorId = z.string().uuid().parse(actorUserId);
  if (change.roles.length !== 1) {
    throw new Error("Each account must have exactly one administrative role.");
  }
  const [actor] = await getDb()
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  if (!actor) throw new Error("The acting account no longer exists.");
  const [actorRoleRows, actorPermissionRows] = await Promise.all([
    getDb()
      .select({ roleCode: userRoles.roleCode })
      .from(userRoles)
      .where(eq(userRoles.userId, actorId)),
    getDb()
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleCode, rolePermissions.roleCode))
      .innerJoin(permissions, eq(rolePermissions.permissionKey, permissions.key))
      .where(eq(userRoles.userId, actorId)),
  ]);
  const role = await changeManagedUserRole(
    { userId: change.userId, role: change.roles[0] },
    {
      userId: actor.id,
      email: actor.email,
      roles: actorRoleRows.map(({ roleCode }) => roleCode),
      permissions: actorPermissionRows.map(({ key }) => key),
    },
  );
  return [role];
}
