import type { listAdminAuditEvents } from "@workspace/db";

type AuditEvent = Omit<Awaited<ReturnType<typeof listAdminAuditEvents>>[number], "createdAt"> & {
  createdAt: string | Date;
};

export function AdminAuditTable({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="admin-empty">No administrative events are recorded yet.</p>;
  return (
    <div className="admin-table-scroll">
      <table className="admin-table admin-audit-table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Actor</th>
            <th scope="col">Affected record</th>
            <th scope="col">When</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td><strong>{event.action}</strong></td>
              <td>{event.actorEmail ?? "System recovery"}</td>
              <td>{event.entityType} · <code>{event.entityId.slice(0, 8)}</code></td>
              <td>{new Date(typeof event.createdAt === "string" ? event.createdAt : event.createdAt.toISOString()).toLocaleString()}</td>
              <td><code>{JSON.stringify(event.changes)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
