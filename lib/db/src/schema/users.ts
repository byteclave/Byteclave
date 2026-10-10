import {
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "./common";
import { roleCodeEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_email_lower_uidx").on(sql`lower(${table.email})`),
    index("users_display_name_idx").on(table.displayName),
  ],
);

export const roles = pgTable("roles", {
  code: roleCodeEnum("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps(),
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
  ...timestamps(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleCode: roleCodeEnum("role_code")
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleCode] }),
    index("user_roles_role_code_idx").on(table.roleCode),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleCode: roleCodeEnum("role_code")
      .notNull()
      .references(() => roles.code, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
    createdAt: timestamps().createdAt,
  },
  (table) => [primaryKey({ columns: [table.roleCode, table.permissionKey] })],
);
