import { PageIntro, PlaceholderPanel } from "../../../components/site-shell";

export default async function CategoryPage({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;
  return <div className="container">
    <PageIntro eyebrow="Category" title="Category overview" description="This route is reserved for a category in the ByteClave catalog." context={["categories", categorySlug]} />
    <PlaceholderPanel>Category information and its resources will be shown here when catalog content is available.</PlaceholderPanel>
  </div>;
}
