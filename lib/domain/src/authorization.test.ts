import { describe, expect, it } from "vitest";
import {
  ROLE_PERMISSIONS,
  assertCanManageUser,
  hasPermission,
} from "./services/authorization";
import {
  acceptInvitationSchema,
  invitationInputSchema,
  passwordSchema,
  securitySettingsSchema,
} from "./schemas/security";

describe("administrative authorization", () => {
  it("keeps ownership and security controls exclusive to the Owner", () => {
    expect(ROLE_PERMISSIONS.OWNER).toContain("security:manage");
    expect(ROLE_PERMISSIONS.OWNER).toContain("users:manage");
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain("security:manage");
    expect(ROLE_PERMISSIONS.EDITOR).not.toContain("users:manage");
    expect(hasPermission(ROLE_PERMISSIONS.ADMIN, "admin:access")).toBe(true);
  });

  it("allows Admins to manage Editors but not administrator accounts", () => {
    expect(() =>
      assertCanManageUser({
        actorRoles: ["ADMIN"],
        targetRoles: ["EDITOR"],
        nextRole: "EDITOR",
        isProtectedOwner: false,
      }),
    ).not.toThrow();

    expect(() =>
      assertCanManageUser({
        actorRoles: ["ADMIN"],
        targetRoles: ["ADMIN"],
        nextRole: "EDITOR",
        isProtectedOwner: false,
      }),
    ).toThrow(/Editor accounts/);
  });

  it("prevents Owner removal, demotion, or reassignment through ordinary role changes", () => {
    expect(() =>
      assertCanManageUser({
        actorRoles: ["ADMIN"],
        targetRoles: ["OWNER"],
        nextRole: "EDITOR",
        isProtectedOwner: true,
      }),
    ).toThrow(/Owner account is protected/);

    expect(() =>
      assertCanManageUser({
        actorRoles: ["OWNER"],
        targetRoles: [],
        nextRole: "OWNER",
        isProtectedOwner: false,
      }),
    ).toThrow(/secure provisioning/);
  });

  it("validates invitations, passwords, and security limits", () => {
    expect(invitationInputSchema.parse({
      email: "EDITOR@EXAMPLE.COM",
      displayName: "Editor",
      role: "EDITOR",
    }).email).toBe("editor@example.com");
    expect(() => invitationInputSchema.parse({
      email: "owner@example.com",
      displayName: "Owner",
      role: "OWNER",
    })).toThrow();
    expect(() => passwordSchema.parse("short")).toThrow();
    expect(() => acceptInvitationSchema.parse({
      token: "short",
      displayName: "Editor",
      password: "correct-horse-battery",
    })).toThrow();
    expect(securitySettingsSchema.parse({
      sessionHours: 8,
      maxLoginAttempts: 10,
      lockoutMinutes: 15,
    }).sessionHours).toBe(8);
    expect(() => securitySettingsSchema.parse({
      sessionHours: 48,
      maxLoginAttempts: 10,
      lockoutMinutes: 15,
    })).toThrow();
  });
});
