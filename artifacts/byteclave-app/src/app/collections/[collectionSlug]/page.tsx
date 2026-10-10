import { PageIntro, PlaceholderPanel } from "../../../components/site-shell";

export default async function CollectionPage({ params }: { params: Promise<{ collectionSlug: string }> }) {
  const { collectionSlug } = await params;
  return <div className="container">
    <PageIntro eyebrow="Collection" title="Collection overview" description="This route is reserved for a curated collection in the ByteClave catalog." context={["collections", collectionSlug]} />
    <PlaceholderPanel>Collection details and included resources will be shown here when catalog content is available.</PlaceholderPanel>
  </div>;
}
