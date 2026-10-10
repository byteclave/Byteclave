import {
  bigint,
  index,
  jsonb,
  pgTable,
  timestamp,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./common";
import {
  inspectionObservationResultEnum,
  inspectionRunStatusEnum,
} from "./enums";
import { discoveries } from "./discoveries";
import { users } from "./users";

export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discoveryId: uuid("discovery_id").references(() => discoveries.id, {
      onDelete: "set null",
    }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    altText: text("alt_text"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("media_discovery_created_idx").on(table.discoveryId, table.createdAt),
  ],
);

export const inspectionRuns = pgTable(
  "inspection_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discoveryId: uuid("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    status: inspectionRunStatusEnum("status").notNull().default("queued"),
    inspector: text("inspector").notNull(),
    inspectorVersion: text("inspector_version"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inspection_runs_discovery_created_idx").on(
      table.discoveryId,
      table.createdAt,
    ),
  ],
);

export const inspectionObservations = pgTable(
  "inspection_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inspectionRunId: uuid("inspection_run_id")
      .notNull()
      .references(() => inspectionRuns.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    result: inspectionObservationResultEnum("result").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    index("inspection_observations_run_created_idx").on(
      table.inspectionRunId,
      table.createdAt,
    ),
  ],
);
