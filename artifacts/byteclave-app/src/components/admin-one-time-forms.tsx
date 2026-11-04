"use client";

import { useState, type FormEvent } from "react";

function OneTimePasswordForm({
  token,
  endpoint,
  title,
  submitLabel,
  needsDisplayName = false,
}: {
  token: string;
  endpoint: string;
  title: string;
  submitLabel: string;
  needsDisplayName?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirmPassword")) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          ...(needsDisplayName ? { displayName: form.get("displayName") } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The link could not be used.");
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The link could not be used.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="admin-one-time-complete" role="status">
        <h2>Password updated</h2>
        <p>All previous sessions have been revoked. Sign in with the new password.</p>
        <a className="admin-primary-button" href="/admin/login">Go to Admin Login</a>
      </div>
    );
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <h2>{title}</h2>
      {needsDisplayName && (
        <label>
          Display name
          <input name="displayName" autoComplete="name" required maxLength={120} />
        </label>
      )}
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      <label>
        Confirm new password
        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <button className="admin-primary-button" disabled={busy} type="submit">
        {busy ? "Updating…" : submitLabel}
      </button>
    </form>
  );
}

export function AdminInvitationAcceptanceForm({ token }: { token: string }) {
  return (
    <OneTimePasswordForm
      token={token}
      endpoint="/api/admin/auth/accept-invitation"
      title="Set up your ByteClave account"
      submitLabel="Accept invitation"
      needsDisplayName
    />
  );
}

export function AdminPasswordResetForm({ token }: { token: string }) {
  return (
    <OneTimePasswordForm
      token={token}
      endpoint="/api/admin/auth/reset-password"
      title="Choose a new password"
      submitLabel="Reset password"
    />
  );
}
