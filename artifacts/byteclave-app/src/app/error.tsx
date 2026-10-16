"use client";

import Link from "next/link";

export default function PublicError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="container error-state" aria-labelledby="error-title">
      <p className="eyebrow">Unable to load this page</p>
      <h1 id="error-title">Catalog temporarily unavailable</h1>
      <p>
        The page could not retrieve its data. Please try again; no placeholder
        catalog results are being shown.
      </p>
      <div className="error-actions">
        <button className="button-link primary" type="button" onClick={() => reset()}>
          Try again
        </button>
        <Link className="button-link" href="/">Return home</Link>
      </div>
    </section>
  );
}
