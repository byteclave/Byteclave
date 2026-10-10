import { BrandMotion } from "../components/brand-motion";
import { PlaceholderPanel } from "../components/site-shell";

export default function HomePage() {
  return (
    <div className="container">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">An open directory for the digital world</p>
          <h1 id="home-title">Know what you’re <em>choosing.</em></h1>
          <p className="lead">ByteClave is a catalog of digital resources, built to help people discover trustworthy tools and understand what they do.</p>
          <div className="hero-actions">
            <a className="button-link primary" href="/explore">Explore the catalog <span className="arrow" aria-hidden="true">→</span></a>
            <a className="button-link" href="/self-host">About self-hosting</a>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <BrandMotion mode="INTRO" label="ByteClave logo" />
        </div>
      </section>
      <hr className="rule" />
      <section className="section" aria-labelledby="principles-title">
        <div className="section-heading">
          <div><p className="eyebrow">The foundation</p><h2 id="principles-title">Useful context, not noise.</h2></div>
          <p className="section-note">A clear starting point for exploring software, services, and other resources—without pretending every listing is already here.</p>
        </div>
        <div className="principles">
          <article className="principle"><p className="principle-index">01 / DISCOVER</p><h3>Find a way in</h3><p>Browse the catalog through a simple, understandable structure.</p></article>
          <article className="principle"><p className="principle-index">02 / UNDERSTAND</p><h3>Know what it does</h3><p>Make room for useful descriptions that explain a resource in plain language.</p></article>
          <article className="principle"><p className="principle-index">03 / EVALUATE</p><h3>Choose with context</h3><p>Trustworthy discovery starts with clarity about what is known and what is not.</p></article>
        </div>
      </section>
      <section className="section" aria-label="Catalog gateway">
        <div className="gateway">
          <div><p className="eyebrow">Start here</p><h2>Explore ByteClave</h2><p>The catalog gateway is ready for the next phase of content.</p></div>
          <a className="button-link" href="/explore">Go to Explore <span className="arrow" aria-hidden="true">→</span></a>
        </div>
      </section>
      <PlaceholderPanel title="A foundation, not a finished directory">
        This first phase establishes the routes and shared interface. Explore reads categories and curated collections directly from PostgreSQL; public Discovery listings appear when they are intentionally published.
      </PlaceholderPanel>
    </div>
  );
}
