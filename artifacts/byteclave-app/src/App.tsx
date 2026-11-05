import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminCatalogQueryKey, getGetAdminOverviewQueryKey, getGetAdminSessionQueryKey,
  getGetExploreCatalogQueryKey, getGetPublicCategoryQueryKey, getGetPublicCollectionQueryKey,
  getGetPublicDiscoveryQueryKey, getGetPublicSubcategoryQueryKey, getSearchPublishedCatalogQueryKey,
  useCreateCategory, useCreateCollection, useCreateDiscovery, useCreateSubcategory, useCreateTag,
  useDeleteCategory, useDeleteCollection, useDeleteDiscovery, useDeleteSubcategory, useDeleteTag,
  useGetAdminCatalog, useGetAdminOverview, useGetAdminSession, useGetExploreCatalog,
  useGetPublicCategory, useGetPublicCollection, useGetPublicDiscovery, useGetPublicSubcategory,
  useLoginAdmin, useLogoutAdmin, useSearchPublishedCatalog, useUpdateCategory, useUpdateCollection,
  useUpdateDiscovery, useUpdateSubcategory, useUpdateTag,
} from '@workspace/api-client-react';
import type { AdminCatalog, Category, Collection, Discovery, DiscoveryInput, Subcategory } from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import { BrandMotion } from '@/components/brand-motion';
import { AdminAuditTable } from '@/components/admin-audit-table';
import { AdminAccountForm, OwnerSecurityForm } from '@/components/admin-forms';
import { AdminUserManagement, type AdminUserRow } from '@/components/admin-user-management';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });
const navItems = [
  ['/', 'Home'], ['/explore', 'Explore'], ['/search', 'Search'],
  ['/explore#categories', 'Categories'], ['/explore#collections', 'Collections'], ['/self-host', 'Self-host'],
];
const adminSections = [
  ['overview', 'Overview'], ['discoveries', 'Discoveries'], ['taxonomy', 'Categories and Subcategories'],
  ['tags', 'Tags'], ['collections', 'Collections'], ['media', 'Media'],
  ['publishing', 'Publishing'], ['versions', 'Version History'], ['users', 'Users and Roles'],
  ['audit', 'Audit Logs'], ['appearance', 'Appearance'], ['settings', 'Settings'],
];
const routeBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const errText = (e: unknown) => e instanceof Error ? e.message : 'The request could not be completed.';
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
const invalidateCatalog = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: getGetAdminCatalogQueryKey() });
  void qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
  void qc.invalidateQueries({ queryKey: getGetExploreCatalogQueryKey() });
};

function SiteShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [path] = useLocation();
  useEffect(() => { if (open) document.getElementById('site-nav-close')?.focus(); }, [open]);
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar">
      <Link className="brand-lockup" href="/" aria-label="ByteClave home"><span className="brand-mark-small"><BrandMotion /></span><span className="brand-name">byte<span>clave</span></span></Link>
      <button className="menu-toggle" type="button" aria-expanded={open} onClick={() => setOpen(!open)}><span className="menu-glyph"><span/><span/></span>Menu</button>
    </header>
    {open && <><button className="drawer-backdrop" aria-label="Close navigation menu" onClick={() => setOpen(false)} /><aside className="site-drawer" aria-label="Site navigation">
      <div className="drawer-heading"><p>Navigate ByteClave</p><button id="site-nav-close" className="drawer-close" onClick={() => setOpen(false)} aria-label="Close navigation menu">×</button></div>
      <nav className="drawer-nav">{navItems.map(([href, label], i) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} onClick={() => setOpen(false)}><span>0{i+1}</span>{label}</Link>)}</nav>
      <div className="drawer-admin-entry"><span>For administrators</span><Link href="/admin/login" onClick={() => setOpen(false)}>Admin Login</Link></div>
      <p className="drawer-note">An open catalog for digital resources.</p>
    </aside></>}
    <main className="main-content" id="main-content">{children}</main>
    <footer className="site-footer"><p className="footer-copy">ByteClave · An open catalog for digital resources.</p><nav className="footer-links"><Link href="/explore">Explore</Link><Link href="/search">Search</Link><Link href="/self-host">Self-host</Link></nav></footer>
  </div>;
}

function Intro({ eyebrow, title, description, context }: { eyebrow: string; title: string; description: string; context?: string[] }) {
  return <header className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{description}</p>{context && <div className="route-context">{context.map((v, i) => <span key={v}>{i > 0 && <b>/ </b>}{v}</span>)}</div>}</header>;
}

function Loading({ label = 'Loading catalog' }: { label?: string }) {
  return <div className="loading-state" role="status"><BrandMotion mode="LOADING" /><p>{label}</p></div>;
}
function Failure({ message, retry }: { message: string; retry?: () => void }) {
  return <section className="error-state container"><p className="eyebrow">Request interrupted</p><h1>We couldn’t load this view.</h1><p>{message}</p>{retry && <button className="button-link" onClick={retry}>Try again</button>}<Link className="button-link" href="/explore">Back to Explore</Link></section>;
}
function DiscoveryRows({ items, empty = 'No published Discoveries are listed here yet.' }: { items?: Discovery[]; empty?: string }) {
  if (!items?.length) return <p className="empty-state">{empty}</p>;
  return <ul className="discovery-list">{items.map(d => <li className="discovery-row" key={d.id}><article>
    <div className="discovery-heading"><h2><Link href={`/discoveries/${d.slug}`}>{d.title}</Link></h2><a className="discovery-url" href={d.url} target="_blank" rel="noreferrer">{d.url}</a></div>
    <p className="discovery-description"><span aria-hidden="true">— </span>{d.summary || d.description || 'No description has been provided for this resource.'}</p>
    <div className="discovery-actions"><a className="text-action" href={d.url} target="_blank" rel="noreferrer">Open <span aria-hidden="true">↗</span></a><Link className="text-action inspect-action" href={`/discoveries/${d.slug}`}>Inspect <span aria-hidden="true">→</span></Link></div>
  </article></li>)}</ul>;
}
function HomePage() {
  return <div className="container">
    <section className="hero" aria-labelledby="home-title"><div className="hero-copy"><p className="eyebrow">An open catalog for digital resources</p><h1 id="home-title">Discover resources.<br/>Understand <em>what’s behind them.</em></h1><p className="lead">Find trustworthy digital tools with useful context about what they are and how they work.</p><div className="hero-actions"><Link className="button-link primary" href="/explore">Explore <span className="arrow">→</span></Link><Link className="button-link" href="/self-host">Self-host</Link></div><p className="search-access">Looking for something specific? <Link href="/search">Search the catalog</Link></p></div><div className="hero-visual" aria-hidden="true"><BrandMotion mode="INTRO" /></div></section>
    <section className="section"><div className="section-heading"><div><p className="eyebrow">A better way to browse</p><h2>Context before clicks.</h2></div><p className="section-note">An open catalog built around clarity, not rankings or hype.</p></div><div className="principles"><article className="principle"><p className="principle-index">01 / Discover</p><h3>Find what fits</h3><p>Browse tools by category, collection, or the question you came to answer.</p></article><article className="principle"><p className="principle-index">02 / Understand</p><h3>Know what it is</h3><p>Each listing carries clear descriptions and useful context before you leave.</p></article><article className="principle"><p className="principle-index">03 / Verify</p><h3>Trust the source</h3><p>Published resources are intentionally maintained and open to inspection.</p></article></div></section>
    <section className="gateway"><div><p className="eyebrow">Open catalog</p><h2>Start with the map.</h2><p>Explore the categories and collections shaping the directory.</p></div><Link className="button-link primary" href="/explore">Explore the catalog <span className="arrow">→</span></Link></section>
  </div>;
}
function ExplorePage() {
  const { data, isLoading, isError, error, refetch } = useGetExploreCatalog();
  if (isLoading) return <Loading />;
  if (isError) return <Failure message={errText(error)} retry={() => void refetch()} />;
  const c = data!;
  return <div className="container"><Intro eyebrow="Catalog gateway" title="Explore" description="Browse categories and curated collections. Every resource shown in public listings is intentionally published."/>
    <div className="explore-toolbar"><p className="catalog-count"><strong>{c.publishedDiscoveryCount}</strong> published {c.publishedDiscoveryCount === 1 ? 'Discovery' : 'Discoveries'}</p><Link className="button-link" href="/search">Search the catalog <span>→</span></Link></div>
    <div className="catalog-groups"><section className="catalog-group" id="categories"><h2>Categories</h2>{c.categories.length ? <ul className="catalog-list">{c.categories.map(cat => <li key={cat.id}><Link className="category-link" href={`/categories/${cat.slug}`}>{cat.name}</Link>{cat.subcategories.length > 0 && <ul className="subcategory-list">{cat.subcategories.map(sub => <li key={sub.slug}><Link href={`/categories/${cat.slug}/${sub.slug}`}>{sub.name}</Link></li>)}</ul>}</li>)}</ul> : <p className="catalog-empty">No categories have been added yet.</p>}</section>
    <section className="catalog-group" id="collections"><h2>Curated collections</h2>{c.collections.length ? <ul className="catalog-list">{c.collections.map(col => <li key={col.slug}><Link href={`/collections/${col.slug}`}>{col.name}</Link>{col.description && <p className="catalog-empty">{col.description}</p>}<span className="catalog-item-count">{col.publishedDiscoveryCount} published {col.publishedDiscoveryCount === 1 ? 'resource' : 'resources'}</span></li>)}</ul> : <p className="catalog-empty">No curated collections have been added yet.</p>}</section></div>
  </div>;
}
function SearchPage() {
  const [, setLocation] = useLocation();
  const [term, setTerm] = useState(new URLSearchParams(window.location.search).get('q') || '');
  const query = new URLSearchParams(window.location.search).get('q') || '';
  const params = useMemo(() => ({ q: query || ' ' }), [query]);
  const result = useSearchPublishedCatalog(params, { query: { enabled: query.trim().length > 0, queryKey: getSearchPublishedCatalogQueryKey(params) } });
  function submit(e: FormEvent) { e.preventDefault(); setLocation(`/search?q=${encodeURIComponent(term.trim())}`); }
  return <div className="container"><Intro eyebrow="Published catalog" title="Search" description="Search published digital resources by name, topic, or description."/>
    <form className="search-form" onSubmit={submit}><label className="sr-only" htmlFor="catalog-search">Search the catalog</label><input id="catalog-search" type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Try a tool, topic, or use case" required/><button className="button-link primary" type="submit">Search <span>→</span></button></form>
    {query && <section className="search-results"><div className="section-heading"><h2>Results for “{query}”</h2><p className="section-note">{result.data?.length ?? 0} published matches</p></div>{result.isLoading ? <Loading label="Searching published resources"/> : result.isError ? <Failure message={errText(result.error)} retry={() => void result.refetch()}/> : <DiscoveryRows items={result.data} empty="No published resources matched this search."/>}</section>}
  </div>;
}
function CategoryPage() {
  const [, params] = useRoute('/categories/:slug');
  const slug = params?.slug || '';
  const q = useGetPublicCategory(slug, { query: { queryKey: getGetPublicCategoryQueryKey(slug) } });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failure message={errText(q.error)} retry={() => void q.refetch()} />;
  const { category, subcategories, discoveries } = q.data;
  return <div className="container"><Intro eyebrow="Category" title={category.name} description={category.description || `Explore published resources filed under ${category.name}.`} context={['Categories', category.name]}/>{subcategories.length > 0 && <section className="taxonomy-section"><div className="section-heading"><h2>Subcategories</h2></div><ul className="taxonomy-list">{subcategories.map(s => <li key={s.id}><Link href={`/categories/${category.slug}/${s.slug}`}>{s.name}</Link>{s.description && <p>{s.description}</p>}</li>)}</ul></section>}<section className="listing-section"><div className="section-heading"><h2>Published resources</h2></div><DiscoveryRows items={discoveries}/></section></div>;
}
function SubcategoryPage() {
  const [, params] = useRoute('/categories/:categorySlug/:subcategorySlug');
  const cs = params?.categorySlug || '', ss = params?.subcategorySlug || '';
  const q = useGetPublicSubcategory(cs, ss, { query: { queryKey: getGetPublicSubcategoryQueryKey(cs, ss) } });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failure message={errText(q.error)} retry={() => void q.refetch()} />;
  return <div className="container subcategory-page"><Intro eyebrow="Subcategory" title={q.data.subcategory.name} description={q.data.subcategory.description || `Published resources filed under ${q.data.subcategory.name}.`} context={['Categories', q.data.category.name, q.data.subcategory.name]}/><section className="listing-section"><div className="section-heading"><h2>Published resources</h2></div><DiscoveryRows items={q.data.discoveries}/></section></div>;
}
function CollectionPage() {
  const [, params] = useRoute('/collections/:slug'); const slug = params?.slug || '';
  const q = useGetPublicCollection(slug, { query: { queryKey: getGetPublicCollectionQueryKey(slug) } });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failure message={errText(q.error)} retry={() => void q.refetch()} />;
  return <div className="container"><Intro eyebrow="Curated collection" title={q.data.collection.name} description={q.data.collection.description || 'A selection of published digital resources.'} context={['Collections', q.data.collection.name]}/><section className="listing-section"><div className="section-heading"><h2>Resources <span className="catalog-item-count">{q.data.discoveries.length} listed</span></h2></div><DiscoveryRows items={q.data.discoveries}/></section></div>;
}
function DiscoveryPage() {
  const [, params] = useRoute('/discoveries/:slug'); const slug = params?.slug || '';
  const q = useGetPublicDiscovery(slug, { query: { queryKey: getGetPublicDiscoveryQueryKey(slug) } });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failure message={errText(q.error)} retry={() => void q.refetch()} />;
  const { discovery: d, inspection } = q.data;
  return <div className="container"><Intro eyebrow="Published discovery" title={d.title} description={d.summary || 'A digital resource in the ByteClave catalog.'} context={['Discoveries', d.title]}/><article className="discovery-detail"><div className="detail-primary"><a className="discovery-url detail-url" href={d.url} target="_blank" rel="noreferrer">{d.url}</a><a className="button-link primary open-resource" href={d.url} target="_blank" rel="noreferrer">Open resource <span>↗</span></a>{d.description && <section className="long-description"><h2>About this resource</h2><p>{d.description}</p></section>}{d.placements?.length > 0 && <section className="detail-taxonomy"><h2>Filed under</h2><ul>{d.placements.map((p, i) => <li key={`${p.categorySlug}-${i}`}><Link href={`/categories/${p.categorySlug}`}>{p.categoryName}</Link>{p.subcategorySlug && <><span> / </span><Link className="subcategory-placement-link" href={`/categories/${p.categorySlug}/${p.subcategorySlug}`}>{p.subcategoryName}</Link></>}</li>)}</ul></section>}{d.tags?.length > 0 && <div className="tag-list">{d.tags.map(t => <span key={t.id}>{t.name}</span>)}</div>}{inspection && <section className="inspection-summary"><h2>Resource check</h2><p>{inspection.status} · checked by {inspection.inspector}</p>{inspection.observations.map((observation, index) => <p key={`${observation.code}-${index}`}>{observation.summary}</p>)}</section>}</div></article></div>;
}
function SelfHostPage() {
  return <div className="container"><Intro eyebrow="Open infrastructure" title="Self-host ByteClave" description="Run your own instance of the open catalog and keep control of its content and infrastructure."/><section className="self-host-content"><p className="eyebrow">For independent operators</p><h2>Your catalog, your rules.</h2><p>ByteClave is designed to make digital resources easier to discover and understand. Self-hosting lets communities maintain their own trustworthy directory, with direct control over publication and editorial choices.</p><p>Deploy the application alongside its API and database, configure the instance through your hosting environment, then invite administrators to curate content. Keep credentials and environment values in your host’s secret-management facility.</p><p>Public listings include only intentionally published discoveries. Administrative actions are protected by sign-in and permission checks.</p><Link className="button-link" href="/admin/login">Administrator sign in <span>→</span></Link></section></div>;
}

function AdminLogin() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const login = useLoginAdmin();
  function submit(e: FormEvent) { e.preventDefault(); setError(''); login.mutate({ data: { email, password } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); setLocation('/admin'); }, onError: er => setError(errText(er)) }); }
  return <section className="admin-auth-page"><header className="admin-auth-header"><Link className="admin-auth-brand" href="/"><BrandMotion/><span>byte<span>clave</span></span></Link><Link className="admin-auth-back" href="/">Back to public site</Link></header><div className="admin-auth-card"><p className="admin-kicker">Protected workspace</p><h1>Admin sign in</h1><p className="admin-supporting">Sign in to maintain trustworthy catalog content.</p><form className="admin-form" onSubmit={submit}><label>Email<input data-testid="input-email" type="email" autoComplete="username" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input data-testid="input-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p className="admin-form-error" role="alert">{error}</p>}<button className="admin-primary-button" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</button><p className="admin-form-help">Access is invitation-only. There is no public registration.</p></form></div></section>;
}
function AdminTokenPage({ mode }: { mode: 'invitation' | 'reset' }) {
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const invitation = mode === 'invitation';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (password !== form.get('confirmPassword')) {
      setError('The passwords do not match.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(invitation ? '/api/admin/auth/accept-invitation' : '/api/admin/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          token,
          password,
          ...(invitation ? { displayName: String(form.get('displayName') || '').trim() } : {}),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The link could not be used.');
      setSuccess(invitation ? 'Your account is ready. Opening the Admin dashboard…' : 'Password reset complete. Redirecting to sign in…');
      window.setTimeout(() => setLocation(invitation ? '/admin' : '/admin/login'), 700);
    } catch (submitError) {
      setError(errText(submitError));
    } finally {
      setBusy(false);
    }
  }
  return <section className="admin-auth-page"><header className="admin-auth-header"><Link className="admin-auth-brand" href="/"><BrandMotion/><span>byte<span>clave</span></span></Link><Link className="admin-auth-back" href="/">Back to public site</Link></header><div className="admin-auth-card"><p className="admin-kicker">Protected workspace</p><h1>{invitation ? 'Accept administrator invitation' : 'Reset administrator password'}</h1><p className="admin-supporting">{invitation ? 'Choose a display name and password to activate this account.' : 'Choose a new password for your administrator account.'}</p><form className="admin-form" onSubmit={submit}>{invitation && <label>Display name<input name="displayName" autoComplete="name" required maxLength={120}/></label>}<label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>{!token && <p className="admin-form-error" role="alert">This link is missing its single-use token.</p>}{error && <p className="admin-form-error" role="alert">{error}</p>}{success && <p className="admin-form-success" role="status">{success}</p>}<button className="admin-primary-button" disabled={busy || !token}>{busy ? 'Saving…' : invitation ? 'Accept invitation' : 'Reset password'}</button></form></div></section>;
}
function AdminSidebar({ active, role, open, close }: { active: string; role: string; open: boolean; close: () => void }) {
  return <><aside className={`admin-sidebar${open ? ' is-open' : ''}`}><div className="admin-brand"><Link href="/admin" onClick={close}><BrandMotion/><span>byte<span>clave</span></span></Link><p>Administration</p></div><nav aria-label="Admin sections">{adminSections.map(([id, label], i) => <Link key={id} href={id === 'overview' ? '/admin' : `/admin?section=${id}`} aria-current={id === active ? 'page' : undefined} onClick={close}><span className="admin-nav-index">{String(i+1).padStart(2,'0')}</span><span>{label}</span></Link>)}</nav><div className="admin-sidebar-footer"><span className="admin-role-indicator">{role}</span><Link href="/" onClick={close}>View public site <span>↗</span></Link></div></aside>{open && <button className="admin-sidebar-scrim" type="button" aria-label="Close admin menu" onClick={close}/>}</>;
}
function AdminFrame({ children, active, session }: { children: ReactNode; active: string; session: { displayName: string; email: string; roles: string[] } }) {
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const logout = useLogoutAdmin(); const role = session.roles[0] || 'EDITOR'; const [menuOpen, setMenuOpen] = useState(false);
  return <div className="admin-frame"><AdminSidebar active={active} role={role} open={menuOpen} close={() => setMenuOpen(false)}/><div className="admin-main-column"><header className="admin-topbar"><button className="admin-mobile-toggle" type="button" aria-expanded={menuOpen} aria-controls="admin-sidebar" onClick={() => setMenuOpen(v => !v)}>Admin menu</button><div><span className="admin-topbar-kicker">ByteClave / Admin</span><span className="admin-topbar-user">{session.displayName} · {role}</span></div><div className="admin-topbar-actions"><Link className="admin-topbar-public" href="/">Public site ↗</Link><button className="admin-secondary-button" onClick={() => logout.mutate(undefined, { onSuccess: () => { qc.clear(); setLocation('/admin/login'); }, onError: e => window.alert(errText(e)) })} disabled={logout.isPending}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button></div></header><main className="admin-main"><div className="admin-page-heading"><div><p className="admin-kicker">Secure management</p><h1>{adminSections.find(([s]) => s === active)?.[1] || 'Overview'}</h1><p className="admin-supporting">Signed in as {session.email}</p></div><span className={`admin-role-indicator role-${role.toLowerCase()}`}>{role}</span></div>{children}<footer className="admin-page-footer"><span>ByteClave · Access is checked for every administrative request.</span><Link href="/">Return to public site</Link></footer></main></div></div>;
}
function AdminGate() {
  const session = useGetAdminSession({ query: { queryKey: getGetAdminSessionQueryKey(), retry: false } });
  const search = new URLSearchParams(window.location.search); const section = search.get('section') || 'overview';
  if (session.isLoading) return <div className="admin-frame"><Loading label="Checking administrator session"/></div>;
  if (session.isError || !session.data) return <AdminLogin />;
  return <AdminFrame active={section} session={session.data}><AdminContent section={section} session={session.data}/></AdminFrame>;
}

type AdminSessionView = { displayName: string; email: string; roles: string[] };
type SecuritySettingsView = { sessionHours: number; maxLoginAttempts: number; lockoutMinutes: number };
async function adminJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function AdminUsersSection({ role }: { role: string }) {
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminJson<AdminUserRow[]>('/api/admin/users'),
    retry: false,
  });
  if (users.isLoading) return <Loading label="Loading administrator accounts"/>;
  if (users.isError || !users.data) return <Failure message={errText(users.error)} retry={() => void users.refetch()}/>;
  return <AdminUserManagement users={users.data} actorRole={(role || 'EDITOR') as AdminUserRow['role']}/>;
}

function AdminAuditSection() {
  const audit = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => adminJson<Parameters<typeof AdminAuditTable>[0]['events']>('/api/admin/audit'),
    retry: false,
  });
  if (audit.isLoading) return <Loading label="Loading audit history"/>;
  if (audit.isError || !audit.data) return <Failure message={errText(audit.error)} retry={() => void audit.refetch()}/>;
  return <section className="admin-panel"><p className="admin-kicker">Append-only history</p><h2>Audit Logs</h2><p className="admin-supporting">Recent authentication and security-sensitive administrative actions. Passwords and session tokens are never recorded.</p><AdminAuditTable events={audit.data}/></section>;
}

function AdminAppearanceSection() {
  const palette = [
    { label: 'ByteClave Blue', value: '#1E9BFF' },
    { label: 'Neon Green', value: '#00E676' },
    { label: 'White', value: '#FFFFFF' },
    { label: 'Dark background', value: '#070B10' },
    { label: 'Logo red accent', value: '#EF211D' },
  ];
  return <section className="admin-panel"><p className="admin-kicker">Brand system</p><h2>Appearance</h2><p className="admin-supporting">The canonical ByteClave palette is fixed to keep public and admin experiences consistent.</p><ul className="admin-palette-list">{palette.map(color => <li key={color.value}><span className="admin-palette-swatch" style={{ backgroundColor: color.value }} aria-hidden="true"/><span>{color.label}</span><code>{color.value}</code></li>)}</ul></section>;
}

function AdminSettingsSection({ session }: { session: AdminSessionView }) {
  const isOwner = session.roles.includes('OWNER');
  const settings = useQuery({
    queryKey: ['admin', 'security-settings'],
    queryFn: () => adminJson<SecuritySettingsView>('/api/admin/settings/security'),
    enabled: isOwner,
    retry: false,
  });
  return <div className="admin-stack">
    <AdminAccountForm email={session.email}/>
    {isOwner ? settings.isLoading ? <Loading label="Loading security settings"/> :
      settings.isError || !settings.data ? <Failure message={errText(settings.error)} retry={() => void settings.refetch()}/> :
        <OwnerSecurityForm initial={settings.data}/> :
      <section className="admin-panel"><p className="admin-kicker">Owner controlled</p><h2>Security settings</h2><p className="admin-supporting">Only the Owner can change session and sign-in protection settings.</p></section>}
    <section className="admin-panel"><p className="admin-kicker">System configuration</p><h2>Self-hosted instance</h2><p className="admin-supporting">Sensitive environment values stay outside the dashboard and are never returned to the browser. Set instance variables through the host’s secret-management facility.</p><p className="admin-supporting">If the Owner account is inaccessible, use the interactive <code>pnpm admin:recover-owner</code> command on the trusted server.</p></section>
  </div>;
}

function DeferredAdminSection({ section }: { section: string }) {
  const label = adminSections.find(([id]) => id === section)?.[1] || 'Administration';
  return <section className="admin-panel admin-deferred-panel"><p className="admin-kicker">Protected workspace</p><h2>{label}</h2><p className="admin-supporting">This section is part of the secured dashboard navigation. Its management workflow is intentionally deferred; no unfinished actions are presented as available.</p></section>;
}

function AdminContent({ section, session }: { section: string; session: AdminSessionView }) {
  const qc = useQueryClient();
  const overview = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey(), enabled: section === 'overview' } });
  const needsCatalog = ['discoveries', 'taxonomy', 'tags', 'collections'].includes(section);
  const catalog = useGetAdminCatalog({ query: { queryKey: getGetAdminCatalogQueryKey(), enabled: needsCatalog, refetchOnMount: 'always' } });
  if (section === 'overview') {
    if (overview.isLoading) return <Loading label="Loading live catalog metrics"/>;
    if (overview.isError) return <Failure message={errText(overview.error)} retry={() => void overview.refetch()}/>;
    const metrics = overview.data!;
    return <><div className="admin-metrics-grid">{[['Discoveries',metrics.discoveries,'discoveries'],['Published',metrics.publishedDiscoveries,'discoveries'],['In review',metrics.reviewDiscoveries,'discoveries'],['Drafts',metrics.draftDiscoveries,'discoveries'],['Categories',metrics.categories,'taxonomy'],['Tags',metrics.tags,'tags'],['Collections',metrics.collections,'collections']].map(([label,value,sec]) => <Link key={label} className="admin-metric" href={`/admin?section=${sec}`}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></Link>)}</div><section className="admin-panel admin-overview-note"><p className="admin-kicker">System status</p><h2>Access controls are active</h2><p className="admin-supporting">Sign-in is invitation-only. Catalog totals reflect live server data and administrative requests remain protected.</p></section></>;
  }
  if (section === 'users') return <AdminUsersSection role={session.roles[0] || 'EDITOR'}/>;
  if (section === 'audit') return <AdminAuditSection/>;
  if (section === 'appearance') return <AdminAppearanceSection/>;
  if (section === 'settings') return <AdminSettingsSection session={session}/>;
  if (!needsCatalog) return <DeferredAdminSection section={section}/>;
  if (catalog.isLoading) return <Loading label="Loading managed catalog"/>;
  if (catalog.isError || !catalog.data) return <Failure message={errText(catalog.error)} retry={() => void catalog.refetch()}/>;
  const data = catalog.data;
  const props = { data, refresh: () => invalidateCatalog(qc) };
  if (section === 'discoveries') return <DiscoveryManager {...props}/>;
  if (section === 'taxonomy') return <TaxonomyManager {...props}/>;
  if (section === 'tags') return <TagManager {...props}/>;
  if (section === 'collections') return <CollectionManager {...props}/>;
  return <section className="admin-panel"><p className="admin-kicker">Protected workspace</p><h2>Choose a content section</h2><p className="admin-supporting">Use the administration navigation to maintain discoveries, taxonomy, tags, and collections.</p></section>;
}

function DiscoveryManager({ data, refresh }: { data: AdminCatalog; refresh: () => void }) {
  const create = useCreateDiscovery(), update = useUpdateDiscovery(), remove = useDeleteDiscovery();
  const [editing, setEditing] = useState<Discovery | null>(null), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const cats = data.categories;
  const start = (d?: Discovery) => { setEditing(d || null); setNotice(''); setError(''); };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const placements = f.getAll('placement').map(String).filter(Boolean).map((value, i) => { const [categoryId, subcategoryId] = value.split('|'); return { categoryId, subcategoryId: subcategoryId || null, sortOrder: i }; });
    const input: DiscoveryInput = { title: String(f.get('title')), url: String(f.get('url')), slug: String(f.get('slug') || '') || undefined, summary: String(f.get('summary') || '') || null, description: String(f.get('description') || '') || null, status: String(f.get('status')) as DiscoveryInput['status'], tags: String(f.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean), placements };
    setError(''); setNotice('');
    const done = (result: { discovery: Discovery; created: boolean; duplicate: boolean }) => { refresh(); if (result.duplicate) { setEditing(result.discovery); setNotice(`This URL already exists as “${result.discovery.title}”. Existing placements are selected below; add another placement and save to append it without duplicating existing placements.`); } else { setEditing(null); setNotice(result.created ? 'Discovery created.' : 'Discovery saved.'); } };
    if (editing) update.mutate({ id: editing.id, data: input }, { onSuccess: done, onError: er => setError(errText(er)) });
    else create.mutate({ data: input }, { onSuccess: done, onError: er => setError(errText(er)) });
  }
  const pending = create.isPending || update.isPending;
  return <div className="admin-stack"><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Content records</p><h2>{editing ? 'Edit discovery' : 'Add a discovery'}</h2></div><span className="admin-panel-count">{data.discoveries.length} total</span></div>
    <form key={editing?.id || 'new-discovery'} className="admin-form admin-content-form" onSubmit={submit}>
      <div className="admin-form-grid"><label>Title / name<input name="title" required maxLength={180} defaultValue={editing?.title || ''} onChange={e => { if (!editing) { const slug = e.currentTarget.form?.elements.namedItem('slug') as HTMLInputElement; if (slug && !slug.dataset.edited) slug.value = slugify(e.target.value); } }} placeholder="Resource name"/></label><label>URL<input name="url" type="url" required maxLength={4096} defaultValue={editing?.url || ''} placeholder="https://example.org"/></label><label>Slug<input name="slug" maxLength={120} defaultValue={editing?.slug || ''} onInput={e => { (e.currentTarget as HTMLInputElement).dataset.edited = '1'; }} placeholder="Generated from title"/></label><label>Publication status<select name="status" defaultValue={editing?.status || 'draft'}><option value="draft">Draft</option><option value="review">Review</option><option value="published" disabled={!editing || (editing.status !== 'review' && editing.status !== 'published')}>Published (submit review first)</option><option value="archived">Archived</option></select></label><label className="span-two">Summary<textarea name="summary" maxLength={500} defaultValue={editing?.summary || ''} rows={2}/></label><label className="span-two">Description<textarea name="description" maxLength={10000} defaultValue={editing?.description || ''} rows={4}/></label><label className="span-two">Tags <span className="admin-form-help">Comma-separated; names are normalized and reused.</span><input name="tags" defaultValue={editing?.tags.map(t => t.name).join(', ') || ''}/></label></div>
      <fieldset className="placement-fieldset"><legend>Category placements</legend><p className="admin-form-help">Choose one or more placements. Existing records are never duplicated by URL.</p><div className="placement-options">{cats.map(cat => <div key={cat.id} className="placement-category"><label><input type="checkbox" name="placement" value={`${cat.id}|`} defaultChecked={editing?.placements.some(p => p.categoryId === cat.id && !p.subcategoryId)}/> {cat.name} (category root)</label>{cat.subcategories.map(sub => <label key={sub.id} className="sub-placement"><input type="checkbox" name="placement" value={`${cat.id}|${sub.id}`} defaultChecked={editing?.placements.some(p => p.subcategoryId === sub.id)}/> {sub.name}</label>)}</div>)}</div></fieldset>
      {error && <p className="admin-form-error" role="alert">{error}</p>}{notice && <p className="admin-form-success" role="status">{notice}</p>}
      <div className="admin-form-actions"><button className="admin-primary-button" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save discovery' : 'Create discovery'}</button>{editing && <button className="admin-secondary-button" type="button" onClick={() => start()}>Cancel edit</button>}</div>
    </form></section>
    <section className="admin-panel"><div className="admin-panel-heading"><h2>Discoveries</h2><span className="admin-panel-count">{data.discoveries.length} records</span></div>{data.discoveries.length ? <div className="admin-record-list">{data.discoveries.map(d => <article className="admin-record" key={d.id}><div><strong>{d.title}</strong><span className="admin-table-secondary">{d.url}</span><span className={`status-pill status-${d.status}`}>{d.status}</span><span className="admin-table-secondary">{d.placements.map(p => `${p.categoryName}${p.subcategoryName ? ` / ${p.subcategoryName}` : ''}`).join(' · ') || 'No placements'}</span></div><div className="admin-row-actions"><button className="admin-table-action" onClick={() => { start(d); document.querySelector('.admin-content-form')?.scrollIntoView({ behavior: 'smooth' }); }}>Edit</button><button className="admin-table-action danger-action" onClick={() => { if (window.confirm(`Delete “${d.title}”? This cannot be undone.`)) remove.mutate({ id: d.id }, { onSuccess: () => { refresh(); setNotice('Discovery deleted.'); }, onError: e => setError(errText(e)) }); }}>Delete</button></div></article>)}</div> : <p className="admin-empty">No discoveries yet. Add the first trustworthy resource above.</p>}</section>
  </div>;
}

function TaxonomyManager({ data, refresh }: { data: AdminCatalog; refresh: () => void }) {
  const addCat = useCreateCategory(), editCat = useUpdateCategory(), delCat = useDeleteCategory(), addSub = useCreateSubcategory(), editSub = useUpdateSubcategory(), delSub = useDeleteSubcategory();
  const [editingCat, setEditingCat] = useState<Category | null>(null), [editingSub, setEditingSub] = useState<Subcategory | null>(null), [error, setError] = useState(''), [success, setSuccess] = useState('');
  function categorySubmit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); const payload = { name: String(f.get('name')), slug: String(f.get('slug') || '') || undefined, description: String(f.get('description') || '') || null, sortOrder: Number(f.get('order') || 0), isVisible: f.get('visible') === 'on' }; const done = () => { refresh(); setEditingCat(null); setSuccess('Category saved.'); setError(''); }; editingCat ? editCat.mutate({ id: editingCat.id, data: payload }, { onSuccess: done, onError: e => setError(errText(e)) }) : addCat.mutate({ data: payload }, { onSuccess: done, onError: e => setError(errText(e)) }); }
  function subSubmit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); const categoryId = String(f.get('categoryId')); const payload = { categoryId, name: String(f.get('name')), slug: String(f.get('slug') || '') || undefined, description: String(f.get('description') || '') || null, sortOrder: Number(f.get('order') || 0), isVisible: f.get('visible') === 'on' }; const done = () => { refresh(); setEditingSub(null); setSuccess('Subcategory saved.'); setError(''); }; editingSub ? editSub.mutate({ id: editingSub.id, data: payload }, { onSuccess: done, onError: e => setError(errText(e)) }) : addSub.mutate({ categoryId, data: payload }, { onSuccess: done, onError: e => setError(errText(e)) }); }
  return <div className="admin-stack"><section className="admin-panel"><div className="admin-panel-heading"><h2>{editingCat ? 'Edit category' : 'Create category'}</h2></div><form key={editingCat?.id || 'new-category'} className="admin-form admin-content-form" onSubmit={categorySubmit}><div className="admin-form-grid"><label>Name<input name="name" required maxLength={120} defaultValue={editingCat?.name}/></label><label>Slug<input name="slug" defaultValue={editingCat?.slug} placeholder="Generated from name"/></label><label>Description<input name="description" maxLength={2000} defaultValue={editingCat?.description || ''}/></label><label>Order<input type="number" min="0" max="100000" name="order" defaultValue={editingCat?.sortOrder || 0}/></label><label className="checkbox-label"><input type="checkbox" name="visible" defaultChecked={editingCat?.isVisible ?? true}/> Visible in public catalog</label></div>{error && <p className="admin-form-error" role="alert">{error}</p>}{success && <p className="admin-form-success" role="status">{success}</p>}<div className="admin-form-actions"><button className="admin-primary-button" disabled={addCat.isPending || editCat.isPending}>{editingCat ? 'Save category' : 'Create category'}</button>{editingCat && <button className="admin-secondary-button" type="button" onClick={() => setEditingCat(null)}>Cancel</button>}</div></form></section>
  <section className="admin-panel"><div className="admin-panel-heading"><h2>{editingSub ? 'Edit subcategory' : 'Create subcategory'}</h2></div><form key={editingSub?.id || 'new-subcategory'} className="admin-form admin-content-form" onSubmit={subSubmit}><div className="admin-form-grid"><label>Parent category<select name="categoryId" required defaultValue={editingSub?.categoryId || ''}><option value="" disabled>Select category</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Name<input name="name" required maxLength={120} defaultValue={editingSub?.name}/></label><label>Slug<input name="slug" defaultValue={editingSub?.slug}/></label><label>Description<input name="description" maxLength={2000} defaultValue={editingSub?.description || ''}/></label><label>Order<input type="number" name="order" min="0" max="100000" defaultValue={editingSub?.sortOrder || 0}/></label><label className="checkbox-label"><input type="checkbox" name="visible" defaultChecked={editingSub?.isVisible ?? true}/> Visible in public catalog</label></div>{error && <p className="admin-form-error" role="alert">{error}</p>}<div className="admin-form-actions"><button className="admin-primary-button" disabled={addSub.isPending || editSub.isPending}>{editingSub ? 'Save subcategory' : 'Create subcategory'}</button>{editingSub && <button className="admin-secondary-button" type="button" onClick={() => setEditingSub(null)}>Cancel</button>}</div></form></section>
  <section className="admin-panel"><h2>Taxonomy order and visibility</h2>{data.categories.length ? <div className="admin-record-list">{data.categories.map(c => <article className="admin-record taxonomy-record" key={c.id}><div><strong>{c.name}</strong><span className="admin-table-secondary">/{c.slug} · order {c.sortOrder} · {c.discoveryCount} discoveries · {c.isVisible ? 'Visible' : 'Hidden'}</span></div><div className="admin-row-actions"><button className="admin-table-action" onClick={() => { setEditingCat(c); document.querySelector('.admin-content-form')?.scrollIntoView({behavior:'smooth'}); }}>Edit</button><button className="admin-table-action" onClick={() => editCat.mutate({ id: c.id, data: { name:c.name, slug:c.slug, description:c.description, sortOrder: Math.max(0,c.sortOrder-1), isVisible:c.isVisible } }, { onSuccess: refresh, onError:e=>setError(errText(e)) })}>Move up</button><button className="admin-table-action" onClick={() => editCat.mutate({ id: c.id, data: { name:c.name, slug:c.slug, description:c.description, sortOrder:c.sortOrder+1, isVisible:c.isVisible } }, { onSuccess: refresh, onError:e=>setError(errText(e)) })}>Move down</button><button className="admin-table-action" onClick={() => editCat.mutate({ id:c.id, data:{ name:c.name, slug:c.slug, description:c.description, sortOrder:c.sortOrder, isVisible:!c.isVisible } }, { onSuccess:refresh, onError:e=>setError(errText(e)) })}>{c.isVisible ? 'Hide' : 'Show'}</button><button className="admin-table-action danger-action" disabled={c.discoveryCount > 0 || c.subcategories.length > 0} title={c.discoveryCount || c.subcategories.length ? 'Move or remove related content first' : 'Delete category'} onClick={() => { if (!c.discoveryCount && !c.subcategories.length && confirm(`Delete ${c.name}?`)) delCat.mutate({ id:c.id }, { onSuccess:refresh, onError:e=>setError(errText(e)) }); }}>Delete</button></div>{c.subcategories.map(s => <div key={s.id} className="admin-record subcategory-admin-record"><div><strong>{s.name}</strong><span className="admin-table-secondary">/{s.slug} · order {s.sortOrder} · {s.discoveryCount} discoveries · {s.isVisible ? 'Visible' : 'Hidden'}</span></div><div className="admin-row-actions"><button className="admin-table-action" onClick={() => { setEditingSub(s); document.querySelectorAll('.admin-content-form')[1]?.scrollIntoView({behavior:'smooth'}); }}>Edit / move</button><button className="admin-table-action" onClick={() => editSub.mutate({ id:s.id, data:{ categoryId:s.categoryId, name:s.name, slug:s.slug, description:s.description, sortOrder:Math.max(0,s.sortOrder-1), isVisible:s.isVisible } }, { onSuccess:refresh, onError:e=>setError(errText(e)) })}>Up</button><button className="admin-table-action" onClick={() => editSub.mutate({ id:s.id, data:{ categoryId:s.categoryId, name:s.name, slug:s.slug, description:s.description, sortOrder:s.sortOrder+1, isVisible:s.isVisible } }, { onSuccess:refresh, onError:e=>setError(errText(e)) })}>Down</button><button className="admin-table-action" onClick={() => editSub.mutate({ id:s.id, data:{ categoryId:s.categoryId, name:s.name, slug:s.slug, description:s.description, sortOrder:s.sortOrder, isVisible:!s.isVisible } }, { onSuccess:refresh, onError:e=>setError(errText(e)) })}>{s.isVisible ? 'Hide' : 'Show'}</button><button className="admin-table-action danger-action" onClick={() => { const move = s.discoveryCount > 0 ? confirm(`Move ${s.discoveryCount} discoveries to ${c.name}'s category root before deleting? Choose Cancel to keep the subcategory.`) : confirm(`Delete ${s.name}?`); if (move || !s.discoveryCount) delSub.mutate({ id:s.id, data:{ moveDiscoveriesToCategoryRoot: move } }, { onSuccess:refresh, onError:e=>setError(errText(e)) }); }}>Delete / move</button></div></div>)}</article>)}</div> : <p className="admin-empty">No categories yet. Create one above.</p>}</section></div>;
}

function TagManager({ data, refresh }: { data: AdminCatalog; refresh: () => void }) {
  const add=useCreateTag(), edit=useUpdateTag(), remove=useDeleteTag(); const [item,setItem]=useState<{id:string;name:string}|null>(null),[error,setError]=useState(''),[success,setSuccess]=useState('');
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const name=String(new FormData(e.currentTarget).get('name')).trim(); if(!name){setError('Enter a tag name.');return;} const done=()=>{refresh();setItem(null);setError('');setSuccess('Tag saved. Names are normalized and reusable.');}; item?edit.mutate({id:item.id,data:{name}},{onSuccess:done,onError:e=>setError(errText(e))}):add.mutate({data:{name}},{onSuccess:done,onError:e=>setError(errText(e))});}
  return <div className="admin-stack"><section className="admin-panel"><div className="admin-panel-heading"><h2>{item?'Rename tag':'Create or reuse a tag'}</h2><span className="admin-panel-count">{data.tags.length} tags</span></div><form className="admin-form admin-inline-form" onSubmit={submit}><label>Tag name<input name="name" required maxLength={80} defaultValue={item?.name || ''} placeholder="For example, open source"/></label>{error&&<p className="admin-form-error" role="alert">{error}</p>}{success&&<p className="admin-form-success" role="status">{success}</p>}<div className="admin-form-actions"><button className="admin-primary-button" disabled={add.isPending||edit.isPending}>{item?'Save tag':'Create or reuse'}</button>{item&&<button type="button" className="admin-secondary-button" onClick={()=>setItem(null)}>Cancel</button>}</div></form></section><section className="admin-panel"><h2>Reusable tags</h2>{data.tags.length?<div className="admin-record-list">{data.tags.map(t=>{const usedBy=data.discoveries.filter(d=>d.tags.some(tag=>tag.id===t.id)).length;return <article className="admin-record" key={t.id}><div><strong>{t.name}</strong><span className="admin-table-secondary">/{t.slug} · used by {usedBy} discoveries</span></div><div className="admin-row-actions"><button className="admin-table-action" onClick={()=>setItem(t)}>Rename</button><button className="admin-table-action danger-action" disabled={usedBy>0} title={usedBy?'Remove this tag from discoveries before deleting':'Delete tag'} onClick={()=>{if(!usedBy&&confirm(`Delete ${t.name}?`))remove.mutate({id:t.id},{onSuccess:refresh,onError:e=>setError(errText(e))})}}>Delete</button></div></article>})}</div>:<p className="admin-empty">No reusable tags yet.</p>}</section></div>;
}
function CollectionManager({ data, refresh }: { data: AdminCatalog; refresh: () => void }) {
  const add=useCreateCollection(),edit=useUpdateCollection(),remove=useDeleteCollection();const[item,setItem]=useState<Collection|null>(null),[error,setError]=useState(''),[success,setSuccess]=useState('');
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const ids=String(f.get('members')||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);const payload={name:String(f.get('name')),slug:String(f.get('slug')||'')||undefined,description:String(f.get('description')||'')||null,sortOrder:Number(f.get('order')||0),discoveryIds:ids};const done=()=>{refresh();setItem(null);setError('');setSuccess('Collection saved with ordered membership.');};item?edit.mutate({id:item.id,data:payload},{onSuccess:done,onError:e=>setError(errText(e))}):add.mutate({data:payload},{onSuccess:done,onError:e=>setError(errText(e))});}
  const select=(collection:Collection)=>{setItem(collection);};
  return <div className="admin-stack"><section className="admin-panel"><div className="admin-panel-heading"><h2>{item?'Edit collection':'Create collection'}</h2><span className="admin-panel-count">{data.collections.length} collections</span></div><form className="admin-form admin-content-form" onSubmit={submit}><div className="admin-form-grid"><label>Name<input name="name" required maxLength={160} defaultValue={item?.name||''}/></label><label>Slug<input name="slug" defaultValue={item?.slug||''} placeholder="Generated from name"/></label><label>Description<input name="description" maxLength={2000} defaultValue={item?.description||''}/></label><label>Display order<input name="order" type="number" min="0" max="100000" defaultValue={item?.sortOrder||0}/></label><label className="span-two">Ordered discovery IDs <span className="admin-form-help">One ID per line, or comma-separated. Listed below for selection.</span><textarea name="members" rows={4} defaultValue={item?.discoveryIds.join('\n')||''}/></label></div><div className="membership-picker"><p>Available discoveries</p>{data.discoveries.map(d=><button key={d.id} type="button" className="membership-choice" onClick={e=>{const area=(e.currentTarget.form?.elements.namedItem('members') as HTMLTextAreaElement);const values=area.value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean);if(!values.includes(d.id)){values.push(d.id);area.value=values.join('\n');}}}>{d.title}<span>Add ID</span></button>)}</div>{error&&<p className="admin-form-error" role="alert">{error}</p>}{success&&<p className="admin-form-success" role="status">{success}</p>}<div className="admin-form-actions"><button className="admin-primary-button" disabled={add.isPending||edit.isPending}>{item?'Save collection':'Create collection'}</button>{item&&<button type="button" className="admin-secondary-button" onClick={()=>setItem(null)}>Cancel</button>}</div></form></section><section className="admin-panel"><h2>Collections</h2>{data.collections.length?<div className="admin-record-list">{data.collections.map(c=><article className="admin-record" key={c.id}><div><strong>{c.name}</strong><span className="admin-table-secondary">/{c.slug} · order {c.sortOrder} · {c.discoveryIds.length} members</span><span className="admin-table-secondary">{c.discoveryIds.map(id=>data.discoveries.find(d=>d.id===id)?.title||id).join(' → ')||'No members'}</span></div><div className="admin-row-actions"><button className="admin-table-action" onClick={()=>select(c)}>Edit membership</button><button className="admin-table-action danger-action" onClick={()=>{if(confirm(`Delete ${c.name}?`))remove.mutate({id:c.id},{onSuccess:refresh,onError:e=>setError(errText(e))})}}>Delete</button></div></article>)}</div>:<p className="admin-empty">No collections yet. Create a curated collection above.</p>}</section></div>;
}

function Router() {
  return <Switch>
    <Route path="/admin/invitations/accept" component={() => <AdminTokenPage mode="invitation"/>}/>
    <Route path="/admin/reset-password" component={() => <AdminTokenPage mode="reset"/>}/>
    <Route path="/admin/login" component={AdminLogin}/>
    <Route path="/admin" component={AdminGate}/>
    <Route path="/" component={() => <SiteShell><HomePage/></SiteShell>}/>
    <Route path="/explore" component={() => <SiteShell><ExplorePage/></SiteShell>}/>
    <Route path="/search" component={() => <SiteShell><SearchPage/></SiteShell>}/>
    <Route path="/categories/:categorySlug/:subcategorySlug" component={() => <SiteShell><SubcategoryPage/></SiteShell>}/>
    <Route path="/categories/:slug" component={() => <SiteShell><CategoryPage/></SiteShell>}/>
    <Route path="/collections/:slug" component={() => <SiteShell><CollectionPage/></SiteShell>}/>
    <Route path="/discoveries/:slug" component={() => <SiteShell><DiscoveryPage/></SiteShell>}/>
    <Route path="/self-host" component={() => <SiteShell><SelfHostPage/></SiteShell>}/>
    <Route component={NotFound}/>
  </Switch>;
}
function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={routeBase}><Router/></WouterRouter></QueryClientProvider>;
}
export default App;
