// npm run migrate — creates the database (locally) and applies any pending migrations.
import { createDb, ensureDatabase, migrateLatest } from '../db';

await ensureDatabase();
const db = createDb();
const [, applied] = await migrateLatest(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
await db.destroy();
