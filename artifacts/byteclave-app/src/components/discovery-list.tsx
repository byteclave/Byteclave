import Link from "next/link";
import type { PublishedDiscovery } from "@workspace/db";

export function DiscoveryList({
  discoveries,
  emptyMessage = "No published Discoveries are listed here yet.",
}: {
  discoveries: PublishedDiscovery[];
  emptyMessage?: string;
}) {
  if (discoveries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <ul className="discovery-list">
      {discoveries.map((discovery) => (
        <li className="discovery-row" key={discovery.id}>
          <article aria-labelledby={`discovery-${discovery.id}`}>
            <div className="discovery-heading">
              <h2 id={`discovery-${discovery.id}`}>
                <Link href={`/discoveries/${discovery.slug}`}>{discovery.title}</Link>
              </h2>
              <a
                className="discovery-url"
                href={discovery.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {discovery.url}
              </a>
            </div>
            <p className="discovery-description">
              <span aria-hidden="true">— </span>
              {discovery.summary ??
                discovery.description ??
                "No description has been provided for this resource."}
            </p>
            <div className="discovery-actions">
              <a
                className="text-action"
                href={discovery.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open <span aria-hidden="true">↗</span>
              </a>
              <Link
                className="text-action inspect-action"
                href={`/discoveries/${discovery.slug}#inspection`}
              >
                Inspect <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
