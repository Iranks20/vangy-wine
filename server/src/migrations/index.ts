import type { Knex } from 'knex';
import * as m001 from './001_schema';
import * as m002 from './002_admin_user';
import * as m003 from './003_voids';
import * as m004 from './004_item_active';

// Migrations are listed explicitly so they work the same in tests, `tsx` and the bundled build.
const migrations: Record<string, { up: (k: Knex) => Promise<void>; down: (k: Knex) => Promise<void> }> = {
  '001_schema': m001,
  '002_admin_user': m002,
  '003_voids': m003,
  '004_item_active': m004,
};

export const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(migrations),
  getMigrationName: (name) => name,
  getMigration: async (name) => migrations[name],
};
