import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { publishingStatusEnum } from "./enums";
import { users } from "./users";
import { categories, subcategories } from "./taxonomy";

export const discoveries = pgTable(
  "discoveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary"),
    description: text("description"),
    url: text("url").notNull(),
    normalizedUrl: text("normalized_url").notNull().unique(),
    status: publishingStatusEnum("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("discoveries_status_created_idx").on(table.status, table.createdAt),
    index("discoveries_title_idx").on(table.title),
  ],
);

export const discoveryPlacements = pgTable(
  "discovery_placements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discoveryId: uuid("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    subcategoryId: uuid("subcategory_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.subcategoryId, table.categoryId],
      foreignColumns: [subcategories.id, subcategories.categoryId],
      name: "discovery_placements_subcategory_category_fk",
    }).onDelete("cascade"),
    uniqueIndex("discovery_placements_category_root_uidx")
      .on(table.discoveryId, table.categoryId)
      .where(sql`${table.subcategoryId} IS NULL`),
    uniqueIndex("discovery_placements_subcategory_uidx")
      .on(table.discoveryId, table.subcategoryId)
      .where(sql`${table.subcategoryId} IS NOT NULL`),
    index("discovery_placements_category_idx").on(
      table.categoryId,
      table.sortOrder,
    ),
    index("discovery_placements_subcategory_idx").on(
      table.subcategoryId,
      table.sortOrder,
    ),
  ],
);
