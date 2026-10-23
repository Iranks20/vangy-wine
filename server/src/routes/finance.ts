import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { CashEntry, Expense, Reconciliation } from '../../../shared/types';
import { accountBalance, cashbook } from '../../../shared/calc';
import { EXPENSE_CATEGORIES } from '../../../shared/defaults';
import type { Db, Tx } from '../db';
import { badRequest, conflict, idParam, notFound, parse } from '../lib/http';
import { audit, iso, nextNumber, opt } from '../lib/util';
import { currentUser } from '../services/auth';
import { loadPurchases } from '../services/purchases';
import { loadSuppliers } from '../services/repo';
import { loadSales } from '../services/sales';
import type { Ctx } from './context';

type Conn = Db | Tx;
type Method = 'cash' | 'mobile_money' | 'bank';
const method = z.enum(['cash', 'mobile_money', 'bank'], { errorMap: () => ({ message: 'Choose cash, mobile money or bank.' }) });
const amount = z.coerce.number({ invalid_type_error: 'Amount must be a number.' }).int('Amount must be whole shillings.').positive('Amount must be more than zero.');
const MAX_ATTACHMENT = 4 * 1024 * 1024;
const ATTACHMENT_TYPES = /^(image\/(png|jpe?g|webp|heic|gif)|application\/pdf)$/;

export async function loadExpenses(db: Conn): Promise<Expense[]> {
  const rows = await db('expenses as e').leftJoin('expense_attachments as a', 'a.expense_id', 'e.id')
    .select('e.*', db.raw('a.expense_id IS NOT NULL AS has_attachment')).orderBy('e.date').orderBy('e.id');
  return rows.map((e) => ({
    id: e.id, ref: e.ref, date: iso(e.date)!, category: e.category, description: e.description, amount: Number(e.amount),
    method: e.method, recipient: e.recipient, reference: opt(e.reference), status: e.status, voidReason: opt(e.void_reason), hasAttachment: !!Number(e.has_attachment),
  }));
}

export async function loadCash(db: Conn): Promise<CashEntry[]> {
  const rows = await db('cash_entries').orderBy('date').orderBy('id');
  return rows.map((c) => ({ id: c.id, date: iso(c.date)!, direction: c.direction, amount: Number(c.amount), method: c.method, description: c.description, category: c.category, voided: !!c.voided_at, voidReason: opt(c.void_reason) }));
}

export async function loadReconciliations(db: Conn): Promise<Reconciliation[]> {
  const rows = await db('reconciliations').orderBy('date', 'desc').orderBy('id', 'desc');
  return rows.map((r) => ({ id: r.id, date: iso(r.date)!, method: r.method, systemAmount: Number(r.system_amount), counted: Number(r.counted), difference: Number(r.difference), notes: opt(r.notes), user: r.user_name }));
}

// Current balance of an account, calculated from every record that moved money.
export async function balanceOf(db: Conn, m: Method) {
  const [sales, purchases, suppliers, expenses, cash] = await Promise.all([loadSales(db), loadPurchases(db), loadSuppliers(db), loadExpenses(db), loadCash(db)]);
  return accountBalance(cashbook({ sales, purchases, suppliers, expenses, cash }), m);
}

const LABEL: Record<Method, string> = { cash: 'Cash', mobile_money: 'Mobile money', bank: 'Bank' };

export function financeRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);
  const user = (req: Parameters<typeof currentUser>[0]) => currentUser(req).name;

  // ---- expenses ----
  r.get('/expenses', async (_req, res) => { res.json(await loadExpenses(db())); });

  const expenseSchema = z.object({
      date: z.string().min(1, 'Date is required.'),
      category: z.string().refine((c) => EXPENSE_CATEGORIES.includes(c), 'Choose an expense category.'),
      description: z.string().trim().min(1, 'Description is required.').max(255),
      amount, method,
      recipient: z.string().trim().max(150).default(''),
      reference: z.string().trim().max(80).optional(),
      attachment: z.object({ filename: z.string().max(200), mime: z.string(), data: z.string() }).optional(),
  });
  r.post('/expenses', async (req, res) => {
    const b = parse(expenseSchema, req.body);
    const date = new Date(b.date);
    if (Number.isNaN(date.getTime())) throw badRequest('Date is not valid.');
    let file: Buffer | null = null;
    if (b.attachment) {
      if (!ATTACHMENT_TYPES.test(b.attachment.mime)) throw badRequest('Attach a photo (JPG, PNG) or a PDF.');
      file = Buffer.from(b.attachment.data, 'base64');
      if (file.length > MAX_ATTACHMENT) throw badRequest('The attachment is larger than 4 MB.');
    }
    const id = await db().transaction(async (trx) => {
      const ref = await nextNumber(trx, 'EXP', 4);
      const [eid] = await trx('expenses').insert({ ref, date, category: b.category, description: b.description, amount: b.amount, method: b.method, recipient: b.recipient, reference: b.reference || null });
      if (file) await trx('expense_attachments').insert({ expense_id: eid, filename: b.attachment!.filename, mime: b.attachment!.mime, data: file });
      await audit(trx, user(req), 'Expense recorded', `${ref} — ${b.description} — ${b.amount.toLocaleString()}`);
      return eid;
    });
    res.status(201).json((await loadExpenses(db())).find((e) => e.id === id));
  });

  r.put('/expenses/:id', async (req, res) => {
    const id = idParam(req);
    const b = parse(expenseSchema, req.body);
    const date = new Date(b.date);
    if (Number.isNaN(date.getTime())) throw badRequest('Date is not valid.');
    await db().transaction(async (trx) => {
      const row = await trx('expenses').where({ id }).forUpdate().first();
      if (!row) throw notFound('Expense');
      if (row.status === 'voided') throw conflict('A voided expense cannot be edited.');
      await trx('expenses').where({ id }).update({ date, category: b.category, description: b.description, amount: b.amount, method: b.method, recipient: b.recipient, reference: b.reference || null });
      if (b.attachment) {
        if (!ATTACHMENT_TYPES.test(b.attachment.mime)) throw badRequest('Attach a photo (JPG, PNG) or a PDF.');
        const file = Buffer.from(b.attachment.data, 'base64');
        if (file.length > MAX_ATTACHMENT) throw badRequest('The attachment is larger than 4 MB.');
        await trx('expense_attachments').where({ expense_id: id }).delete();
        await trx('expense_attachments').insert({ expense_id: id, filename: b.attachment.filename, mime: b.attachment.mime, data: file });
      }
      const was = Number(row.amount) !== b.amount ? ` (amount ${Number(row.amount).toLocaleString()} → ${b.amount.toLocaleString()})` : '';
      await audit(trx, user(req), 'Expense edited', `${row.ref} — ${b.description}${was}`);
    });
    res.json((await loadExpenses(db())).find((e) => e.id === id));
  });

  r.get('/expenses/:id/attachment', async (req, res) => {
    const a = await db()('expense_attachments').where({ expense_id: idParam(req) }).first();
    if (!a) throw notFound('Attachment');
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename="${String(a.filename).replace(/[^\w.\- ]/g, '_')}"`);
    res.send(a.data);
  });

  r.post('/expenses/:id/void', async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for voiding.').max(500) }), req.body);
    const id = idParam(req);
    const row = await db()('expenses').where({ id }).first();
    if (!row) throw notFound('Expense');
    if (row.status === 'voided') throw conflict('This expense is already voided.');
    await db()('expenses').where({ id }).update({ status: 'voided', void_reason: b.reason });
    await audit(db(), user(req), 'Expense voided', `${row.ref} — ${b.reason}`);
    res.json((await loadExpenses(db())).find((e) => e.id === id));
  });

  // ---- cashbook entries that are not sales, purchases or expenses ----
  r.get('/cash', async (_req, res) => { res.json(await loadCash(db())); });

  r.post('/cash', async (req, res) => {
    const b = parse(z.object({
      category: z.enum(['Other income', 'Other payment', 'Opening balance'], { errorMap: () => ({ message: 'Choose the type of entry.' }) }),
      method, amount,
      description: z.string().trim().min(1, 'Description is required.').max(255),
      date: z.string().optional(),
    }), req.body);
    const direction = b.category === 'Other payment' ? 'out' : 'in';
    const [id] = await db()('cash_entries').insert({ date: b.date ? new Date(b.date) : new Date(), direction, amount: b.amount, method: b.method, description: b.description, category: b.category });
    await audit(db(), user(req), 'Cashbook entry', `${b.category} — ${b.description} — ${b.amount.toLocaleString()}`);
    res.status(201).json((await loadCash(db())).find((c) => c.id === id));
  });

  r.post('/cash/transfer', async (req, res) => {
    const b = parse(z.object({ from: method, to: method, amount, description: z.string().trim().min(1, 'Description is required.').max(255) }), req.body);
    if (b.from === b.to) throw badRequest('Choose two different accounts.');
    await db().transaction(async (trx) => {
      await trx.raw('SELECT GET_LOCK(?, 10)', ['vangy-cash-transfer']); // one transfer at a time, so balances cannot race
      try {
        const available = await balanceOf(trx, b.from);
        if (b.amount > available) throw badRequest(`${LABEL[b.from]} only has ${available.toLocaleString()} available.`);
        const date = new Date();
        const group = randomUUID();
        await trx('cash_entries').insert([
          { date, direction: 'out', amount: b.amount, method: b.from, description: b.description, category: 'Transfer', group_ref: group },
          { date, direction: 'in', amount: b.amount, method: b.to, description: b.description, category: 'Transfer', group_ref: group },
        ]);
        await audit(trx, user(req), 'Transfer', `${LABEL[b.from]} → ${LABEL[b.to]} — ${b.amount.toLocaleString()}`);
      } finally {
        await trx.raw('SELECT RELEASE_LOCK(?)', ['vangy-cash-transfer']);
      }
    });
    res.status(201).json(await loadCash(db()));
  });

  // Voids a cashbook entry (both halves of a transfer together). Kept on record with the reason.
  r.post('/cash/:id/void', async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for voiding the entry.').max(500) }), req.body);
    await db().transaction(async (trx) => {
      const row = await trx('cash_entries').where({ id: idParam(req) }).forUpdate().first();
      if (!row) throw notFound('Cashbook entry');
      if (row.voided_at) throw conflict('This entry is already voided.');
      const q = trx('cash_entries');
      if (row.group_ref) q.where({ group_ref: row.group_ref }); else q.where({ id: row.id });
      await q.update({ voided_at: new Date(), void_reason: b.reason });
      await audit(trx, user(req), 'Cashbook entry voided', `${row.category} — ${row.description} — ${Number(row.amount).toLocaleString()} — ${b.reason}`);
    });
    res.json(await loadCash(db()));
  });

  // ---- reconciliation: the system balance is always worked out on the server ----
  r.get('/reconciliations', async (_req, res) => { res.json(await loadReconciliations(db())); });

  r.post('/reconciliations', async (req, res) => {
    const b = parse(z.object({ method, counted: z.coerce.number().int('Counted amount must be whole shillings.').min(0, 'Counted amount cannot be negative.'), notes: z.string().trim().max(500).optional() }), req.body);
    const system = await balanceOf(db(), b.method);
    const [id] = await db()('reconciliations').insert({ date: new Date(), method: b.method, system_amount: system, counted: b.counted, difference: b.counted - system, notes: b.notes || null, user_name: user(req) });
    await audit(db(), user(req), 'Cash count', `${LABEL[b.method]}: counted ${b.counted.toLocaleString()}, system ${system.toLocaleString()}`);
    res.status(201).json((await loadReconciliations(db())).find((x) => x.id === id));
  });

  r.delete('/reconciliations/:id', async (req, res) => {
    const row = await db()('reconciliations').where({ id: idParam(req) }).first();
    if (!row) throw notFound('Cash count');
    await db()('reconciliations').where({ id: row.id }).delete();
    await audit(db(), user(req), 'Cash count deleted', `${LABEL[row.method as Method]} count of ${Number(row.counted).toLocaleString()}`);
    res.status(204).end();
  });

  return r;
}
