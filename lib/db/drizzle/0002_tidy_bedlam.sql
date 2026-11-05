ALTER TABLE "collections" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "normalized_name" text;--> statement-breakpoint
UPDATE "tags"
SET "normalized_name" = lower(regexp_replace(btrim(normalize("name", NFKC)), '[[:space:]]+', ' ', 'g'));--> statement-breakpoint
WITH ranked_tags AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "normalized_name" ORDER BY "id") AS "keep_id"
  FROM "tags"
), duplicate_tags AS (
  SELECT "id", "keep_id"
  FROM ranked_tags
  WHERE "id" <> "keep_id"
)
INSERT INTO "discovery_tags" ("discovery_id", "tag_id")
SELECT links."discovery_id", duplicates."keep_id"
FROM "discovery_tags" AS links
INNER JOIN duplicate_tags AS duplicates ON duplicates."id" = links."tag_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
WITH ranked_tags AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "normalized_name" ORDER BY "id") AS "keep_id"
  FROM "tags"
)
DELETE FROM "discovery_tags" AS links
USING ranked_tags
WHERE links."tag_id" = ranked_tags."id"
  AND ranked_tags."id" <> ranked_tags."keep_id";--> statement-breakpoint
WITH ranked_tags AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "normalized_name" ORDER BY "id") AS "keep_id"
  FROM "tags"
)
DELETE FROM "tags" AS duplicate
USING ranked_tags
WHERE duplicate."id" = ranked_tags."id"
  AND ranked_tags."id" <> ranked_tags."keep_id";--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "normalized_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "is_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "is_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_normalized_name_uidx" ON "tags" USING btree ("normalized_name");