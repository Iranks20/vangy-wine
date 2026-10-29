// Vercel serverless entry: the same Express app, one database pool per function instance.
// Migrations and the director's login are applied at build time (scripts/migrate.ts), not here.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { createDb } from './db';

const db = createDb();
const app = createApp(() => db);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
