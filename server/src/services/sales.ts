import type { Sale } from '../../../shared/types';
import { saleBalance, saleTotal } from '../../../shared/calc';
import type { Db, Tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import { audit, iso, nextNumber, opt } from '../lib/util';
import { getSettings } from '../routes/settings';
import { stockIn, stockOut } from './stock';

type Conn = Db | Tx;
type Method = 'cash' | 'mobile_money' | 'bank';

export interface NewSaleInput {
  date: string; customerId?: number | null; customerName?: string; customerPhone?: string; salesperson?: string;
  lines: { itemId: number; qty: number; price: number; discount: number }[];
  paid: number; method: Method | 'credit'; paymentRef?: string; delivery?: string; notes?: string; idemKey?: string;
}

// YYYY-MM-DD in the server's business time zone (Africa/Kampala).
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export async function loadSales(db: Conn, ids?: number[]): Promise<Sale[]> {
  const q = db('sales').orderBy('date').orderBy('id');
  if (ids) q.whereIn('id', ids);
  const rows = await q;
  if (!rows.length) return [];
  const saleIds = rows.map((r) => r.id);
  const [lines, pays] = await Promise.all([
    db('sale_lines').whereIn('sale_id', saleIds).orderBy('id'),
    db('payments').whereIn('sale_id', saleIds).orderBy('date').orderBy('id'),
  ]);
  return rows.map((s) => ({
    id: s.id, invoice: s.invoice, date: iso(s.date)!, customerId: opt(s.customer_id), customerName: s.customer_name,
    customerPhone: opt(s.customer_phone), salesperson: s.salesperson, delivery: opt(s.delivery), notes: opt(s.notes),
    status: s.status, dueDate: opt(s.due_date), cancelledAt: iso(s.cancelled_at),
    lines: lines.filter((l) => l.sale_id === s.id).map((l) => ({ itemId: l.item_id, name: l.name, qty: Number(l.qty), price: Number(l.price), discount: Number(l.discount), cost: Number(l.cost) })),
    payments: pays.filter((p) => p.sale_id === s.id).map((p) => ({ id: p.id, date: iso(p.date)!, amount: Number(p.amount), method: p.method, ref: opt(p.ref), receiptNo: p.receipt_no })),
  }));
}

async function loadSale(db: Conn, id: number) {
  const [s] = await loadSales(db, [id]);
  if (!s) throw notFound('Sale');
  return s;
}

export async function createSale(db: Db, user: string, input: NewSaleInput) {
  if (input.idemKey) {
    const dup = await db('sales').where({ idem_key: input.idemKey }).first();
    if (dup) return { sale: await loadSale(db, dup.id), duplicate: true };
  }
  const settings = await getSettings(db);
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw badRequest('Sale date is not valid.');
  if (date.getTime() > Date.now() + 5 * 60_000) throw badRequest('Sale date cannot be in the future.');

  const id = await db.transaction(async (trx) => {
    const customer = input.customerId ? await trx('customers').where({ id: input.customerId }).first() : null;
    if (input.customerId && !customer) throw badRequest('That customer no longer exists.');

    const total = input.lines.reduce((t, l) => t + l.qty * l.price - l.discount, 0);
    for (const l of input.lines) if (l.discount > l.qty * l.price) throw badRequest('A discount cannot be more than the line value.');
    if (!Number.isInteger(Math.round(total * 1000) / 1000) || total < 0) throw badRequest('The sale total is not valid.');
    const paid = input.method === 'credit' ? 0 : input.paid;
    if (paid > total) throw badRequest('Amount paid cannot be more than the total.');
    if (paid < total && !customer) throw badRequest('Credit or part-payment needs a registered customer, so the debt can be tracked.');

    const invoice = await nextNumber(trx, settings.invoicePrefix, 5);
    const [saleId] = await trx('sales').insert({
      invoice, date, customer_id: customer?.id ?? null,
      customer_name: customer?.name ?? (input.customerName?.trim() || 'Walk-in customer'),
      customer_phone: customer?.phone || input.customerPhone?.trim() || null,
      salesperson: input.salesperson?.trim() || user, delivery: input.delivery?.trim() || null, notes: input.notes?.trim() || null,
      status: 'completed', due_date: localDay(addDays(date, customer?.terms ?? 0)), idem_key: input.idemKey ?? null,
    });

    for (const l of input.lines) {
      const item = await trx('items').where({ id: l.itemId }).first();
      if (!item) throw badRequest('A product on this sale no longer exists.');
      if (item.category !== 'finished') throw badRequest(`${item.name} is not a finished product and cannot be sold.`);
      const cost = await stockOut(trx, { itemId: item.id, qty: l.qty, type: 'Sale', ref: invoice, user, allowOversell: settings.allowOversell, at: date });
      await trx('sale_lines').insert({ sale_id: saleId, item_id: item.id, name: item.name, qty: l.qty, price: l.price, discount: l.discount, cost });
    }

    if (paid > 0) {
      const receiptNo = await nextNumber(trx, 'RCT', 5);
      await trx('payments').insert({ receipt_no: receiptNo, sale_id: saleId, date, amount: paid, method: input.method, ref: input.paymentRef?.trim() || null });
    }
    await audit(trx, user, 'Sale recorded', `${invoice} — ${customer?.name ?? input.customerName ?? 'Walk-in customer'} — ${total.toLocaleString()}`);
    return saleId;
  });
  return { sale: await loadSale(db, id), duplicate: false };
}

export async function addPayment(db: Db, user: string, saleId: number, p: { amount: number; method: Method; ref?: string; idemKey?: string }) {
  if (p.idemKey) {
    const dup = await db('payments').where({ idem_key: p.idemKey }).first();
    if (dup) return dup.receipt_no as string;
  }
  return db.transaction(async (trx) => {
    const row = await trx('sales').where({ id: saleId }).forUpdate().first(); // serialises payments on one invoice
    if (!row) throw notFound('Sale');
    if (row.status === 'cancelled') throw conflict('This sale was cancelled; it cannot take payments.');
    const sale = await loadSale(trx, saleId);
    const balance = saleBalance(sale);
    if (p.amount > balance) throw badRequest(`Payment is more than the balance owed (${balance.toLocaleString()}).`);
    const receiptNo = await nextNumber(trx, 'RCT', 5);
    await trx('payments').insert({ receipt_no: receiptNo, sale_id: saleId, date: new Date(), amount: p.amount, method: p.method, ref: p.ref?.trim() || null, idem_key: p.idemKey ?? null });
    await audit(trx, user, 'Payment received', `${receiptNo} for ${sale.invoice} — ${p.amount.toLocaleString()} via ${p.method}`);
    return receiptNo;
  });
}

export async function cancelSale(db: Db, user: string, saleId: number, reason: string) {
  await db.transaction(async (trx) => {
    const row = await trx('sales').where({ id: saleId }).forUpdate().first();
    if (!row) throw notFound('Sale');
    if (row.status === 'cancelled') throw conflict('This sale is already cancelled.');
    const sale = await loadSale(trx, saleId);
    for (const l of sale.lines) {
      await stockIn(trx, { itemId: l.itemId, qty: l.qty, unitCost: l.cost, type: 'Sale cancelled — restocked', ref: sale.invoice, user, lotNo: `${sale.invoice}-RET` });
    }
    const notes = [row.notes, `Cancelled: ${reason}`].filter(Boolean).join(' | ');
    await trx('sales').where({ id: saleId }).update({ status: 'cancelled', cancelled_at: new Date(), notes });
    await audit(trx, user, 'Sale cancelled', `${sale.invoice} — ${reason}${saleTotal(sale) ? ` — refund ${sale.payments.reduce((t, x) => t + x.amount, 0).toLocaleString()}` : ''}`);
  });
}

export async function updateSaleDetails(db: Db, user: string, saleId: number, d: { salesperson?: string; delivery?: string; notes?: string; customerPhone?: string }) {
  const row = await db('sales').where({ id: saleId }).first();
  if (!row) throw notFound('Sale');
  await db('sales').where({ id: saleId }).update({
    salesperson: d.salesperson?.trim() || row.salesperson, delivery: d.delivery?.trim() || null,
    notes: d.notes?.trim() || null, customer_phone: d.customerPhone?.trim() || row.customer_phone,
  });
  await audit(db, user, 'Sale details edited', row.invoice);
}
