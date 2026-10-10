import Link from "next/link";
import { PageIntro } from "../../components/site-shell";
import { getExploreCatalog } from "../../server/catalog";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const catalog = await getExploreCatalog();

  return (
    <div className="container">
      <PageIntro
        eyebrow="Catalog gateway"
        title="Explore"
        description="Browse the catalog structure and curated groups. Public Discovery listings appear here as they are intentionally published."
      />
      <p className="catalog-count">
        {catalog.publishedDiscoveryCount} published{" "}
        {catalog.publishedDiscoveryCount === 1 ? "Discovery" : "Discoveries"}
      </p>
      <div className="catalog-groups">
        <section className="catalog-group" aria-labelledby="categories-heading">
          <h2 id="categories-heading">Categories</h2>
          {catalog.categories.length > 0 ? (
            <ul className="catalog-list">
              {catalog.categories.map((category) => (
                <li key={category.id}>
                  <Link href={`/categories/${category.slug}`}>
                    {category.name}
                  </Link>
                  {category.subcategories.length > 0 && (
                    <ul className="catalog-list">
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

        <section className="catalog-group" aria-labelledby="collections-heading">
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
