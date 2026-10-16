import { PageIntro } from "../../components/site-shell";

export const metadata = {
  title: "Self-host ByteClave",
  description: "Information about running an independent ByteClave deployment on infrastructure you control.",
  openGraph: { title: "Self-host ByteClave" },
};

export default function SelfHostPage() {
  return (
    <div className="container">
      <PageIntro
        eyebrow="Project information"
        title="Self-host ByteClave"
        description="Run an independent ByteClave instance on infrastructure you control, with its own application and PostgreSQL database."
      />
      <section className="self-host-content" aria-labelledby="self-host-independence">
        <p className="eyebrow">Independent by design</p>
        <h2 id="self-host-independence">Your instance, your infrastructure.</h2>
        <p>
          A self-hosted ByteClave deployment is separate from the official hosted
          instance. It uses its own database and does not need to connect to the
          hosted service to serve its own catalog.
        </p>
        <p>
          The application is built around open-source components and PostgreSQL.
          This page does not publish a repository link or installation procedure;
          use the project’s verified setup documentation when it is available.
        </p>
      </section>
    </div>
  );
}
