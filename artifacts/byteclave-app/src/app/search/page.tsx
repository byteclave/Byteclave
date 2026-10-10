import { PageIntro, PlaceholderPanel } from "../../components/site-shell";

export default function SearchPage() {
  return <div className="container">
    <PageIntro eyebrow="Find a resource" title="Search" description="Search will help you find resources across the ByteClave catalog." />
    <form className="search-form" action="/search" method="get" role="search">
      <label className="sr-only" htmlFor="catalog-query">Search the catalog</label>
      <input id="catalog-query" name="q" type="search" placeholder="Search the catalog" autoComplete="off" />
      <button className="button-link primary" type="submit">Search <span className="arrow" aria-hidden="true">→</span></button>
    </form>
    <div style={{ marginTop: 32 }}><PlaceholderPanel title="Search results are not connected yet">The search field is a route-ready foundation. It does not submit to a backend or display fabricated results.</PlaceholderPanel></div>
  </div>;
}
