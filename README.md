# Vangy Wine — Business Manager

Business management system for **Vangy Wine Company Limited**: sales, inventory, production
batches, purchases, suppliers, customers, expenses, cashbook, reports and settings.
Responsive — works on laptops and phones.

Built with React 19, TypeScript, Vite, Tailwind CSS 4 and Recharts.

## Run locally (Windows)

1. Install **Node.js 22 LTS** from https://nodejs.org.
2. Double-click **`start-demo.bat`** — it installs, builds and opens http://localhost:4173.
3. Phones on the same Wi-Fi can open the *Network* address shown in the window.

For development: `cd client && npm install && npm run dev`.

## Deploy to Netlify

The repo includes `netlify.toml`, so no settings are needed:

1. In Netlify choose **Add new site → Import an existing project → GitHub** and pick this repo.
2. Netlify reads `netlify.toml` (base `client`, command `npm run build`, publish `dist`) and deploys.

## How data is stored (current version)

Data is stored in the browser of each device (`localStorage`), so a laptop and a phone keep
separate records. Use **Settings → Backup & data** to download or restore a backup file.
A shared database (Node.js + SQLite, schema drafted in `server/migrations/001_init.sql`) is the next phase.

## Project structure

```
client/                React app (Netlify builds this folder)
  src/lib/store.tsx    data store and business rules (stock, balances, audit trail)
  src/lib/mock.ts      starting records
  src/pages/           one file per screen
server/migrations/     draft database schema for the backend phase
netlify.toml           Netlify build & routing settings
start-demo.bat         Windows launcher
```
