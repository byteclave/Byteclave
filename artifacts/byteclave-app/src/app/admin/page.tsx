import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission } from "@workspace/domain";
import {
  getAdminOverviewMetrics,
  getSecuritySettings,
  listAdminAuditEvents,
  listManagedUsers,
} from "@workspace/db";
import { AdminAuditTable } from "../../components/admin-audit-table";
import {
  AdminDashboardNav,
  type AdminSection,
} from "../../components/admin-dashboard-nav";
import { AdminAccountForm, OwnerSecurityForm } from "../../components/admin-forms";
import { AdminLogoutButton } from "../../components/admin-logout-button";
import {
  AdminUserManagement,
  type AdminUserRow,
} from "../../components/admin-user-management";
import { requireAdminPageSession } from "../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

const sectionIds = [
  "overview",
  "discoveries",
  "taxonomy",
  "tags",
  "collections",
  "media",
  "publishing",
  "versions",
  "users",
  "audit",
  "appearance",
  "settings",
] as const satisfies readonly AdminSection[];

const sectionLabels: Record<AdminSection, string> = {
  overview: "Overview",
  discoveries: "Discoveries",
  taxonomy: "Categories and Subcategories",
  tags: "Tags",
  collections: "Collections",
  media: "Media",
  publishing: "Publishing",
  versions: "Version History",
  users: "Users and Roles",
  audit: "Audit Logs",
  appearance: "Appearance",
  settings: "Settings",
};

function parseSection(value: string | string[] | undefined): AdminSection {
  const section = Array.isArray(value) ? value[0] : value;
  return sectionIds.find((item) => item === section) ?? "overview";
}

function DeferredSection({ section }: { section: AdminSection }) {
  return (
    <section className="admin-panel admin-deferred-panel">
      <p className="admin-kicker">Protected workspace</p>
      <h2>{sectionLabels[section]}</h2>
      <p className="admin-supporting">
        This section is part of the secured dashboard navigation. Its management workflow is intentionally deferred; no unfinished actions are presented as available.
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </>
  );
  return href ? <Link className="admin-metric" href={href}>{content}</Link> : <div className="admin-metric">{content}</div>;
}

async function Overview({ canReadAdministration }: { canReadAdministration: boolean }) {
  if (!canReadAdministration) {
    return (
      <section className="admin-panel">
        <p className="admin-kicker">Overview</p>
        <h2>Metrics are restricted</h2>
        <p className="admin-supporting">
          Catalog totals that include unpublished content are available to authorized administrators only.
        </p>
      </section>
    );
  }
  const metrics = await getAdminOverviewMetrics();
  return (
    <>
      <div className="admin-metrics-grid" aria-label="Live database metrics">
        <Metric label="Total Discoveries" value={metrics.discoveries} href="/admin?section=discoveries" />
        <Metric label="Published" value={metrics.publishedDiscoveries} />
        <Metric label="Unpublished" value={metrics.unpublishedDiscoveries} />
        <Metric label="Categories" value={metrics.categories} href="/admin?section=taxonomy" />
        <Metric label="Collections" value={metrics.collections} href="/admin?section=collections" />
        <Metric label="Admin users" value={metrics.administrativeUsers} href="/admin?section=users" />
      </div>
      <section className="admin-panel admin-overview-note">
        <p className="admin-kicker">System status</p>
        <h2>Access controls are active</h2>
        <p className="admin-supporting">
          Sign-in is invitation-only. Owner provisioning is explicit, role checks run on the server, and security-sensitive changes are written to the audit log.
        </p>
      </section>
    </>
  );
}

function AppearancePanel() {
  const palette = [
    { label: "ByteClave Blue", value: "#1E9BFF" },
    { label: "Neon Green", value: "#00E676" },
    { label: "White", value: "#FFFFFF" },
    { label: "Dark background", value: "#070B10" },
    { label: "Logo red accent", value: "#EF211D" },
  ];
  return (
    <section className="admin-panel">
      <p className="admin-kicker">Brand system</p>
      <h2>Appearance</h2>
      <p className="admin-supporting">The canonical ByteClave palette is fixed in this phase to keep the public and admin experiences consistent.</p>
      <ul className="admin-palette-list">
        {palette.map((color) => (
          <li key={color.value}>
            <span className="admin-palette-swatch" style={{ backgroundColor: color.value }} aria-hidden="true" />
            <span>{color.label}</span>
            <code>{color.value}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function UsersSection({
  session,
}: {
  session: Awaited<ReturnType<typeof requireAdminPageSession>>;
}) {
  if (!hasPermission(session.permissions, "users:read")) {
    return (
      <section className="admin-panel">
        <p className="admin-kicker">Access denied</p>
        <h2>Users and Roles</h2>
        <p className="admin-supporting">Your account is not authorized to view administrative users.</p>
      </section>
    );
  }
  const rows = await listManagedUsers(session.roles);
  const users: AdminUserRow[] = rows.map((row) => ({
    ...row,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
  return <AdminUserManagement users={users} actorRole={session.roles[0] ?? "EDITOR"} />;
}

async function AuditSection({
  session,
}: {
  session: Awaited<ReturnType<typeof requireAdminPageSession>>;
}) {
  if (!hasPermission(session.permissions, "audit:read")) {
    return (
      <section className="admin-panel">
        <p className="admin-kicker">Access denied</p>
        <h2>Audit Logs</h2>
        <p className="admin-supporting">Your account is not authorized to view audit history.</p>
      </section>
    );
  }
  return (
    <section className="admin-panel">
      <p className="admin-kicker">Append-only history</p>
      <h2>Audit Logs</h2>
      <p className="admin-supporting">Recent authentication and security-sensitive administrative actions. Passwords and session tokens are never recorded.</p>
      <AdminAuditTable events={await listAdminAuditEvents()} />
    </section>
  );
}

async function SettingsSection({
  session,
}: {
  session: Awaited<ReturnType<typeof requireAdminPageSession>>;
}) {
  const securitySettings = session.roles.includes("OWNER")
    ? await getSecuritySettings()
    : null;
  return (
    <div className="admin-stack">
      <AdminAccountForm email={session.email} />
      {securitySettings ? (
        <OwnerSecurityForm initial={securitySettings} />
      ) : (
        <section className="admin-panel">
          <p className="admin-kicker">Owner controlled</p>
          <h2>Security settings</h2>
          <p className="admin-supporting">Only the Owner can change session and sign-in protection settings.</p>
        </section>
      )}
      <section className="admin-panel">
        <p className="admin-kicker">System configuration</p>
        <h2>Self-hosted instance</h2>
        <p className="admin-supporting">
          Sensitive environment values stay outside the dashboard and are never returned to the browser. Set INSTANCE variables through the host&apos;s secret-management facility.
        </p>
        <p className="admin-supporting">
          If the Owner account is inaccessible, use the interactive <code>pnpm admin:recover-owner</code> command on the trusted server.
        </p>
      </section>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const session = await requireAdminPageSession();
  const params = await searchParams;
  const section = parseSection(params.section);
  const role = session.roles[0] ?? "EDITOR";
  const canReadAdministration = hasPermission(session.permissions, "users:manage");

  return (
    <div className="admin-frame">
      <AdminDashboardNav activeSection={section} role={role} />
      <div className="admin-main-column">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar-kicker">ByteClave / Admin</span>
            <span className="admin-topbar-user">{session.displayName} · {role}</span>
          </div>
          <div className="admin-topbar-actions">
            <Link href="/" className="admin-topbar-public">Public site <span aria-hidden="true">↗</span></Link>
            <AdminLogoutButton />
          </div>
        </header>
        <main id="admin-main" className="admin-main">
          <div className="admin-page-heading">
            <div>
              <p className="admin-kicker">Secure management</p>
              <h1>{sectionLabels[section]}</h1>
              <p className="admin-supporting">Signed in as {session.email}</p>
            </div>
            <span className={`admin-role-indicator role-${role.toLowerCase()}`}>{role}</span>
          </div>
          {section === "overview" && <Overview canReadAdministration={canReadAdministration} />}
          {section === "users" && <UsersSection session={session} />}
          {section === "audit" && <AuditSection session={session} />}
          {section === "settings" && <SettingsSection session={session} />}
          {section === "appearance" && <AppearancePanel />}
          {![ "overview", "users", "audit", "settings", "appearance" ].includes(section) && (
            <DeferredSection section={section} />
          )}
          <footer className="admin-page-footer">
            <span>ByteClave · Access is checked on the server for every administrative request.</span>
            <Link href="/">Return to public site</Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
