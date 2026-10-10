import { PageIntro } from "../../components/site-shell";

export default function SelfHostPage() {
  return (
    <div className="container">
      <PageIntro
        eyebrow="Project information"
        title="Self-host ByteClave"
        description="The application and its PostgreSQL database can run on infrastructure you control. No paid proprietary service is required."
      />
      <section className="placeholder-panel" aria-labelledby="self-host-steps">
        <span className="placeholder-label">Quick start</span>
        <h2 id="self-host-steps">Run with Docker Compose</h2>
        <ol>
          <li>Copy <code>.env.example</code> to <code>.env</code> and set the owner email if needed.</li>
          <li>Start PostgreSQL with <code>docker compose up -d postgres</code>.</li>
          <li>Apply the schema and development catalog: <code>docker compose --profile setup run --rm migrate-seed</code>.</li>
          <li>Start ByteClave with <code>docker compose up --build -d app</code>.</li>
        </ol>
        <p>
          The development seed is idempotent. It creates sample catalog records, not
          accounts, passwords, or inspection results. For environment variables,
          migration options, and local development, see the project README.
        </p>
      </section>
    </div>
  );
}
