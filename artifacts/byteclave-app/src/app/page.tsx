import { BrandMotion } from "../components/brand-motion";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">An open catalog for digital resources</p>
          <h1 id="home-title">Discover resources.<br />Understand <em>what’s behind them.</em></h1>
          <p className="lead">Find trustworthy digital tools with useful context about what they are and how they work.</p>
          <div className="hero-actions">
            <Link className="button-link primary" href="/explore">Explore <span className="arrow" aria-hidden="true">→</span></Link>
            <Link className="button-link" href="/self-host">Self-host</Link>
          </div>
          <p className="search-access">Looking for something specific? <Link href="/search">Search the catalog</Link></p>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <BrandMotion mode="INTRO" label="ByteClave logo" />
        </div>
      </section>
    </div>
  );
}
