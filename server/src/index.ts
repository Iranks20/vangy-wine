import { config } from './config';
import { createApp } from './app';
import { assertInnoDb, createDb, ensureDatabase, migrateLatest } from './db';
import { ensureAdmin } from './services/auth';

async function main() {
  await ensureDatabase();
  const db = createDb();
  const [, applied] = await migrateLatest(db);
  if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);
  await assertInnoDb(db);
  if (await ensureAdmin(db)) console.log(`Created login for ${config.admin!.username}`);
  if (!(await db('users').first())) console.warn('No login exists yet — set ADMIN_USERNAME and ADMIN_PASSWORD and restart.');

  const server = createApp(() => db).listen(config.port, () => console.log(`Vangy Wine API listening on port ${config.port}`));
  const stop = () => server.close(() => db.destroy().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
