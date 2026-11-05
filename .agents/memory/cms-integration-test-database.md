---
name: CMS integration test database
description: Safe database targeting for integration tests that exercise protected Admin and audit behavior.
---

CMS integration tests that provision or authenticate privileged users must use a separate disposable test database, never the shared development database. Owner identity and audit history protections intentionally prevent ordinary cleanup.

**Why:** An integration-test attempt against the shared development database left an unassigned, non-admin test identity after the database correctly rejected unauthorized Owner provisioning.

**How to apply:** Set `TEST_DATABASE_URL` to an isolated disposable database before running write-heavy API or database integration tests. Keep the test skipped when that URL is absent; do not bypass Owner or audit protections to make cleanup easier.
