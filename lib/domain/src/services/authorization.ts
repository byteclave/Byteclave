import type { RoleCode } from "../schemas/common";

export const ROLE_PERMISSIONS: Record<RoleCode, readonly string[]> = {
  OWNER: [
    "admin:access",
    "catalog:read",
    "categories:manage",
    "discoveries:manage",
    "publishing:review",
    "publishing:publish",
    "media:read",
    "media:manage",
    "versions:read",
    "versions:restore",
    "appearance:manage",
    "users:read",
    "users:manage",
    "settings:manage",
    "security:manage",
    "audit:read",
  ],
  ADMIN: [
    "admin:access",
    "catalog:read",
    "categories:manage",
    "discoveries:manage",
    "publishing:review",
    "publishing:publish",
    "media:read",
    "media:manage",
    "versions:read",
    "versions:restore",
    "appearance:manage",
    "users:read",
    "users:manage",
    "audit:read",
  ],
  EDITOR: [
    "admin:access",
    "catalog:read",
    "discoveries:manage",
    "publishing:review",
    "media:read",
    "versions:read",
  ],
};

export function rolePermissions(roles: readonly RoleCode[]): Set<string> {
  return new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]));
}

export function hasPermission(
  grantedPermissions: ReadonlySet<string> | readonly string[],
  permission: string,
): boolean {
  return Array.isArray(grantedPermissions)
    ? grantedPermissions.includes(permission)
    : (grantedPermissions as ReadonlySet<string>).has(permission);
}

export class PermissionDeniedError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export function assertCanManageUser(input: {
  actorRoles: readonly RoleCode[];
  targetRoles: readonly RoleCode[];
  nextRole?: RoleCode;
  isProtectedOwner: boolean;
}): void {
  if (!input.actorRoles.includes("OWNER") && !input.actorRoles.includes("ADMIN")) {
    throw new PermissionDeniedError("An ADMIN or OWNER role is required.");
  }
  if (input.isProtectedOwner) {
    throw new PermissionDeniedError("The provisioned Owner account is protected.");
  }
  if (input.targetRoles.includes("OWNER") || input.nextRole === "OWNER") {
    throw new PermissionDeniedError("Owner access can only be established by secure provisioning.");
  }
  if (input.actorRoles.includes("ADMIN")) {
    if (input.targetRoles.some((role) => role !== "EDITOR") || input.nextRole !== "EDITOR") {
      throw new PermissionDeniedError("Admins may only manage Editor accounts.");
    }
  }
}
