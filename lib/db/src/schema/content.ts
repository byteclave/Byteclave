import { index, integer, jsonb, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { discoveries } from "./discoveries";
import { users } from "./users";

export const contentVersions = pgTable(
  "content_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discoveryId: uuid("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    unique("content_versions_discovery_version_unique").on(
      table.discoveryId,
      table.version,
    ),
    index("content_versions_created_idx").on(table.discoveryId, table.createdAt),
  ],
);
