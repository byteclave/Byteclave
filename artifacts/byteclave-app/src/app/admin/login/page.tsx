import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMotion } from "../../../components/brand-motion";
import { AdminLoginForm } from "../../../components/admin-login-form";
import { currentAdminSession } from "../../../lib/admin-auth";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Secure, invitation-only ByteClave administrator sign-in.",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ loggedOut?: string; denied?: string }>;
}) {
  if (await currentAdminSession()) redirect("/admin");
  const params = await searchParams;
  return (
    <main className="admin-auth-page">
      <div className="admin-auth-header">
        <Link className="admin-auth-brand" href="/">
          <BrandMotion mode="MINIMAL" label="ByteClave logo" />
          <span>byte<span>clave</span></span>
        </Link>
        <Link href="/" className="admin-auth-back">← Public website</Link>
      </div>
      <section className="admin-auth-card">
        <p className="admin-kicker">Administrator access</p>
        <h1>Sign in</h1>
        {params.loggedOut && <p className="admin-form-success" role="status">You have been signed out.</p>}
        {params.denied && <p className="admin-form-error" role="alert">This account does not have dashboard access.</p>}
        <AdminLoginForm />
      </section>
      <p className="admin-auth-footnote">No public registration · Access is granted by invitation or secure Owner provisioning.</p>
    </main>
  );
}
