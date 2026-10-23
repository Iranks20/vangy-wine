import express, { Router } from 'express';
import { z } from 'zod';
import type { Db as Snapshot } from '../../../shared/types';
import { computeDashboard } from '../../../shared/dashboard';
import { REPORT_LIST, runReport } from '../../../shared/reports';
import type { Db } from '../db';
import { badRequest, notFound, parse } from '../lib/http';
import { audit } from '../lib/util';
import { currentUser } from '../services/auth';
import { loadPurchases } from '../services/purchases';
import { loadBatches, loadRecipes } from '../services/production';
import { loadCustomers, loadEmployees, loadItems, loadMovements, loadSuppliers } from '../services/repo';
import { loadSales } from '../services/sales';
import { getSettings } from './settings';
import { loadCash, loadExpenses, loadReconciliations } from './finance';
import type { Ctx } from './context';

// Everything the dashboard and reports need, in the shared shapes.
export async function loadSnapshot(db: Db): Promise<Snapshot> {
  const [settings, items, movements, customers, suppliers, sales, purchases, batches, recipes, expenses, cash, employees, reconciliations] = await Promise.all([
    getSettings(db), loadItems(db), loadMovements(db, 100000), loadCustomers(db), loadSuppliers(db), loadSales(db), loadPurchases(db),
    loadBatches(db), loadRecipes(db), loadExpenses(db), loadCash(db), loadEmployees(db), loadReconciliations(db),
  ]);
  return { account: { name: '', username: '' }, settings, items, movements, customers, suppliers, sales, purchases, batches, recipes, expenses, cash, employees, reconciliations, audit: [] };
}

// Business tables in an order that respects foreign keys. Logins are never part of a backup.
const BACKUP_TABLES = ['settings', 'counters', 'audit_log', 'suppliers', 'customers', 'employees', 'items', 'lots', 'stock_movements',
  'sales', 'sale_lines', 'payments', 'purchases', 'purchase_lines', 'purchase_payments', 'recipes', 'recipe_lines',
  'batches', 'batch_materials', 'batch_stages', 'batch_outputs', 'expenses', 'expense_attachments', 'cash_entries', 'reconciliations'];
const FORMAT = 1;

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const rangeQuery = z.object({
  range: z.enum(['today', 'week', 'month', 'year', 'custom']).default('month'),
  from: z.string().regex(ymd, 'From date is not valid.').optional(),
  to: z.string().regex(ymd, 'To date is not valid.').optional(),
});

export function insightRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);

  r.get('/dashboard', async (req, res) => {
    const q = parse(rangeQuery, req.query);
    if (q.range === 'custom' && (!q.from || !q.to)) throw badRequest('Choose both dates for a custom range.');
    res.json(computeDashboard(await loadSnapshot(db()), q.range, q.from, q.to));
  });

  r.get('/reports', (_req, res) => { res.json(REPORT_LIST); });

  r.get('/reports/:id', async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(ymd, 'From date is not valid.'), to: z.string().regex(ymd, 'To date is not valid.') }), req.query);
    if (q.from > q.to) throw badRequest('The start date is after the end date.');
    const report = runReport(await loadSnapshot(db()), String(req.params.id), q.from, q.to);
    if (!report) throw notFound('Report');
    res.json({ ...report, generatedAt: new Date().toISOString() });
  });

  // ---- backup & restore ----
  r.get('/backup', async (req, res) => {
    const tables: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES) {
      const rows = await db()(t).select();
      tables[t] = rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Buffer.isBuffer(v) ? { $base64: v.toString('base64') } : v])));
    }
    const createdAt = new Date();
    await db()('settings').where({ id: 1 }).update({ last_backup_at: createdAt });
    await audit(db(), currentUser(req).name, 'Backup', 'Backup downloaded');
    res.setHeader('Content-Disposition', `attachment; filename="vangy-backup-${createdAt.toISOString().slice(0, 10)}.json"`);
    res.json({ app: 'vangy-wine', format: FORMAT, createdAt: createdAt.toISOString(), tables });
  });

  r.post('/backup/restore', express.json({ limit: '60mb' }), async (req, res) => {
    const b = req.body as { app?: string; format?: number; tables?: Record<string, unknown> };
    if (b?.app !== 'vangy-wine' || b.format !== FORMAT || typeof b.tables !== 'object' || !b.tables) throw badRequest('This file is not a Vangy Wine backup.');
    for (const [t, rows] of Object.entries(b.tables)) {
      if (!BACKUP_TABLES.includes(t)) throw badRequest(`The backup contains an unknown table (${t}).`);
      if (!Array.isArray(rows)) throw badRequest(`The backup table ${t} is damaged.`);
    }
    if (!Array.isArray(b.tables.settings) || !b.tables.settings.length) throw badRequest('The backup has no business settings, so it is incomplete.');

    const [cols] = await db().raw('SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()');
    const types = new Map<string, Map<string, string>>();
    for (const { t, c, d } of cols as { t: string; c: string; d: string }[]) {
      if (!types.has(t)) types.set(t, new Map());
      types.get(t)!.set(c, d);
    }
    const convert = (table: string, row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        const type = types.get(table)?.get(k);
        if (!type) continue; // ignore columns this version does not have
        if (v === null) out[k] = null;
        else if (type === 'datetime' || type === 'timestamp') out[k] = new Date(v as string);
        else if (type === 'json') out[k] = typeof v === 'string' ? v : JSON.stringify(v);
        else if (type.endsWith('blob')) out[k] = Buffer.from((v as { $base64: string }).$base64 ?? '', 'base64');
        else out[k] = v;
      }
      return out;
    };

    const counts: Record<string, number> = {};
    await db().transaction(async (trx) => {
      await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
      try {
        for (const t of [...BACKUP_TABLES].reverse()) await trx(t).delete(); // DELETE, not TRUNCATE: TRUNCATE would end the transaction
        for (const t of BACKUP_TABLES) {
          const rows = ((b.tables![t] ?? []) as Record<string, unknown>[]).map((row) => convert(t, row));
          for (let i = 0; i < rows.length; i += 500) await trx(t).insert(rows.slice(i, i + 500));
          counts[t] = rows.length;
        }
      } finally {
        await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
      }
      await audit(trx, currentUser(req).name, 'Restore', `Backup from ${b && (b as { createdAt?: string }).createdAt} restored`);
    });
    res.json({ ok: true, counts });
  });

  return r;
}
