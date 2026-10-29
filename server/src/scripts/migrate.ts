// npm run migrate — creates the database (locally), applies any pending migrations and creates the
// director's login from ADMIN_USERNAME / ADMIN_PASSWORD if it does not exist. Runs on every Vercel build.
import { config } from '../config';
import { createDb, ensureDatabase, migrateLatest } from '../db';
import { ensureAdmin } from '../services/auth';

await ensureDatabase();
const db = createDb();
const [, applied] = await migrateLatest(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
if (await ensureAdmin(db)) console.log(`Created login for ${config.admin!.username}`);
await db.destroy();
