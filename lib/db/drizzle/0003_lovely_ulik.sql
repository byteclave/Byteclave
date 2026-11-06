CREATE TABLE "entity_content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source_version_id" uuid,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_content_versions_entity_type_check" CHECK ("entity_content_versions"."entity_type" IN ('discovery', 'category', 'subcategory', 'tag', 'collection')),
	CONSTRAINT "entity_content_versions_action_check" CHECK ("entity_content_versions"."action" IN ('created', 'updated', 'deleted', 'restored'))
);
--> statement-breakpoint
ALTER TABLE "entity_content_versions" ADD CONSTRAINT "entity_content_versions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_content_versions_entity_created_idx" ON "entity_content_versions" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "entity_content_versions_actor_created_idx" ON "entity_content_versions" USING btree ("actor_user_id","created_at");