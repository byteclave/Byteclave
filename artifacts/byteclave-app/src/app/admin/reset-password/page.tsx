import type { Metadata } from "next";
import Link from "next/link";
import { AdminPasswordResetForm } from "../../../components/admin-one-time-forms";
import { BrandMotion } from "../../../components/brand-motion";

export const metadata: Metadata = {
  title: "Reset Admin Password",
  robots: { index: false, follow: false },
};

export default async function ResetAdminPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="admin-auth-page">
      <div className="admin-auth-header">
        <Link className="admin-auth-brand" href="/">
          <BrandMotion mode="MINIMAL" label="ByteClave logo" />
          <span>byte<span>clave</span></span>
        </Link>
        <Link href="/admin/login" className="admin-auth-back">Admin Login</Link>
      </div>
      <section className="admin-auth-card">
        <p className="admin-kicker">Account recovery</p>
        <h1>Reset password</h1>
        {token
          ? <AdminPasswordResetForm token={token} />
          : <p className="admin-form-error" role="alert">This reset link is missing its token.</p>}
      </section>
    </main>
  );
}
