"use client";

import { useState, type FormEvent } from "react";
import type { RoleCode } from "@workspace/domain";

export function AdminInvitationForm({ actorRole }: { actorRole: RoleCode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const canInviteAdmin = actorRole === "OWNER";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInvitationUrl("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          displayName: form.get("displayName"),
          role: form.get("role"),
        }),
      });
      const result = (await response.json()) as { invitationUrl?: string; error?: string };
      if (!response.ok || !result.invitationUrl) {
        throw new Error(result.error ?? "Invitation could not be created.");
      }
      setInvitationUrl(result.invitationUrl);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Invitation could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="invite-heading">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-kicker">Access management</p>
          <h2 id="invite-heading">Invite an administrator</h2>
        </div>
      </div>
      <p className="admin-supporting">
        Invitation links are single-use and expire after 24 hours. Share them with the intended person through a trusted channel.
      </p>
      <form className="admin-form admin-invite-form" onSubmit={submit}>
        <label>
          Name
          <input name="displayName" autoComplete="name" required maxLength={120} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required maxLength={320} />
        </label>
        <label>
          Role
          <select name="role" defaultValue={canInviteAdmin ? "ADMIN" : "EDITOR"}>
            {canInviteAdmin && <option value="ADMIN">Admin</option>}
            <option value="EDITOR">Editor</option>
          </select>
        </label>
        {error && <p className="admin-form-error" role="alert">{error}</p>}
        <button className="admin-primary-button" disabled={busy} type="submit">
          {busy ? "Creating link…" : "Create invitation"}
        </button>
      </form>
      {invitationUrl && (
        <div className="admin-one-time-link" role="status">
          <strong>Copy this invitation link now</strong>
          <p>The raw token is shown once and is not stored in the database.</p>
          <code>{invitationUrl}</code>
          <button
            className="admin-secondary-button"
            type="button"
            onClick={() => void navigator.clipboard.writeText(invitationUrl)}
          >
            Copy invitation link
          </button>
        </div>
      )}
    </section>
  );
}
