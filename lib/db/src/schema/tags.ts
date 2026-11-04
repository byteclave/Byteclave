import {
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { discoveries } from "./discoveries";

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  ...timestamps(),
}, (table) => [
  uniqueIndex("tags_normalized_name_uidx").on(table.normalizedName),
]);

export const discoveryTags = pgTable(
  "discovery_tags",
  {
    discoveryId: uuid("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.discoveryId, table.tagId] }),
    index("discovery_tags_tag_idx").on(table.tagId),
  ],
);
