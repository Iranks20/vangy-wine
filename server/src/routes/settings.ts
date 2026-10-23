import { Router } from 'express';
import { z } from 'zod';
import type { Settings } from '../../../shared/types';
import type { Db } from '../db';
import { DEFAULT_SETTINGS } from '../defaults';
import { parse } from '../lib/http';
import { audit, iso } from '../lib/util';
import { currentUser } from '../services/auth';
import type { Ctx } from './context';

export async function getSettings(db: Db): Promise<Settings> {
  const row = await db('settings').where({ id: 1 }).first();
  const data = typeof row?.data === 'string' ? JSON.parse(row.data) : row?.data ?? {};
  return { ...DEFAULT_SETTINGS, ...data, lastBackup: iso(row?.last_backup_at) };
}

const text = (max: number) => z.string().trim().max(max);
const settingsSchema = z.object({
  businessName: text(150).min(1, 'Business name is required.'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]),
  phone: text(60), address: text(200), country: text(60), currency: text(10).min(1),
  taxRate: z.coerce.number().min(0, 'Tax rate cannot be negative.').max(100, 'Tax rate cannot be above 100%.'),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, 'Invoice prefix must be 2–6 letters.'),
  expiryAlertDays: z.coerce.number().int().min(0).max(3650),
  allowOversell: z.boolean(),
  tin: text(40), bankName: text(100), accountName: text(150), accountNo: text(60), mobileMoney: text(100), invoiceTerms: text(1000),
});

export function settingsRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);

  r.get('/', async (_req, res) => { res.json(await getSettings(db())); });

  r.put('/', async (req, res) => {
    const body = parse(settingsSchema, req.body);
    await db()('settings').where({ id: 1 }).update({ data: JSON.stringify(body) });
    await audit(db(), currentUser(req).name, 'Settings updated', 'Business settings saved');
    res.json(await getSettings(db()));
  });

  return r;
}

export function auditRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.get('/', auth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const rows = await db()('audit_log').orderBy('id', 'desc').limit(limit);
    res.json(rows.map((a) => ({ id: Number(a.id), date: iso(a.at), user: a.user_name, action: a.action, details: a.details ?? '' })));
  });
  return r;
}
