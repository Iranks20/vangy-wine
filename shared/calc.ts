// Derived figures. Balances are always calculated from records, never stored.
import type { Batch, Db, Method, Purchase, Sale, SaleLine } from './types';

export const lineTotal = (l: SaleLine) => l.qty * l.price - l.discount;
export const saleTotal = (s: Sale) => s.lines.reduce((t, l) => t + lineTotal(l), 0);
export const salePaid = (s: Sale) => s.payments.reduce((t, p) => t + p.amount, 0);
export const saleBalance = (s: Sale) => (s.status === 'cancelled' ? 0 : saleTotal(s) - salePaid(s));
export const saleCost = (s: Sale) => s.lines.reduce((t, l) => t + l.qty * l.cost, 0);
export const saleStatus = (s: Sale) =>
  s.status === 'cancelled' ? 'Cancelled' : saleBalance(s) <= 0 ? 'Paid' : salePaid(s) > 0 ? 'Partial' : 'Credit';

export const purchaseTotal = (p: Purchase) => p.lines.reduce((t, l) => t + l.qty * l.cost, 0) + p.transport;
export const purchaseBilled = (p: Purchase) =>
  p.status === 'cancelled' ? 0 :
  p.lines.reduce((t, l) => t + l.received * l.cost, 0) + (p.lines.some((l) => l.received > 0) ? p.transport : 0);
export const purchasePaid = (p: Purchase) => p.payments.reduce((t, x) => t + x.amount, 0);
export const purchaseBalance = (p: Purchase) => purchaseBilled(p) - purchasePaid(p);

export const batchCost = (b: Batch) => b.materials.reduce((t, m) => t + m.qty * m.cost, 0);
export const batchGoodUnits = (b: Batch) => b.outputs.reduce((t, o) => t + o.good, 0);

export interface CashLine { id: string; date: string; direction: 'in' | 'out'; amount: number; method: Method; description: string; category: string; ref: string }

// Every movement of money, from the records that caused it (no double entry).
export function cashbook(db: Pick<Db, 'sales' | 'purchases' | 'suppliers' | 'expenses' | 'cash'>): CashLine[] {
  const out: CashLine[] = [];
  db.sales.forEach((s) => {
    s.payments.forEach((p) => out.push({ id: `s${s.id}-${p.id}`, date: p.date, direction: 'in', amount: p.amount, method: p.method, description: `Receipt from ${s.customerName}`, category: 'Customer receipt', ref: p.receiptNo ?? s.invoice }));
    if (s.status === 'cancelled' && salePaid(s) > 0)
      out.push({ id: `r${s.id}`, date: s.cancelledAt ?? s.date, direction: 'out', amount: salePaid(s), method: s.payments[0].method, description: `Refund — ${s.invoice} cancelled`, category: 'Refund', ref: s.invoice });
  });
  db.purchases.forEach((p) => p.payments.forEach((x) => out.push({ id: `p${p.id}-${x.id}`, date: x.date, direction: 'out', amount: x.amount, method: x.method, description: `Payment to ${db.suppliers.find((s) => s.id === p.supplierId)?.name ?? 'supplier'}`, category: 'Supplier payment', ref: p.po })));
  db.expenses.filter((e) => e.status === 'active').forEach((e) => out.push({ id: `e${e.id}`, date: e.date, direction: 'out', amount: e.amount, method: e.method, description: e.description, category: `Expense — ${e.category}`, ref: e.ref }));
  db.cash.forEach((c) => out.push({ id: `c${c.id}`, date: c.date, direction: c.direction, amount: c.amount, method: c.method, description: c.description, category: c.category, ref: `CB-${c.id}` }));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const accountBalance = (book: CashLine[], m: Method) =>
  book.filter((c) => c.method === m).reduce((t, c) => t + (c.direction === 'in' ? c.amount : -c.amount), 0);
