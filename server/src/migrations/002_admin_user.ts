import type { Knex } from 'knex';
import { ensureAdmin } from '../services/auth';

// Creates the director's login from ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_NAME when they are set.
// The server also re-checks on every start, so adding them to .env later still works.
export async function up(knex: Knex) {
  await ensureAdmin(knex);
}

export async function down() {
  // Users are kept: removing a login on rollback would lock the business out.
}
