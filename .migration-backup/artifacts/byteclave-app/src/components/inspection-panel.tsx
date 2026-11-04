import { BrandMotion } from "./brand-motion";
import type { InspectionDetails } from "@workspace/db";

export function InspectionPanel({
  inspection,
}: {
  inspection: InspectionDetails | null;
}) {
  const active =
    inspection?.status === "queued" || inspection?.status === "running";

  return (
    <section className="inspection-panel" id="inspection" aria-labelledby="inspection-heading">
      <div className="inspection-visual" aria-hidden="true">
        <BrandMotion
          mode={active ? "LOADING" : "INSPECTION"}
          label="ByteClave inspection mark"
          className="inspection-mark"
        />
      </div>
      <div className="inspection-content">
        <p className="eyebrow">Resource inspection</p>
        <h2 id="inspection-heading">Inspection</h2>
        {!inspection ? (
          <p className="supporting-copy">
            No inspection data is available for this resource yet. ByteClave
            does not invent technical findings.
          </p>
        ) : (
          <>
            <p className="supporting-copy">
              Latest run: <strong>{inspection.status}</strong>
              {inspection.inspectorVersion
                ? ` · ${inspection.inspector} ${inspection.inspectorVersion}`
                : ` · ${inspection.inspector}`}
            </p>
            {inspection.observations.length > 0 ? (
              <ul className="observation-list">
                {inspection.observations.map((observation) => (
                  <li key={`${observation.code}-${observation.summary}`}>
                    <span className="observation-result">{observation.result}</span>
                    <span>
                      <strong>{observation.code}</strong>
                      <span className="observation-summary">{observation.summary}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="supporting-copy">
                This inspection has no recorded observations.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
