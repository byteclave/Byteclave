import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

const connectionString = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL owner, role, and audit protections reject unauthorized writes",
  { skip: !connectionString },
  async () => {
    const pool = new pg.Pool({ connectionString, max: 1 });
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;

      const ownerId = randomUUID();
      const adminId = randomUUID();
      const editorId = randomUUID();
      const unassignedId = randomUUID();
      const testRun = randomUUID();
      const ownerEmail = `owner-${testRun}@example.invalid`;

      for (const [id, email, name] of [
        [ownerId, ownerEmail, "Guard Test Owner"],
        [adminId, `admin-${testRun}@example.invalid`, "Guard Test Admin"],
        [editorId, `editor-${testRun}@example.invalid`, "Guard Test Editor"],
        [unassignedId, `unassigned-${testRun}@example.invalid`, "Unassigned"],
      ]) {
        await client.query(
          "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)",
          [id, email, name],
        );
      }

      await client.query("SELECT set_config('app.owner_bootstrap', 'true', true)");
      await client.query(
        "INSERT INTO application_settings (key, value) VALUES ('security.ownerUserId', to_jsonb($1::text))",
        [ownerId],
      );
      await client.query(
        "INSERT INTO user_roles (user_id, role_code, assigned_by_user_id) VALUES ($1, 'OWNER', $1)",
        [ownerId],
      );
      await client.query("SELECT set_config('app.owner_bootstrap', 'false', true)");

      await client.query("SELECT set_config('app.actor_user_id', $1, true)", [ownerId]);
      await client.query(
        "INSERT INTO user_roles (user_id, role_code, assigned_by_user_id) VALUES ($1, 'ADMIN', $2)",
        [adminId, ownerId],
      );
      await client.query("SELECT set_config('app.actor_user_id', $1, true)", [adminId]);
      await client.query(
        "INSERT INTO user_roles (user_id, role_code, assigned_by_user_id) VALUES ($1, 'EDITOR', $2)",
        [editorId, adminId],
      );

      async function expectDenied(label: string, statement: string, values: unknown[] = []) {
        const savepoint = `guard_${randomUUID().replaceAll("-", "")}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        try {
          await client.query(statement, values);
          assert.fail(`${label} unexpectedly succeeded`);
        } catch (error) {
          assert.equal((error as { code?: string }).code, "42501", label);
        } finally {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        }
      }

      await expectDenied(
        "Admin cannot assign another Admin role",
        "INSERT INTO user_roles (user_id, role_code, assigned_by_user_id) VALUES ($1, 'ADMIN', $2)",
        [unassignedId, adminId],
      );
      await expectDenied(
        "Admin cannot remove the Owner role",
        "DELETE FROM user_roles WHERE user_id = $1 AND role_code = 'OWNER'",
        [ownerId],
      );
      await expectDenied(
        "Admin cannot disable the Owner account",
        "UPDATE users SET disabled_at = now() WHERE id = $1",
        [ownerId],
      );
      await expectDenied(
        "Admin cannot change the Owner email",
        "UPDATE users SET email = $2 WHERE id = $1",
        [ownerId, `changed-${testRun}@example.invalid`],
      );
      await expectDenied(
        "Owner identity is immutable after provisioning",
        "UPDATE application_settings SET value = to_jsonb($1::text) WHERE key = 'security.ownerUserId'",
        [adminId],
      );

      const [audit] = (
        await client.query(
          "INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, changes) VALUES ($1, 'test', $2, 'test.created', '{}'::jsonb) RETURNING id",
          [adminId, editorId],
        )
      ).rows;
      await expectDenied(
        "Audit history cannot be altered",
        "UPDATE audit_logs SET changes = '{\"changed\":true}'::jsonb WHERE id = $1",
        [audit.id],
      );

      await client.query("SELECT set_config('app.actor_user_id', $1, true)", [ownerId]);
      await client.query(
        "UPDATE users SET email = $2 WHERE id = $1",
        [ownerId, `owner-updated-${testRun}@example.invalid`],
      );
      await client.query("SELECT set_config('app.actor_user_id', $1, true)", [adminId]);
      await client.query(
        "UPDATE users SET disabled_at = now() WHERE id = $1",
        [editorId],
      );
      await client.query(
        "UPDATE users SET disabled_at = NULL WHERE id = $1",
        [editorId],
      );

      await client.query("ROLLBACK");
      transactionOpen = false;
    } finally {
      if (transactionOpen) await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);
