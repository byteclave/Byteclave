import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import { users } from "./users";

export const applicationSettings = pgTable(
  "application_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [index("application_settings_updated_idx").on(table.updatedAt)],
);
