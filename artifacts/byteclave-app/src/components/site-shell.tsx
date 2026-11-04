"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMotion } from "./brand-motion";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/search", label: "Search" },
  { href: "/explore#categories", label: "Categories" },
  { href: "/explore#collections", label: "Collections" },
  { href: "/self-host", label: "Self-host" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    };
  }, []);

  if (pathname?.startsWith("/admin")) return <>{children}</>;

  function closeDrawer() {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }

  function beginNavigation() {
    setTransitioning(true);
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => setTransitioning(false), 700);
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Link className="brand-lockup" href="/" aria-label="ByteClave home">
          <span className="brand-mark-small" aria-hidden="true">
            <BrandMotion mode="INTRO" label="ByteClave logo" />
          </span>
          <span className="brand-name">byte<span>clave</span></span>
        </Link>
        <button
          ref={toggleRef}
          className="menu-toggle"
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="site-navigation-drawer"
          aria-label={drawerOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span className="menu-glyph" aria-hidden="true"><span /><span /></span>
          <span>Menu</span>
        </button>
        {transitioning && (
          <span className="transition-status" role="status">
            <BrandMotion mode="TRANSITION" label="Navigating" />
            <span>Opening</span>
          </span>
        )}
      </header>
      {drawerOpen && (
        <>
          <button className="drawer-backdrop" type="button" aria-label="Close navigation menu" onClick={closeDrawer} />
          <aside
            ref={drawerRef}
            id="site-navigation-drawer"
            className="site-drawer"
            aria-label="Site navigation"
          >
            <div className="drawer-heading">
              <p>Navigate ByteClave</p>
              <button className="drawer-close" type="button" aria-label="Close navigation menu" onClick={closeDrawer}>×</button>
            </div>
            <nav className="drawer-nav" aria-label="Main navigation">
              {navigation.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  onClick={() => {
                    beginNavigation();
                    setDrawerOpen(false);
                  }}
                >
                  <span>0{index + 1}</span>{item.label}
                </Link>
              ))}
            </nav>
            <div className="drawer-admin-entry">
              <span>For administrators</span>
              <Link
                href="/admin/login"
                onClick={() => {
                  beginNavigation();
                  setDrawerOpen(false);
                }}
              >
                Admin Login
              </Link>
            </div>
            <p className="drawer-note">An open catalog for digital resources.</p>
          </aside>
        </>
      )}
      <main className="main-content" id="main-content">{children}</main>
      <footer className="site-footer">
        <p className="footer-copy">ByteClave · An open catalog for digital resources.</p>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/explore">Explore</Link>
          <Link href="/search">Search</Link>
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
