import type { Purchase } from '../../../shared/types';
import { purchasePaid, purchaseTotal } from '../../../shared/calc';
import type { Db, Tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import { EPS, audit, iso, nextNumber, opt, round } from '../lib/util';
import { stockIn } from './stock';

type Conn = Db | Tx;
type Method = 'cash' | 'mobile_money' | 'bank';

export async function loadPurchases(db: Conn, ids?: number[]): Promise<Purchase[]> {
  const q = db('purchases').orderBy('date').orderBy('id');
  if (ids) q.whereIn('id', ids);
  const rows = await q;
  if (!rows.length) return [];
  const pids = rows.map((r) => r.id);
  const [lines, pays] = await Promise.all([
    db('purchase_lines').whereIn('purchase_id', pids).orderBy('id'),
    db('purchase_payments').whereIn('purchase_id', pids).orderBy('date').orderBy('id'),
  ]);
  return rows.map((p) => ({
    id: p.id, po: p.po, supplierId: p.supplier_id, supplierInvoice: opt(p.supplier_invoice), date: iso(p.date)!,
    transport: Number(p.transport), status: p.status,
    lines: lines.filter((l) => l.purchase_id === p.id).map((l) => ({ itemId: l.item_id, qty: Number(l.qty), cost: Number(l.cost), received: Number(l.received) })),
    payments: pays.filter((x) => x.purchase_id === p.id).map((x) => ({ id: x.id, date: iso(x.date)!, amount: Number(x.amount), method: x.method, voided: !!x.voided_at, voidReason: opt(x.void_reason) })),
  }));
}

const one = async (db: Conn, id: number) => {
  const [p] = await loadPurchases(db, [id]);
  if (!p) throw notFound('Purchase order');
  return p;
};

export async function createPurchase(db: Db, user: string, b: { supplierId: number; supplierInvoice?: string; transport: number; date?: string; lines: { itemId: number; qty: number; cost: number }[] }) {
  const id = await db.transaction(async (trx) => {
    const supplier = await trx('suppliers').where({ id: b.supplierId }).first();
    if (!supplier) throw badRequest('Choose a supplier.');
    for (const l of b.lines) if (!(await trx('items').where({ id: l.itemId }).first())) throw badRequest('An item on this order no longer exists.');
    const po = await nextNumber(trx, 'PO', 4);
    const [pid] = await trx('purchases').insert({ po, supplier_id: supplier.id, supplier_invoice: b.supplierInvoice?.trim() || null, date: b.date ? new Date(b.date) : new Date(), transport: b.transport, status: 'ordered' });
    await trx('purchase_lines').insert(b.lines.map((l) => ({ purchase_id: pid, item_id: l.itemId, qty: l.qty, cost: l.cost })));
    await audit(trx, user, 'Purchase order created', `${po} — ${supplier.name}`);
    return pid;
  });
  return one(db, id);
}

// Goods only enter stock here, never when the order is created.
// Landed unit cost = price + this line's share of transport (shared by order value).
export async function receivePurchase(db: Db, user: string, id: number, qtys: number[]) {
  await db.transaction(async (trx) => {
    const row = await trx('purchases').where({ id }).forUpdate().first();
    if (!row) throw notFound('Purchase order');
    if (row.status === 'cancelled') throw conflict('This order was cancelled.');
    if (row.status === 'received') throw conflict('Everything on this order has already been received.');
    const lines = await trx('purchase_lines').where({ purchase_id: id }).orderBy('id');
    if (qtys.length !== lines.length) throw badRequest('Enter a received quantity for each line.');
    const goods = lines.reduce((t, l) => t + Number(l.qty) * Number(l.cost), 0) || 1;
    let any = false;
    for (const [i, l] of lines.entries()) {
      const q = qtys[i] ?? 0;
      if (q < 0) throw badRequest('Received quantity cannot be negative.');
      if (q > Number(l.qty) - Number(l.received) + EPS) throw badRequest('You cannot receive more than was ordered.');
      if (q <= 0) continue;
      any = true;
      const lineQty = Number(l.qty);
      const landed = Number(l.cost) + (Number(row.transport) * ((lineQty * Number(l.cost)) / goods)) / lineQty;
      await trx('purchase_lines').where({ id: l.id }).update({ received: round(Number(l.received) + q) });
      await stockIn(trx, { itemId: l.item_id, qty: q, unitCost: landed, type: 'Purchase received', ref: row.po, user });
    }
    if (!any) throw badRequest('Enter at least one received quantity.');
    const after = await trx('purchase_lines').where({ purchase_id: id });
    const status = after.every((l) => Number(l.received) >= Number(l.qty) - EPS) ? 'received' : 'partial';
    await trx('purchases').where({ id }).update({ status });
    await audit(trx, user, 'Goods received', `${row.po} — ${status}`);
  });
  return one(db, id);
}

export async function payPurchase(db: Db, user: string, id: number, amount: number, method: Method) {
  await db.transaction(async (trx) => {
    const row = await trx('purchases').where({ id }).forUpdate().first();
    if (!row) throw notFound('Purchase order');
    if (row.status === 'cancelled') throw conflict('This order was cancelled.');
    const p = await one(trx, id);
    const left = purchaseTotal(p) - purchasePaid(p);
    if (amount > left) throw badRequest(`Payment is more than the order value outstanding (${left.toLocaleString()}).`);
    await trx('purchase_payments').insert({ purchase_id: id, date: new Date(), amount, method });
    await audit(trx, user, 'Supplier payment', `${p.po} — ${amount.toLocaleString()} via ${method}`);
  });
  return one(db, id);
}

export async function updatePurchase(db: Db, user: string, id: number, b: { supplierId: number; supplierInvoice?: string; transport: number; lines: { itemId: number; qty: number; cost: number }[] }) {
  await db.transaction(async (trx) => {
    const row = await trx('purchases').where({ id }).forUpdate().first();
    if (!row) throw notFound('Purchase order');
    const received = await trx('purchase_lines').where({ purchase_id: id }).andWhere('received', '>', 0).first();
    const paid = await trx('purchase_payments').where({ purchase_id: id }).whereNull('voided_at').first();
    if (row.status !== 'ordered' || received || paid) throw conflict('Only orders with nothing received or paid can be edited.');
    if (!(await trx('suppliers').where({ id: b.supplierId }).first())) throw badRequest('Choose a supplier.');
    for (const l of b.lines) if (!(await trx('items').where({ id: l.itemId }).first())) throw badRequest('An item on this order no longer exists.');
    await trx('purchases').where({ id }).update({ supplier_id: b.supplierId, supplier_invoice: b.supplierInvoice?.trim() || null, transport: b.transport });
    await trx('purchase_lines').where({ purchase_id: id }).delete();
    await trx('purchase_lines').insert(b.lines.map((l) => ({ purchase_id: id, item_id: l.itemId, qty: l.qty, cost: l.cost })));
    await audit(trx, user, 'Purchase order edited', row.po);
  });
  return one(db, id);
}

export async function voidPurchasePayment(db: Db, user: string, id: number, paymentId: number, reason: string) {
  await db.transaction(async (trx) => {
    const row = await trx('purchases').where({ id }).forUpdate().first();
    if (!row) throw notFound('Purchase order');
    const p = await trx('purchase_payments').where({ id: paymentId, purchase_id: id }).first();
    if (!p) throw notFound('Payment');
    if (p.voided_at) throw conflict('This payment is already voided.');
    await trx('purchase_payments').where({ id: p.id }).update({ voided_at: new Date(), void_reason: reason });
    await audit(trx, user, 'Supplier payment voided', `${row.po} — ${Number(p.amount).toLocaleString()} — ${reason}`);
  });
  return one(db, id);
}

export async function cancelPurchase(db: Db, user: string, id: number) {
  await db.transaction(async (trx) => {
    const row = await trx('purchases').where({ id }).forUpdate().first();
    if (!row) throw notFound('Purchase order');
    const received = await trx('purchase_lines').where({ purchase_id: id }).andWhere('received', '>', 0).first();
    const paid = await trx('purchase_payments').where({ purchase_id: id }).whereNull('voided_at').first();
    if (row.status === 'cancelled') throw conflict('This order is already cancelled.');
    if (received || paid) throw conflict('Only orders with nothing received or paid can be cancelled.');
    await trx('purchases').where({ id }).update({ status: 'cancelled' });
    await audit(trx, user, 'Purchase cancelled', row.po);
  });
  return one(db, id);
}
