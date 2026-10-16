import type { Metadata } from "next";
import { DiscoveryList } from "../../components/discovery-list";
import { PageIntro } from "../../components/site-shell";
import { searchPublishedDiscoveries } from "../../server/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Search",
  description: "Search published ByteClave resources by name, URL, description, category, subcategory, tag, or collection.",
  openGraph: { title: "Search ByteClave" },
};

type Props = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const results = query ? await searchPublishedDiscoveries(query) : [];

  return (
    <div className="container">
      <PageIntro
        eyebrow="Find a resource"
        title="Search"
        description="Search published resources by name, URL, description, category, subcategory, tag, or collection."
      />
      <form className="search-form" action="/search" method="get" role="search">
        <label className="sr-only" htmlFor="catalog-query">Search the catalog</label>
        <input
          id="catalog-query"
          name="q"
          type="search"
          placeholder="Name, URL, category, tag…"
          autoComplete="off"
          defaultValue={query}
        />
        <button className="button-link primary" type="submit">
          Search <span className="arrow" aria-hidden="true">→</span>
        </button>
      </form>
      <section className="search-results" aria-live="polite" aria-labelledby="search-results-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{query ? "Search results" : "Published catalog"}</p>
            <h2 id="search-results-heading">
              {!query
                ? "Find a resource"
                : `${results.length} ${results.length === 1 ? "result" : "results"}`}
            </h2>
          </div>
        </div>
        {!query ? (
          <p className="empty-state">Enter a search term to find published resources.</p>
        ) : (
          <DiscoveryList
            discoveries={results}
            emptyMessage={`No published resources matched “${query}”. Try a name, URL, category, or tag.`}
          />
        )}
      </section>
    </div>
  );
}
