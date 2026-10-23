import knex, { type Knex } from 'knex';
import { config } from './config';
import { migrationSource } from './migrations';

export type Db = Knex;
export type Tx = Knex.Transaction;

// mysql2 options: DECIMALs as numbers, DATE columns as 'YYYY-MM-DD' strings, DATETIMEs in UTC.
const driverOptions = { decimalNumbers: true, dateStrings: ['DATE' as const], timezone: 'Z', supportBigNumbers: false };

export function connectionConfig(database?: string | null) {
  if (config.databaseUrl) return { uri: config.databaseUrl, ...driverOptions };
  return { ...config.db, ...(database === null ? { database: undefined } : database ? { database } : {}), ...driverOptions };
}

export function createDb(database?: string): Db {
  return knex({
    client: 'mysql2',
    connection: connectionConfig(database) as unknown as Knex.MySql2ConnectionConfig,
    pool: {
      min: 0, max: 10,
      // Every connection uses InnoDB and strict mode, whatever the server's own defaults are.
      afterCreate: (conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null, c: unknown) => void) =>
        conn.query("SET SESSION default_storage_engine = 'InnoDB', SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO'", (err) => done(err, conn)),
    },
  });
}

export async function migrateLatest(db: Db) {
  return db.migrate.latest({ migrationSource });
}

// Refuses to run on tables that cannot do transactions.
export async function assertInnoDb(db: Db) {
  const [rows] = await db.raw("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND ENGINE <> 'InnoDB' AND TABLE_NAME NOT LIKE 'knex_%'");
  const bad = (rows as { t: string }[]).map((r) => r.t);
  if (bad.length) throw new Error(`These tables are not InnoDB, so transactions would not work: ${bad.join(', ')}. Recreate the database.`);
}

// Creates the database if it does not exist (local development / tests; Railway provides its own).
export async function ensureDatabase(name = config.db.database) {
  if (config.databaseUrl) return;
  const root = knex({ client: 'mysql2', connection: connectionConfig(null) as unknown as Knex.MySql2ConnectionConfig });
  try {
    await root.raw(`CREATE DATABASE IF NOT EXISTS \`${name.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await root.destroy();
  }
}
