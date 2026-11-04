import { Link } from 'wouter';

export default function NotFound() {
  return <section className="error-state container"><p className="eyebrow">404 / Not found</p><h1>This page isn’t in the catalog.</h1><p>That address may have moved, or the resource may no longer be published.</p><div className="error-actions"><Link className="button-link primary" href="/explore">Explore the catalog</Link><Link className="button-link" href="/">Return home</Link></div></section>;
}
