import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminInvitationAcceptanceForm } from "../../../../components/admin-one-time-forms";
import { BrandMotion } from "../../../../components/brand-motion";
import { currentAdminSession } from "../../../../lib/admin-auth";

export const metadata: Metadata = {
  title: "Accept Admin Invitation",
  robots: { index: false, follow: false },
};

export default async function AcceptAdminInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await currentAdminSession()) redirect("/admin");
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
        <p className="admin-kicker">Invitation</p>
        <h1>Set up your account</h1>
        {token
          ? <AdminInvitationAcceptanceForm token={token} />
          : <p className="admin-form-error" role="alert">This invitation link is missing its token.</p>}
      </section>
    </main>
  );
}
