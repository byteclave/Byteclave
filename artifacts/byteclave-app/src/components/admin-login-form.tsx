"use client";

import { useState, type FormEvent } from "react";

export function AdminLoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sign-in failed.");
      window.location.assign("/admin");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label>
        Email
        <input autoComplete="username" name="email" type="email" required maxLength={320} />
      </label>
      <label>
        Password
        <input autoComplete="current-password" name="password" type="password" required maxLength={128} />
      </label>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <button className="admin-primary-button" disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="admin-form-help">Access is invitation-only. There is no public registration.</p>
    </form>
  );
}
