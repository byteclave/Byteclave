import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    changes: jsonb("changes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    index("audit_logs_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
  ],
);
