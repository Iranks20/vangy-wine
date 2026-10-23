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
  return knex({ client: 'mysql2', connection: connectionConfig(database) as unknown as Knex.MySql2ConnectionConfig, pool: { min: 0, max: 10 } });
}

export async function migrateLatest(db: Db) {
  return db.migrate.latest({ migrationSource });
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
