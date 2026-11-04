"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RoleCode } from "@workspace/domain";
import { BrandMotion } from "./brand-motion";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "discoveries", label: "Discoveries" },
  { id: "taxonomy", label: "Categories and Subcategories" },
  { id: "tags", label: "Tags" },
  { id: "collections", label: "Collections" },
  { id: "media", label: "Media" },
  { id: "publishing", label: "Publishing" },
  { id: "versions", label: "Version History" },
  { id: "users", label: "Users and Roles" },
  { id: "audit", label: "Audit Logs" },
  { id: "appearance", label: "Appearance" },
  { id: "settings", label: "Settings" },
] as const;

export type AdminSection = (typeof sections)[number]["id"];

export function AdminDashboardNav({
  activeSection,
  role,
}: {
  activeSection: AdminSection;
  role: RoleCode;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    navRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !navRef.current) return;
      const focusable = Array.from(navRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        className="admin-mobile-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="admin-sidebar"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">☰</span> Admin menu
      </button>
      {open && <button className="admin-sidebar-scrim" type="button" aria-label="Close admin menu" onClick={() => setOpen(false)} />}
      <aside id="admin-sidebar" className={`admin-sidebar${open ? " is-open" : ""}`} aria-label="Administration navigation">
        <div className="admin-brand">
          <Link href="/admin" aria-label="ByteClave administration overview">
            <BrandMotion mode="MINIMAL" label="ByteClave logo" />
            <span>byte<span>clave</span></span>
          </Link>
          <p>Administration</p>
        </div>
        <nav ref={navRef} aria-label="Admin sections">
          {sections.map((section, index) => (
            <Link
              key={section.id}
              href={section.id === "overview" ? "/admin" : `/admin?section=${section.id}`}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span className="admin-nav-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{section.label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <span className={`admin-role-indicator role-${role.toLowerCase()}`}>{role}</span>
          <Link href="/">View public site <span aria-hidden="true">↗</span></Link>
        </div>
      </aside>
    </>
  );
}
