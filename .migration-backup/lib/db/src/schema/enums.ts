import { pgEnum } from "drizzle-orm/pg-core";

export const roleCodeEnum = pgEnum("role_code", ["OWNER", "ADMIN", "EDITOR"]);
export const publishingStatusEnum = pgEnum("publishing_status", [
  "draft",
  "review",
  "published",
  "archived",
]);
export const inspectionRunStatusEnum = pgEnum("inspection_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const inspectionObservationResultEnum = pgEnum(
  "inspection_observation_result",
  ["pass", "warning", "fail", "not_applicable"],
);
