import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Signer } from "@aws-sdk/rds-signer";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { resolveDbConfig, type DbConfig } from "./config.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

const CA_BUNDLE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "certs",
  "rds-global-bundle.pem",
);

let cachedCa: string | undefined;

function rdsCaBundle(): string {
  cachedCa ??= readFileSync(CA_BUNDLE_PATH, "utf8");
  return cachedCa;
}

function buildPoolConfig(config: DbConfig): pg.PoolConfig {
  if (config.mode === "url") {
    return { connectionString: config.connectionString };
  }

  const signer = new Signer({
    hostname: config.host!,
    port: config.port!,
    username: config.user!,
    region: config.region!,
  });

  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    // pg accepts an async supplier, so every new physical connection gets a
    // freshly signed token. IAM tokens expire after 15 minutes.
    password: () => signer.getAuthToken(),
    ssl: {
      ca: rdsCaBundle(),
      rejectUnauthorized: true,
    },
    // Lambda runs one request at a time per container, so a small pool is
    // correct here and protects the t4g.micro instance from connection storms.
    max: Number(process.env.DB_POOL_MAX ?? 2),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

let pool: pg.Pool | undefined;
let db: Database | undefined;

/**
 * Returns a process-wide pool. Cached at module scope so warm Lambda
 * invocations reuse established connections instead of reconnecting.
 */
export function getPool(): pg.Pool {
  pool ??= new pg.Pool(buildPoolConfig(resolveDbConfig()));
  return pool;
}

export function getDb(): Database {
  db ??= drizzle(getPool(), { schema });
  return db;
}

/** Closes the pool. Intended for tests and one-shot scripts, not request paths. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
