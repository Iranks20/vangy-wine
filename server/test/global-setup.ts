import { TEST_ENV } from './env';

// Rebuilds the test database from the migrations before the test run.
export default async function setup() {
  Object.assign(process.env, TEST_ENV);
  const { createDb, ensureDatabase, migrateLatest } = await import('../src/db');
  const { migrationSource } = await import('../src/migrations');
  await ensureDatabase(TEST_ENV.DB_NAME);
  const db = createDb(TEST_ENV.DB_NAME);
  await db.migrate.rollback({ migrationSource }, true);
  await migrateLatest(db);
  await db.destroy();
}
