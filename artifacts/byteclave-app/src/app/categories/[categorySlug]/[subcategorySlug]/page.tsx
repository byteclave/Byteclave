import { PageIntro, PlaceholderPanel } from "../../../../components/site-shell";

export default async function SubcategoryPage({ params }: { params: Promise<{ categorySlug: string; subcategorySlug: string }> }) {
  const { categorySlug, subcategorySlug } = await params;
  return <div className="container">
    <PageIntro eyebrow="Subcategory" title="Subcategory overview" description="This route is reserved for a subcategory within the catalog." context={["categories", categorySlug, subcategorySlug]} />
    <PlaceholderPanel>Subcategory information and its resources will be shown here when catalog content is available.</PlaceholderPanel>
  </div>;
}
