import type { Metadata } from "next";
import "./globals.css";
import { SiteShell } from "../components/site-shell";

export const metadata: Metadata = {
  title: { default: "ByteClave — open catalog of digital resources", template: "%s · ByteClave" },
  description: "An open catalog that helps people discover trustworthy digital resources and understand what they do.",
  icons: { icon: "/byteclave-logo.svg" },
  openGraph: {
    type: "website",
    siteName: "ByteClave",
    title: "ByteClave — open catalog of digital resources",
    description: "An open catalog that helps people discover trustworthy digital resources and understand what they do.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
