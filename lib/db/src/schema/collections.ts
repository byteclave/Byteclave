import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { discoveries } from "./discoveries";

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (table) => [index("collections_name_idx").on(table.name)],
);

export const collectionDiscoveries = pgTable(
  "collection_discoveries",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    discoveryId: uuid("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.discoveryId] }),
    uniqueIndex("collection_discoveries_position_uidx").on(
      table.collectionId,
      table.sortOrder,
    ),
    index("collection_discoveries_discovery_idx").on(table.discoveryId),
  ],
);
