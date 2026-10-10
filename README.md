# ByteClave

ByteClave is an open-source catalog for digital resources. Phase 1 provides the
Next.js App Router shell, PostgreSQL/Drizzle domain foundation, catalog seed,
and self-hosting setup. The Admin interface and complete public catalog are
intentionally later-phase work.

## Requirements

- Node.js 24
- pnpm 10
- PostgreSQL 16 or newer, or Docker Compose

## Local development

```sh
pnpm install
cp .env.example .env
# Edit DATABASE_URL in .env to point to your local PostgreSQL instance.
set -a
. ./.env
set +a
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter @workspace/byteclave-app run dev
```

The initial owner email is configured through `INITIAL_OWNER_EMAIL` and defaults
to `byteclave@gmail.com`. The seed configures roles and catalog examples; it
does not create an account or password. The first authenticated account matching
the configured email is reserved for the Owner bootstrap flow to be implemented
with authentication.

## Docker Compose

```sh
cp .env.example .env
docker compose up -d postgres
docker compose --profile setup run --rm migrate-seed
docker compose up --build -d app
```

Open <http://localhost:3000>. PostgreSQL data persists in the named
`byteclave-postgres` volume. The compose database credentials are development
defaults; change them before exposing a self-hosted deployment.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

Database commands are also available at the workspace root:
`pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed`.
