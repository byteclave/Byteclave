CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role_code" "role_code" NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invitations_no_owner_check" CHECK ("admin_invitations"."role_code" IN ('ADMIN', 'EDITOR'))
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"bucket_hash" text PRIMARY KEY NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invitations_token_hash_uidx" ON "admin_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_invitations_email_expires_idx" ON "admin_invitations" USING btree ("email","expires_at");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_locked_idx" ON "auth_rate_limits" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uidx" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_expires_idx" ON "auth_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_uidx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_expires_idx" ON "password_reset_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_uidx" ON "user_roles" USING btree ("user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION byteclave_guard_user_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id text;
  v_actor_id text := nullif(current_setting('app.actor_user_id', true), '');
  v_bootstrap boolean := coalesce(current_setting('app.owner_bootstrap', true), '') = 'true';
  v_actor_owner boolean := false;
  v_actor_admin boolean := false;
  v_role text;
BEGIN
  PERFORM pg_advisory_xact_lock(1970423611);
  SELECT value #>> '{}' INTO v_owner_id
  FROM public.application_settings
  WHERE key = 'security.ownerUserId';

  IF v_actor_id IS NOT NULL THEN
    SELECT
      coalesce(bool_or(role_code::text = 'OWNER'), false),
      coalesce(bool_or(role_code::text = 'ADMIN'), false)
    INTO v_actor_owner, v_actor_admin
    FROM public.user_roles
    WHERE user_id::text = v_actor_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_role := NEW.role_code::text;
    IF v_role = 'OWNER' THEN
      IF NOT v_bootstrap OR (v_owner_id IS NOT NULL AND v_owner_id <> NEW.user_id::text) THEN
        RAISE EXCEPTION 'Owner role can only be assigned by secure initial provisioning.'
          USING ERRCODE = '42501';
      END IF;
      IF EXISTS (SELECT 1 FROM public.user_roles WHERE role_code::text = 'OWNER') THEN
        RAISE EXCEPTION 'An Owner is already assigned.'
          USING ERRCODE = '42501';
      END IF;
    ELSIF v_role = 'ADMIN' AND NOT (v_bootstrap OR v_actor_owner) THEN
      RAISE EXCEPTION 'Only the Owner can assign Admin access.'
        USING ERRCODE = '42501';
    ELSIF v_role = 'EDITOR' AND NOT (v_bootstrap OR v_actor_owner OR v_actor_admin) THEN
      RAISE EXCEPTION 'Only an authorized administrator can assign Editor access.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_role := OLD.role_code::text;
    IF v_role = 'OWNER' THEN
      RAISE EXCEPTION 'The provisioned Owner role cannot be removed.'
        USING ERRCODE = '42501';
    ELSIF v_role = 'ADMIN' AND NOT (v_bootstrap OR v_actor_owner) THEN
      RAISE EXCEPTION 'Only the Owner can remove Admin access.'
        USING ERRCODE = '42501';
    ELSIF v_role = 'EDITOR' AND NOT (v_bootstrap OR v_actor_owner OR v_actor_admin) THEN
      RAISE EXCEPTION 'Only an authorized administrator can remove Editor access.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role_code::text = 'OWNER' OR NEW.role_code::text = 'OWNER' THEN
    RAISE EXCEPTION 'The provisioned Owner role cannot be changed.'
      USING ERRCODE = '42501';
  END IF;
  IF (OLD.role_code::text = 'ADMIN' OR NEW.role_code::text = 'ADMIN') AND NOT v_actor_owner THEN
    RAISE EXCEPTION 'Only the Owner can change Admin access.'
      USING ERRCODE = '42501';
  END IF;
  IF (OLD.role_code::text = 'EDITOR' OR NEW.role_code::text = 'EDITOR')
    AND NOT (v_actor_owner OR v_actor_admin) THEN
    RAISE EXCEPTION 'Only an authorized administrator can change Editor access.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_roles_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION byteclave_guard_user_roles();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION byteclave_guard_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id text;
  v_actor_id text := nullif(current_setting('app.actor_user_id', true), '');
  v_reset_user_id text := nullif(current_setting('app.password_reset_user_id', true), '');
  v_bootstrap boolean := coalesce(current_setting('app.owner_bootstrap', true), '') = 'true';
  v_recovery boolean := coalesce(current_setting('app.owner_recovery', true), '') = 'true';
  v_actor_owner boolean := false;
  v_actor_admin boolean := false;
  v_target_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Administrative accounts must be disabled rather than deleted.'
      USING ERRCODE = '42501';
  END IF;

  SELECT value #>> '{}' INTO v_owner_id
  FROM public.application_settings
  WHERE key = 'security.ownerUserId';

  IF v_actor_id IS NOT NULL THEN
    SELECT
      coalesce(bool_or(role_code::text = 'OWNER'), false),
      coalesce(bool_or(role_code::text = 'ADMIN'), false)
    INTO v_actor_owner, v_actor_admin
    FROM public.user_roles
    WHERE user_id::text = v_actor_id;
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email
    AND v_actor_id IS DISTINCT FROM OLD.id::text
    AND NOT v_actor_owner AND NOT v_bootstrap THEN
    RAISE EXCEPTION 'Email changes require the account owner or an authorized Owner.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.password_hash IS DISTINCT FROM NEW.password_hash
    AND v_actor_id IS DISTINCT FROM OLD.id::text
    AND v_reset_user_id IS DISTINCT FROM OLD.id::text
    AND NOT v_actor_owner AND NOT v_bootstrap AND NOT v_recovery THEN
    RAISE EXCEPTION 'Password changes require verified account recovery or Owner authorization.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.id::text = v_owner_id THEN
    IF NEW.disabled_at IS NOT NULL AND NOT v_recovery THEN
      RAISE EXCEPTION 'The provisioned Owner account cannot be disabled.'
        USING ERRCODE = '42501';
    END IF;
    IF v_actor_id IS DISTINCT FROM OLD.id::text AND NOT v_recovery AND NOT v_bootstrap THEN
      RAISE EXCEPTION 'Only the Owner can update the provisioned Owner account.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.disabled_at IS DISTINCT FROM NEW.disabled_at THEN
    SELECT role_code::text INTO v_target_role
    FROM public.user_roles
    WHERE user_id = OLD.id
    LIMIT 1;
    IF v_target_role = 'OWNER' AND NOT v_recovery THEN
      RAISE EXCEPTION 'The Owner account cannot be disabled.'
        USING ERRCODE = '42501';
    ELSIF v_target_role = 'ADMIN' AND NOT v_actor_owner THEN
      RAISE EXCEPTION 'Only the Owner can disable or enable Admin accounts.'
        USING ERRCODE = '42501';
    ELSIF v_target_role = 'EDITOR' AND NOT (v_actor_owner OR v_actor_admin) THEN
      RAISE EXCEPTION 'Only an authorized administrator can disable or enable Editor accounts.'
        USING ERRCODE = '42501';
    ELSIF v_target_role IS NULL AND NOT (v_actor_owner OR v_actor_admin) THEN
      RAISE EXCEPTION 'Only an authorized administrator can disable or enable accounts.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_guard
BEFORE UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION byteclave_guard_users();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION byteclave_guard_owner_setting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bootstrap boolean := coalesce(current_setting('app.owner_bootstrap', true), '') = 'true';
BEGIN
  IF TG_OP = 'INSERT' AND NEW.key = 'security.ownerUserId' AND NOT v_bootstrap THEN
    RAISE EXCEPTION 'The protected Owner identity can only be established by secure provisioning.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE'
    AND (OLD.key = 'security.ownerUserId' OR NEW.key = 'security.ownerUserId')
    AND NOT v_bootstrap THEN
    RAISE EXCEPTION 'The protected Owner identity cannot be modified.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'DELETE' AND OLD.key = 'security.ownerUserId' THEN
    RAISE EXCEPTION 'The protected Owner identity cannot be deleted.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER application_settings_owner_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.application_settings
FOR EACH ROW EXECUTE FUNCTION byteclave_guard_owner_setting();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION byteclave_guard_audit_logs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only.'
    USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION byteclave_guard_audit_logs();