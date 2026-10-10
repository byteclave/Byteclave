import { PageIntro, PlaceholderPanel } from "../../components/site-shell";

export default function AdminPage() {
  return <div className="container">
    <PageIntro eyebrow="Project roadmap" title="Admin" description="An administrative area is planned for a later phase of ByteClave." />
    <PlaceholderPanel admin title="Admin is a later-phase placeholder">There is no admin interface, sign-in flow, or management functionality in this foundation phase.</PlaceholderPanel>
  </div>;
}
