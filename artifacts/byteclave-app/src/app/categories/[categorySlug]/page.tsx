import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscoveryList } from "../../../components/discovery-list";
import { ExportOptions } from "../../../components/export-options";
import { PageIntro } from "../../../components/site-shell";
import { getCategoryPageData } from "../../../server/catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ categorySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const data = await getCategoryPageData(categorySlug);
  return {
    title: data?.category.name ?? "Category not found",
    description:
      data?.category.description ??
      `Browse published digital resources in ${data?.category.name ?? "this category"} on ByteClave.`,
    openGraph: { title: data?.category.name ?? "Category not found" },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { categorySlug } = await params;
  const data = await getCategoryPageData(categorySlug);
  if (!data) notFound();

  return (
    <div className="container">
      <PageIntro
        eyebrow="Category"
        title={data.category.name}
        description={
          data.category.description ??
          (data.subcategories.length > 0
            ? "Choose a subcategory or browse resources placed directly in this category."
            : "Browse the published resources in this category.")
        }
        context={["categories", data.category.slug]}
      />
      {data.subcategories.length > 0 && (
        <section className="taxonomy-section" aria-labelledby="subcategories-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Browse within</p>
              <h2 id="subcategories-heading">Subcategories</h2>
            </div>
          </div>
          <ul className="taxonomy-list">
            {data.subcategories.map((subcategory) => (
              <li key={subcategory.id}>
                <Link href={`/categories/${data.category.slug}/${subcategory.slug}`}>
                  {subcategory.name}<span aria-hidden="true"> →</span>
                </Link>
                {subcategory.description && <p>{subcategory.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="listing-section" aria-labelledby="category-resources-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Published resources</p>
            <h2 id="category-resources-heading">
              {data.subcategories.length > 0 ? "Placed in this category" : "Resources"}
            </h2>
          </div>
          <ExportOptions />
        </div>
        <DiscoveryList
          discoveries={data.discoveries}
          emptyMessage={
            data.subcategories.length > 0
              ? "No resources are placed directly in this category. Browse a subcategory above."
              : "No published resources are listed in this category yet."
          }
        />
      </section>
    </div>
  );
}
