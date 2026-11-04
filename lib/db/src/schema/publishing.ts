import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { publishingStatusEnum } from "./enums";
import { discoveries } from "./discoveries";
import { users } from "./users";

export const publishingRecords = pgTable(
  "publishing_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discoveryId: uuid("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    fromStatus: publishingStatusEnum("from_status"),
    toStatus: publishingStatusEnum("to_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    index("publishing_records_discovery_created_idx").on(
      table.discoveryId,
      table.createdAt,
    ),
    index("publishing_records_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);
