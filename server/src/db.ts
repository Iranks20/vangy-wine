import knex, { type Knex } from 'knex';
import pg from 'pg';
import { config } from './config';
import { migrationSource } from './migrations';

export type Db = Knex;
export type Tx = Knex.Transaction;

// pg returns BIGINT/NUMERIC as strings and DATE as a local Date. Money and quantities fit safely in a
// JS number, and DATE columns are kept as 'YYYY-MM-DD' strings so business dates never shift by time zone.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

// `database` overrides the database name; null connects to the server's `postgres` database (to create others).
export function connectionConfig(database?: string | null): Knex.PgConnectionConfig {
  const name = database === null ? 'postgres' : database;
  if (config.databaseUrl) {
    const url = new URL(config.databaseUrl);
    if (name) url.pathname = `/${name}`;
    return { connectionString: url.toString() };
  }
  return { ...config.db, ...(name ? { database: name } : {}) };
}

export function createDb(database?: string): Db {
  return knex({
    client: 'pg',
    connection: connectionConfig(database),
    // Serverless functions each hold their own pool, so keep it small there (Neon's pooler does the rest).
    pool: { min: 0, max: process.env.VERCEL ? 3 : 10 },
  });
}

export async function migrateLatest(db: Db) {
  return db.migrate.latest({ migrationSource });
}

// Creates the database if it does not exist (local development / tests; Neon provides its own).
export async function ensureDatabase(name?: string) {
  if (config.databaseUrl && !name) return;
  const dbName = name ?? config.db.database;
  const root = knex({ client: 'pg', connection: connectionConfig(null) });
  try {
    const { rows } = await root.raw('SELECT 1 FROM pg_database WHERE datname = ?', [dbName]);
    if (!rows.length) await root.raw('CREATE DATABASE ??', [dbName]);
  } finally {
    await root.destroy();
  }
}
