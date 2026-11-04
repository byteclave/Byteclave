import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "../../components/site-shell";
import { getExploreCatalog } from "../../server/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Explore",
  description: "Browse ByteClave categories, subcategories, curated collections, and published digital resources.",
  openGraph: { title: "Explore ByteClave" },
};

export default async function ExplorePage() {
  const catalog = await getExploreCatalog();

  return (
    <div className="container">
      <PageIntro
        eyebrow="Catalog gateway"
        title="Explore"
        description="Browse categories and curated collections. Every resource shown in public listings is intentionally published."
      />
      <div className="explore-toolbar">
        <p className="catalog-count">
          <strong>{catalog.publishedDiscoveryCount}</strong> published{" "}
          {catalog.publishedDiscoveryCount === 1 ? "Discovery" : "Discoveries"}
        </p>
        <Link className="button-link" href="/search">
          Search the catalog <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="catalog-groups">
        <section id="categories" className="catalog-group" aria-labelledby="categories-heading">
          <h2 id="categories-heading">Categories</h2>
          {catalog.categories.length > 0 ? (
            <ul className="catalog-list">
              {catalog.categories.map((category) => (
                <li key={category.id}>
                  <Link className="category-link" href={`/categories/${category.slug}`}>
                    {category.name}
                  </Link>
                  {category.subcategories.length > 0 && (
                    <ul className="subcategory-list">
                      {category.subcategories.map((subcategory) => (
                        <li key={subcategory.slug}>
                          <Link
                            href={`/categories/${category.slug}/${subcategory.slug}`}
                          >
                            {subcategory.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="catalog-empty">
              No categories have been added yet.
            </p>
          )}
        </section>

        <section id="collections" className="catalog-group" aria-labelledby="collections-heading">
          <h2 id="collections-heading">Curated collections</h2>
          {catalog.collections.length > 0 ? (
            <ul className="catalog-list">
              {catalog.collections.map((collection) => (
                <li key={collection.slug}>
                  <Link href={`/collections/${collection.slug}`}>
                    {collection.name}
                  </Link>
                  {collection.description && (
                    <p className="catalog-empty">{collection.description}</p>
                  )}
                  <span className="catalog-item-count">
                    {collection.publishedDiscoveryCount} published{" "}
                    {collection.publishedDiscoveryCount === 1 ? "resource" : "resources"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="catalog-empty">
              No curated collections have been added yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
