// npm run db:create — creates the configured database if it does not exist.
import { config } from '../config';
import { ensureDatabase } from '../db';

await ensureDatabase();
console.log(`Database ${config.db.database} is ready.`);
