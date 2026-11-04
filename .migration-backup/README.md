# ByteClave

ByteClave is an open-source catalog for digital resources. It uses a Next.js
App Router frontend, a PostgreSQL/Drizzle modular monolith, and a protected
administrator dashboard. Content-management workflows and inspection/export
engines remain staged for later phases.

## Requirements

- Node.js 24
- pnpm 10
- PostgreSQL 16 or newer, or Docker Compose

## Local development

```sh
pnpm install
cp .env.example .env
# Generate and set a URL-safe database password and a separate session secret:
openssl rand -hex 32
openssl rand -base64 48
# Put the generated values in POSTGRES_PASSWORD and SESSION_SECRET in .env.
# Set DATABASE_URL to your PostgreSQL instance; for local Compose, use the same
# POSTGRES_PASSWORD in the URL and host localhost.
set -a
. ./.env
set +a
pnpm db:migrate
pnpm db:seed
pnpm admin:bootstrap-owner
pnpm --filter @workspace/byteclave-app run dev
```

`INITIAL_OWNER_EMAIL` defaults to `byteclave@gmail.com` and is used only by the
interactive Owner provisioning command. The seed creates role definitions and
editable catalog examples, but never creates an account or password. Owner
provisioning requires an explicit terminal confirmation and prompts for a
password without displaying it; visiting the site or registering cannot grant
Owner access.

Open `/admin/login` for invitation-only administrator access. The Owner can
create single-use invitation links, manage authorized accounts, and change
security settings. Password resets are issued by an authorized administrator
as one-time links. The Owner can recover the recorded account from a trusted
terminal with `pnpm admin:recover-owner`. Passwords are hashed with scrypt;
sessions are database-backed, expire, and can be revoked.

The dashboard's content sections are intentionally marked as deferred until
their management workflows are implemented. They are not presented as working
content, media, publishing, or version-history tools.

## Docker Compose

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD and SESSION_SECRET before running Compose.
docker compose up -d postgres
docker compose --profile setup run --rm migrate-seed
docker compose up --build -d app
docker compose exec app pnpm admin:bootstrap-owner
```

Open <http://localhost:3000>. PostgreSQL data persists in the named
`byteclave-postgres` volume. Compose requires a generated `POSTGRES_PASSWORD`
and `SESSION_SECRET`; the database port is bound to localhost. For Owner
recovery, use `docker compose exec app pnpm admin:recover-owner`.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

Database commands are available at the workspace root: `pnpm db:generate`
(after schema changes), `pnpm db:migrate`, and `pnpm db:seed`. PostgreSQL guard
integration tests run with `TEST_DATABASE_URL=<test database URL> pnpm --filter
@workspace/db run test:integration`; the test uses a transaction and rolls back
its temporary records.
