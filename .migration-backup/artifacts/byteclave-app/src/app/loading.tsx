import { BrandMotion } from "../components/brand-motion";

export default function Loading() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <BrandMotion mode="LOADING" label="Loading ByteClave content" />
      <p>Loading catalog content…</p>
    </div>
  );
}
