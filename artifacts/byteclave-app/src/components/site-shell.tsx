import type { ReactNode } from "react";
import Link from "next/link";

const navigation = [
  { href: "/explore", label: "Explore" },
  { href: "/search", label: "Search" },
  { href: "/self-host", label: "Self-host" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Link className="brand-lockup" href="/" aria-label="ByteClave home">
          <img src="/byteclave-logo.svg" alt="" />
          <span className="brand-name">byte<span>clave</span></span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <span className="header-mark" aria-hidden="true">OPEN DIRECTORY</span>
      </header>
      <main className="main-content" id="main-content">{children}</main>
      <footer className="site-footer">
        <p className="footer-copy">ByteClave · An open catalog for digital resources.</p>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/explore">Explore</Link>
          <Link href="/self-host">Self-host</Link>
          <Link href="/admin">Project status</Link>
        </nav>
      </footer>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, context }: {
  eyebrow: string;
  title: string;
  description: string;
  context?: string[];
}) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lead">{description}</p>
      {context && <div className="route-context" aria-label="Route context">{context.map((part, index) => (
        <span key={`${part}-${index}`}>{index > 0 && <b aria-hidden="true">/ </b>}{part}</span>
      ))}</div>}
    </header>
  );
}

export function PlaceholderPanel({ title = "Catalog content is not connected yet", children, admin = false }: {
  title?: string;
  children: ReactNode;
  admin?: boolean;
}) {
  return (
    <section className={`placeholder-panel${admin ? " admin-callout" : ""}`} aria-label={title}>
      <span className="placeholder-label">{admin ? "Later phase" : "Foundation"}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
