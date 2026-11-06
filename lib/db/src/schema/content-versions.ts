import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { timestamps } from "./common";

export const entityContentVersions = pgTable(
  "entity_content_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    sourceVersionId: uuid("source_version_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    check(
      "entity_content_versions_entity_type_check",
      sql`${table.entityType} IN ('discovery', 'category', 'subcategory', 'tag', 'collection')`,
    ),
    check(
      "entity_content_versions_action_check",
      sql`${table.action} IN ('created', 'updated', 'deleted', 'restored')`,
    ),
    index("entity_content_versions_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("entity_content_versions_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);
