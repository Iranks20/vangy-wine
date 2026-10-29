import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import { createApp } from '../src/app';
import { createDb, type Db } from '../src/db';
import { DEFAULT_SETTINGS } from '../src/defaults';
import { TEST_ENV } from './env';

const KEEP = new Set(['users', 'settings', 'knex_migrations', 'knex_migrations_lock']);

// Empties every business table so each test file starts from a clean, empty database.
export async function resetData(db: Db) {
  const { rows } = await db.raw('SELECT tablename FROM pg_tables WHERE schemaname = current_schema()');
  const names = (rows as { tablename: string }[]).map((r) => r.tablename).filter((n) => !KEEP.has(n));
  if (names.length) await db.raw(`TRUNCATE TABLE ${names.map(() => '??').join(', ')} RESTART IDENTITY CASCADE`, names);
  await db('settings').where({ id: 1 }).update({ data: JSON.stringify(DEFAULT_SETTINGS), last_backup_at: null });
}

// Sets up an app + signed-in client for a test file.
export function useApi() {
  const ctx = {} as { db: Db; token: string; app: ReturnType<typeof createApp> };
  beforeAll(async () => {
    ctx.db = createDb(TEST_ENV.DB_NAME);
    await resetData(ctx.db);
    ctx.app = createApp(() => ctx.db);
    const res = await request(ctx.app).post('/api/auth/login').send({ username: TEST_ENV.ADMIN_USERNAME, password: TEST_ENV.ADMIN_PASSWORD });
    ctx.token = res.body.token;
  });
  afterAll(async () => { await ctx.db.destroy(); });
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${ctx.token}`);
  return {
    ctx,
    get: (url: string) => auth(request(ctx.app).get(url)),
    post: (url: string, body?: object) => auth(request(ctx.app).post(url)).send(body ?? {}),
    put: (url: string, body?: object) => auth(request(ctx.app).put(url)).send(body ?? {}),
    del: (url: string) => auth(request(ctx.app).delete(url)),
    anon: () => request(ctx.app),
  };
}
