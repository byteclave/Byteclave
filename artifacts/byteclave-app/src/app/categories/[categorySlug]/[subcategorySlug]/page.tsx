import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryList } from "../../../../components/discovery-list";
import { ExportOptions } from "../../../../components/export-options";
import { PageIntro } from "../../../../components/site-shell";
import { getSubcategoryPageData } from "../../../../server/catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ categorySlug: string; subcategorySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = await params;
  const data = await getSubcategoryPageData(categorySlug, subcategorySlug);
  return {
    title: data?.subcategory.name ?? "Subcategory not found",
    description:
      data?.subcategory.description ??
      `Browse published ${data?.subcategory.name ?? "subcategory"} resources on ByteClave.`,
    openGraph: { title: data?.subcategory.name ?? "Subcategory not found" },
  };
}

export default async function SubcategoryPage({ params }: Props) {
  const { categorySlug, subcategorySlug } = await params;
  const data = await getSubcategoryPageData(categorySlug, subcategorySlug);
  if (!data) notFound();

  return (
    <div className="container subcategory-page">
      <PageIntro
        eyebrow={data.category.name}
        title={data.subcategory.name}
        description={
          data.subcategory.description ??
          `Published digital resources placed in ${data.subcategory.name}.`
        }
        context={["categories", data.category.slug, data.subcategory.slug]}
      />
      <section className="listing-section" aria-labelledby="subcategory-resources-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Published resources</p>
            <h2 id="subcategory-resources-heading">Resources</h2>
          </div>
          <ExportOptions />
        </div>
        <DiscoveryList discoveries={data.discoveries} />
      </section>
    </div>
  );
}
