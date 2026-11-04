"use client";

import { useState } from "react";

export function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out could not be completed.");
      window.location.assign("/admin/login?loggedOut=1");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Sign-out failed.");
      setBusy(false);
    }
  }
  return (
    <span className="admin-logout-wrap">
      <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => void logout()}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <span className="admin-form-error" role="alert">{error}</span>}
    </span>
  );
}
