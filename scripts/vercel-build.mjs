// Vercel build: writes the Build Output API layout in .vercel/output —
//   static/            the React app (client/dist)
//   functions/api.func the Express API bundled into one file
// then applies database migrations, so every deployment starts on an up-to-date schema.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const esbuild = require('esbuild');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = '.vercel/output';

rmSync(out, { recursive: true, force: true });

// The web app calls /api on its own address, so VITE_API_URL stays empty.
run('npm --prefix client run build');
cpSync('client/dist', `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await esbuild.build({
  entryPoints: ['server/src/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Bundled CommonJS packages (express, knex, pg) still call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  // Database drivers knex can load but this app never uses.
  external: ['mysql', 'mysql2', 'mariadb', 'mariadb/callback', 'sqlite3', 'better-sqlite3', 'tedious', 'oracledb', 'pg-query-stream', 'pg-native'],
  logLevel: 'info',
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2));

writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api(?:/.*)?$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '^/assets/', status: 404 },
    { src: '/(.*)', dest: '/index.html' }, // clean URLs like /sales/5 work on refresh
  ],
}, null, 2));

if (process.env.DATABASE_URL) {
  run('npm --prefix server run build');
  run('node server/dist/scripts/migrate.js');
} else {
  console.warn('DATABASE_URL is not set — skipped migrations.');
}
