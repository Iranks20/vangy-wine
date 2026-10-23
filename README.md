# Vangy Wine — Business Manager

Business management system for **Vangy Wine Company Limited**: sales, invoices, receipts, inventory,
production batches, purchases, suppliers, customers, expenses, cashbook, reports and settings.
Responsive — works on laptops and phones.

| Part | Technology | Hosted on |
|---|---|---|
| Web app (`client/`) | React 19, TypeScript, Vite, Tailwind CSS 4, Recharts | Netlify |
| API (`server/`) | Node.js 22, Express 5, TypeScript, Knex, Zod | Railway |
| Database | MySQL 8+ (InnoDB) | Railway MySQL (or local XAMPP for development) |
| Shared code (`shared/`) | Types, money/stock calculations, dashboard and the 20 reports | used by both |

All business rules run on the server inside database transactions. The web app only displays data and
sends changes to the API.

---

## Run it on your laptop

**You need:** Node.js 22 LTS (https://nodejs.org) and MySQL running (XAMPP is fine).

1. Copy `server/.env.example` to `server/.env` and set at least:
   - `DB_USER` / `DB_PASSWORD` for your MySQL (XAMPP: `root` and an empty password)
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME` — the director's login
   - `JWT_SECRET` — any long random text
2. Double-click **`start.bat`**. It installs, builds, creates the `vangy_wine` database, runs the
   migrations (which create the director's login from `.env`) and opens http://localhost:4173.
3. Phones on the same Wi-Fi can open the *Network* address printed in the window.

For development with hot reload: `npm run dev:api` and `npm run dev:web` (http://localhost:5173).

### Tests

```
npm test
```

Runs 71 API tests against a **separate** database, `vangy_wine_test`, which is rebuilt on every run —
your real data is never touched. They cover sales totals and discounts, partial and credit payments,
debt balances, stock deductions and rollback, oversell rules, invoice/receipt numbering, duplicate
submissions, cancellations, adjustments, purchases and landed cost, production and QC release,
expenses and attachments, transfers, cash counts, dashboard, all 20 reports, backup and restore,
login, and database engine checks. Tests create products and other records and remove them.

---

## Deploy

### 1. API + database on Railway

1. In Railway create a project → **Deploy from GitHub repo** → choose this repository.
   `railway.json` already tells Railway how to build and start the API and where its health check is.
2. In the same project add **Database → MySQL**.
3. On the API service open **Variables** and add:

| Variable | Value |
|---|---|
| `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` (reference to the MySQL service) |
| `NODE_ENV` | `production` |
| `TZ` | `Africa/Kampala` |
| `JWT_SECRET` | a long random string (at least 32 characters) |
| `ADMIN_USERNAME` | the director's username, e.g. `admin` |
| `ADMIN_PASSWORD` | a strong password (at least 8 characters) |
| `ADMIN_NAME` | e.g. `Vangy Director` |
| `CORS_ORIGIN` | your Netlify address, e.g. `https://vangy-wine.netlify.app` |

4. Under **Settings → Networking** click **Generate Domain**. Opening
   `https://<your-domain>/api/health` should show `{"ok":true,...}`.

On every start the API applies any new migrations and creates the director's login if it does not
exist yet. Changing `ADMIN_PASSWORD` later does **not** change an existing login — change the password
in the app (Settings → Business → Change password).

### 2. Web app on Netlify

1. Netlify → **Add new site → Import an existing project → GitHub** → this repository.
   `netlify.toml` sets the build (base `client`, command `npm run build`, publish `dist`).
2. **Site configuration → Environment variables** → add
   `VITE_API_URL` = your Railway address, e.g. `https://vangy-wine-api.up.railway.app` (no `/api`).
3. Trigger a deploy. Then make sure the Netlify address is in the API's `CORS_ORIGIN`.

---

## How it works

### Business rules (all enforced by the API)

- **Money** is stored as whole Uganda Shillings; quantities allow decimals (litres, kg).
- **Every sale is one transaction**: invoice number, stock out, cost captured, payment and receipt all
  save together or not at all. Selling more than is in stock is refused unless *Allow selling more than
  stock* is switched on in Settings.
- **Credit sales are never cash.** "Cash received" only counts payments actually recorded (less refunds).
- **Invoices** `INV-YYYY-00001`, **receipts** `RCT-YYYY-00001` (one per payment), **purchase orders**
  `PO-YYYY-0001`, **expenses** `EXP-YYYY-0001`, **batches** `B-YYYY-001`, **adjustments** `ADJ-YYYY-0001`.
  Numbers are row-locked so they are never repeated. Double-tapping Save cannot record a sale or payment
  twice (idempotency keys).
- **Stock valuation — weighted-average cost.** Each receipt of stock re-averages the item's unit cost;
  every issue (sale, production, write-off) is costed at the current average. Purchased goods are valued
  at landed cost: price plus a share of transport, split by order value.
- **Lots and expiry.** Every receipt of stock is a lot; stock is taken from the lot that expires first.
  Released production batches become lots named after the batch, with an expiry date.
- **Production cost per bottle** = everything the batch consumed (ingredients + packaging) ÷ good units.
  A batch only enters saleable stock after it **passes quality check** and is released.
- **Nothing financial is deleted.** Sales are cancelled (stock returned, refund recorded); mistaken
  receipts, supplier payments and cashbook entries are voided with a reason (shown as VOID, no longer
  counted); expenses are edited or voided; purchase orders cancelled only if nothing was received or paid. Products, customers and
  suppliers can only be deleted while they have no transactions.
- **Audit trail** of every change, with who and when (Settings → Audit trail).
- **Profit figures are management estimates**, not audited accounts: revenue counts credit sales when
  invoiced; gross profit = revenue − cost of wine sold; net = gross − expenses.

### Database

The schema is in `server/src/migrations/001_schema.ts` (26 tables). **InnoDB is required** — it provides
transactions and foreign keys. XAMPP's MySQL defaults to MyISAM, which silently ignores both, so every
table is created as InnoDB explicitly and the API refuses to start if any table is not InnoDB.

### API overview (all under `/api`, all except login need `Authorization: Bearer <token>`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/password` |
| Settings & audit | `GET/PUT /settings`, `GET /audit` |
| Master data | `GET/POST/PUT/DELETE /items`, `/customers`, `/suppliers`, `/employees` |
| Sales | `GET/POST /sales`, `GET/PUT /sales/:id`, `POST /sales/:id/payments`, `POST /sales/:id/payments/:pid/void`, `POST /sales/:id/cancel` |
| Inventory | `GET /movements`, `POST /stock/adjustments` |
| Purchases | `GET/POST /purchases`, `PUT /purchases/:id`, `POST /purchases/:id/receive`, `/pay`, `/payments/:pid/void`, `/cancel` |
| Production | `GET/POST/PUT/DELETE /recipes`, `GET/POST /batches`, `PUT /batches/:id`, `POST /batches/:id/materials`, `/stages`, `/outputs`, `/qc`, `/release`, `/reject` |
| Finance | `GET/POST /expenses`, `PUT /expenses/:id`, `GET /expenses/:id/attachment`, `POST /expenses/:id/void`, `GET/POST /cash`, `POST /cash/:id/void`, `POST /cash/transfer`, `GET/POST /reconciliations`, `DELETE /reconciliations/:id` |
| Insights | `GET /dashboard?range=`, `GET /reports`, `GET /reports/:id?from=&to=` |
| Backup | `GET /backup`, `POST /backup/restore` |
| Health | `GET /health` |

---

## Backups

- **Settings → Backup & data → Back up now** downloads a complete copy of the business data (all
  records and attachments; logins are not included). The page shows when the last backup was made.
- Keep copies somewhere other than the laptop/phone — a flash drive, external disk or Google Drive —
  at least weekly.
- **Restore from file** replaces all business data with the backup in a single transaction; if anything
  in the file is wrong, nothing is changed. Download a fresh backup first.
- On Railway, also turn on the MySQL service's own backups.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach the server" in the app | The API is not running, or `VITE_API_URL` (Netlify) is wrong. Open `<api>/api/health`. |
| Sign-in works locally but not on Netlify | Add the Netlify address to `CORS_ORIGIN` on Railway and redeploy. |
| API stops with "These tables are not InnoDB" | The database was created as MyISAM. Drop it and restart the API to recreate it. |
| "No login exists yet" in the API log | Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` and restart. |
| Too many sign-in attempts | Wait 15 minutes (10 attempts per 15 minutes per address). |
| XAMPP `mysql` command says `caching_sha2_password could not be loaded` | Only the old XAMPP command-line tool is affected; the API connects fine. |

## Limitations and next steps

- One login (the director). Staff are records only. Roles can be added later.
- One database shared by all devices through the API — the laptop and phones see the same data, but the
  app needs an internet connection to Railway (no offline mode).
- Reports export to CSV (opens in Excel) and print / save as PDF from the browser.
- Customer-category price lists, promotions, sale returns of part of an invoice, and automatic
  scheduled backups to external storage are not built yet.
