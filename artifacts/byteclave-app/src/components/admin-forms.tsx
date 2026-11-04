"use client";

import { useState, type FormEvent } from "react";
import type { SecuritySettings } from "@workspace/db";

function ErrorMessage({ message }: { message: string }) {
  return message ? <p className="admin-form-error" role="alert">{message}</p> : null;
}

export function AdminAccountForm({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword && newPassword !== form.get("confirmPassword")) {
      setError("The new passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/admin/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newEmail: String(form.get("newEmail") ?? "").trim() || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const result = (await response.json()) as { email?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Account update failed.");
      const updatedEmail = result.email ?? currentEmail;
      setCurrentEmail(updatedEmail);
      setMessage(`Account credentials updated for ${updatedEmail}. Sign in again after your current session expires or you sign out.`);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Account update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="account-security-heading">
      <p className="admin-kicker">Account security</p>
      <h2 id="account-security-heading">Update your credentials</h2>
      <p className="admin-supporting">
        Changing your email or password requires your current password. Other active sessions are revoked after an update.
        Owner changes are audited and ownership remains attached to the provisioned account, not its email.
      </p>
      <form className="admin-form admin-settings-form" onSubmit={submit}>
        <label>
          Current password
          <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
        </label>
        <label>
          New email address
          <input name="newEmail" type="email" autoComplete="email" maxLength={320} placeholder={currentEmail} />
        </label>
        <label>
          New password
          <input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} />
        </label>
        <label>
          Confirm new password
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} />
        </label>
        <ErrorMessage message={error} />
        {message && <p className="admin-form-success" role="status">{message}</p>}
        <button className="admin-primary-button" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save account changes"}
        </button>
      </form>
    </section>
  );
}

export function OwnerSecurityForm({ initial }: { initial: SecuritySettings }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/settings/security", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionHours: Number(form.get("sessionHours")),
          maxLoginAttempts: Number(form.get("maxLoginAttempts")),
          lockoutMinutes: Number(form.get("lockoutMinutes")),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Settings update failed.");
      setMessage("Security settings saved. They apply to new sessions and future sign-in attempts.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Settings update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="security-settings-heading">
      <p className="admin-kicker">Owner only</p>
      <h2 id="security-settings-heading">Security settings</h2>
      <p className="admin-supporting">Changes are recorded in the append-only audit log.</p>
      <form className="admin-form admin-settings-form" onSubmit={submit}>
        <label>
          New session lifetime (hours)
          <input name="sessionHours" type="number" min={1} max={24} defaultValue={initial.sessionHours} required />
        </label>
        <label>
          Failed sign-ins before lockout
          <input name="maxLoginAttempts" type="number" min={5} max={20} defaultValue={initial.maxLoginAttempts} required />
        </label>
        <label>
          Lockout duration (minutes)
          <input name="lockoutMinutes" type="number" min={5} max={60} defaultValue={initial.lockoutMinutes} required />
        </label>
        <ErrorMessage message={error} />
        {message && <p className="admin-form-success" role="status">{message}</p>}
        <button className="admin-primary-button" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save security settings"}
        </button>
      </form>
    </section>
  );
}
