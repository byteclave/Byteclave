import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryList } from "../../../components/discovery-list";
import { ExportOptions } from "../../../components/export-options";
import { PageIntro } from "../../../components/site-shell";
import { getCollectionPageData } from "../../../server/catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ collectionSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collectionSlug } = await params;
  const data = await getCollectionPageData(collectionSlug);
  return {
    title: data?.collection.name ?? "Collection not found",
    description:
      data?.collection.description ??
      `Explore published resources in ${data?.collection.name ?? "this ByteClave collection"}.`,
    openGraph: { title: data?.collection.name ?? "Collection not found" },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { collectionSlug } = await params;
  const data = await getCollectionPageData(collectionSlug);
  if (!data) notFound();

  return (
    <div className="container">
      <PageIntro
        eyebrow="Curated collection"
        title={data.collection.name}
        description={data.collection.description ?? "A curated group of digital resources."}
        context={["collections", data.collection.slug]}
      />
      <section className="listing-section" aria-labelledby="collection-resources-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated resources</p>
            <h2 id="collection-resources-heading">In this collection</h2>
          </div>
          <ExportOptions />
        </div>
        <DiscoveryList
          discoveries={data.discoveries}
          emptyMessage="This collection has no published resources yet."
        />
      </section>
    </div>
  );
}
