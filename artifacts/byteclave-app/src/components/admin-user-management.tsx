"use client";

import { useState, type FormEvent } from "react";
import type { RoleCode } from "@workspace/domain";
import { AdminInvitationForm } from "./admin-invitation-form";

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  role: RoleCode;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function AdminUserManagement({
  users: initialUsers,
  actorRole,
}: {
  users: AdminUserRow[];
  actorRole: RoleCode;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const owner = actorRole === "OWNER";

  async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
    return result;
  }

  async function updateRole(user: AdminUserRow, role: RoleCode) {
    setError("");
    setNotice("");
    try {
      await request(`/api/admin/users/${user.id}/role`, "PATCH", { role });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
      setNotice(`Role updated for ${user.email}.`);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Role update failed.");
    }
  }

  async function toggleDisabled(user: AdminUserRow) {
    setError("");
    setNotice("");
    const disabled = !user.disabledAt;
    try {
      await request(`/api/admin/users/${user.id}/status`, "PATCH", { disabled });
      setUsers((current) =>
        current.map((item) => item.id === user.id
          ? { ...item, disabledAt: disabled ? new Date().toISOString() : null }
          : item),
      );
      setNotice(disabled ? `Access disabled for ${user.email}.` : `Access restored for ${user.email}.`);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Account status update failed.");
    }
  }

  async function issueReset(user: AdminUserRow) {
    setError("");
    setNotice("");
    setResetUrl("");
    try {
      const result = await request<{ resetUrl: string }>(
        `/api/admin/users/${user.id}/password-reset`,
        "POST",
        { currentPassword },
      );
      setResetUrl(result.resetUrl);
      setNotice(`One-time reset link created for ${user.email}.`);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Reset link could not be created.");
    }
  }

  function roleCanManage(user: AdminUserRow) {
    if (user.role === "OWNER" || user.id === initialUsers.find((item) => item.role === "OWNER")?.id) return false;
    return owner || (actorRole === "ADMIN" && user.role === "EDITOR");
  }

  return (
    <div className="admin-stack">
      {owner || actorRole === "ADMIN" ? (
        <AdminInvitationForm actorRole={actorRole} />
      ) : (
        <section className="admin-panel">
          <p className="admin-kicker">Access management</p>
          <h2>Users and roles</h2>
          <p className="admin-supporting">Only the Owner and Admin can manage invited Editor accounts.</p>
        </section>
      )}
      <section className="admin-panel" aria-labelledby="users-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Authorized accounts</p>
            <h2 id="users-heading">Users and roles</h2>
          </div>
          <span className="admin-panel-count">{users.length} accounts</span>
        </div>
        {users.length === 0 ? (
          <p className="admin-empty">No administrative accounts have been provisioned.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <span className="admin-table-secondary">{user.email}</span>
                    </td>
                    <td><span className={`admin-role-indicator role-${user.role.toLowerCase()}`}>{user.role}</span></td>
                    <td>{dateLabel(user.lastLoginAt)}</td>
                    <td>{user.disabledAt ? "Disabled" : "Active"}</td>
                    <td>
                      {roleCanManage(user) && (
                        <div className="admin-row-actions">
                          {owner && (
                            <label className="admin-inline-control">
                              <span className="sr-only">Role for {user.email}</span>
                              <select value={user.role} onChange={(event) => void updateRole(user, event.target.value as RoleCode)}>
                                <option value="EDITOR">Editor</option>
                                <option value="ADMIN">Admin</option>
                              </select>
                            </label>
                          )}
                          <button className="admin-table-action" type="button" onClick={() => void toggleDisabled(user)}>
                            {user.disabledAt ? "Enable" : "Disable"}
                          </button>
                          <button className="admin-table-action" type="button" onClick={() => void issueReset(user)}>
                            Reset password
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(owner || actorRole === "ADMIN") && (
          <form
            className="admin-reauth-row"
            onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
          >
            <label>
              Confirm your password before issuing a reset link
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                maxLength={128}
              />
            </label>
          </form>
        )}
        {error && <p className="admin-form-error" role="alert">{error}</p>}
        {notice && <p className="admin-form-success" role="status">{notice}</p>}
        {resetUrl && (
          <div className="admin-one-time-link">
            <strong>Share this one-time reset link through a trusted channel</strong>
            <code>{resetUrl}</code>
            <button className="admin-secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(resetUrl)}>
              Copy reset link
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
