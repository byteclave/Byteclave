import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { parseServerEnvironment } from "@workspace/config";
import * as schema from "./schema";

const { Pool } = pg;

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDatabase = globalThis as typeof globalThis & {
  byteclavePool?: InstanceType<typeof Pool>;
  byteclaveDb?: Database;
};

export function getPool(): InstanceType<typeof Pool> {
  if (!globalForDatabase.byteclavePool) {
    const env = parseServerEnvironment();
    globalForDatabase.byteclavePool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalForDatabase.byteclavePool;
}

export function getDb(): Database {
  if (!globalForDatabase.byteclaveDb) {
    globalForDatabase.byteclaveDb = drizzle(getPool(), { schema });
  }
  return globalForDatabase.byteclaveDb;
}

export * from "./schema";
export * from "./services";
export * from "./queries";
