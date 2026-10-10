import { PageIntro, PlaceholderPanel } from "../../../components/site-shell";

export default async function DiscoveryPage({ params }: { params: Promise<{ discoverySlug: string }> }) {
  const { discoverySlug } = await params;
  return <div className="container">
    <PageIntro eyebrow="Discovery" title="Resource overview" description="This route is reserved for an individual digital resource." context={["discoveries", discoverySlug]} />
    <PlaceholderPanel>Resource details and explanatory context will be shown here when catalog content is available.</PlaceholderPanel>
  </div>;
}
