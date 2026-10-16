import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InspectionPanel } from "../../../components/inspection-panel";
import { PageIntro } from "../../../components/site-shell";
import { getDiscoveryPageData } from "../../../server/catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ discoverySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { discoverySlug } = await params;
  const data = await getDiscoveryPageData(discoverySlug);
  return {
    title: data?.discovery.title ?? "Discovery not found",
    description:
      data?.discovery.summary ??
      data?.discovery.description ??
      "A published digital resource in the ByteClave catalog.",
    openGraph: {
      title: data?.discovery.title ?? "Discovery not found",
      description: data?.discovery.summary ?? undefined,
    },
  };
}

export default async function DiscoveryPage({ params }: Props) {
  const { discoverySlug } = await params;
  const data = await getDiscoveryPageData(discoverySlug);
  if (!data) notFound();
  const { discovery } = data;

  return (
    <div className="container">
      <PageIntro
        eyebrow="Published Discovery"
        title={discovery.title}
        description={discovery.summary ?? "A digital resource in the ByteClave catalog."}
        context={["discoveries", discovery.slug]}
      />
      <article className="discovery-detail">
        <div className="detail-primary">
          <p className="eyebrow">Official resource</p>
          <a className="discovery-url detail-url" href={discovery.url} target="_blank" rel="noopener noreferrer">
            {discovery.url}
          </a>
          <a className="button-link primary open-resource" href={discovery.url} target="_blank" rel="noopener noreferrer">
            Open resource <span aria-hidden="true">↗</span>
          </a>
          {discovery.description && discovery.description !== discovery.summary && (
            <div className="long-description">
              <h2>About this resource</h2>
              <p>{discovery.description}</p>
            </div>
          )}
          <div className="detail-taxonomy">
            <h2>Catalog placement</h2>
            {discovery.placements.length > 0 ? (
              <ul>
                {discovery.placements.map((placement) => (
                  <li key={`${placement.categorySlug}/${placement.subcategorySlug ?? "root"}`}>
                    <Link href={`/categories/${placement.categorySlug}`}>
                      {placement.categoryName}
                    </Link>
                    {placement.subcategorySlug && placement.subcategoryName && (
                      <>
                        <span aria-hidden="true"> / </span>
                        <Link
                          className="subcategory-placement-link"
                          href={`/categories/${placement.categorySlug}/${placement.subcategorySlug}`}
                        >
                          {placement.subcategoryName}
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="supporting-copy">No category placement is recorded.</p>
            )}
          </div>
          {discovery.tags.length > 0 && (
            <div className="tag-list" aria-label="Resource tags">
              {discovery.tags.map((tag) => <span key={tag.slug}>{tag.name}</span>)}
            </div>
          )}
        </div>
      </article>
      <InspectionPanel inspection={data.inspection} />
    </div>
  );
}
