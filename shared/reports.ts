// The 20 business reports. Run on the server (GET /api/reports/:id) from MySQL records.
import { batchCost, batchGoodUnits, cashbook, lineTotal, purchaseBalance, purchaseBilled, purchasePaid, purchaseTotal, saleBalance, saleCost, salePaid, saleTotal } from './calc';
import { categoryLabel, fmtDate, fmtDateTime, methodLabel, num } from './format';
import type { Db } from './types';

export type Cell = string | number;
export type Report = { columns: string[]; rows: Cell[][]; totals?: Cell[]; money?: number[]; note?: string };
export type Def = { id: string; title: string; group: string; dated?: boolean; build: (db: Db, from: string, to: string) => Report };

// Business day (YYYY-MM-DD) in the local time zone — Africa/Kampala on the server, the device's zone in the browser.
export const dayOf = (iso: string) => { if (iso.length === 10) return iso; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const inR = (iso: string, f: string, t: string) => { const d = dayOf(iso); return d >= f && d <= t; };
const sum = (rows: Cell[][], i: number) => rows.reduce((t, r) => t + (Number(r[i]) || 0), 0);
const weekOf = (iso: string) => { const d = new Date(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayOf(d.toISOString()); };

function salesGrouped(db: Db, f: string, t: string, key: (iso: string) => string, label: (k: string) => string): Report {
  const m = new Map<string, number[]>();
  db.sales.filter((s) => s.status === 'completed' && inR(s.date, f, t)).forEach((s) => {
    const k = key(s.date); const r = m.get(k) ?? [0, 0, 0, 0];
    r[0] += 1; r[1] += saleTotal(s); r[2] += salePaid(s); r[3] += saleBalance(s); m.set(k, r);
  });
  const rows = [...m.entries()].sort().map(([k, r]) => [label(k), ...r]);
  return { columns: ['Period', 'Invoices', 'Revenue', 'Collected', 'Still owed'], rows, totals: ['Total', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4)], money: [2, 3, 4] };
}

export const REPORTS: Def[] = [
  { id: 'daily', title: 'Daily sales report', group: 'Sales', dated: true, build: (db, f, t) => salesGrouped(db, f, t, dayOf, fmtDate) },
  { id: 'weekly', title: 'Weekly & monthly sales report', group: 'Sales', dated: true, build: (db, f, t) => salesGrouped(db, f, t, weekOf, (k) => `Week of ${fmtDate(k)}`) },
  { id: 'annual', title: 'Annual sales summary', group: 'Sales', dated: true, build: (db, f, t) => salesGrouped(db, f, t, (d) => dayOf(d).slice(0, 7), (k) => new Date(k + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })) },
  { id: 'salesperson', title: 'Salesperson performance', group: 'Sales', dated: true, build: (db, f, t) => {
    const m = new Map<string, number[]>();
    db.sales.filter((s) => s.status === 'completed' && inR(s.date, f, t)).forEach((s) => { const r = m.get(s.salesperson) ?? [0, 0, 0, 0]; r[0]++; r[1] += s.lines.reduce((x, l) => x + l.qty, 0); r[2] += saleTotal(s); r[3] += s.lines.reduce((x, l) => x + l.discount, 0); m.set(s.salesperson, r); });
    const rows = [...m.entries()].map(([k, r]) => [k, ...r]).sort((a, b) => Number(b[3]) - Number(a[3]));
    return { columns: ['Salesperson', 'Invoices', 'Units', 'Revenue', 'Discounts given'], rows, totals: ['Total', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4)], money: [3, 4] };
  } },
  { id: 'cust-history', title: 'Customer purchase history', group: 'Sales', dated: true, build: (db, f, t) => {
    const rows = db.sales.filter((s) => s.status === 'completed' && inR(s.date, f, t)).flatMap((s) => s.lines.map((l) => [fmtDate(s.date), s.invoice, s.customerName, l.name, l.qty, lineTotal(l)]));
    return { columns: ['Date', 'Invoice', 'Customer', 'Product', 'Qty', 'Amount'], rows, totals: ['Total', '', '', '', sum(rows, 4), sum(rows, 5)], money: [5] };
  } },
  { id: 'inv-balance', title: 'Inventory balance report', group: 'Inventory', build: (db) => {
    const rows = db.items.map((i) => [i.code, i.name, categoryLabel[i.category], `${num(i.qty, 2)} ${i.unit}`, num(i.min), i.location]);
    return { columns: ['Code', 'Item', 'Category', 'Balance', 'Min level', 'Location'], rows };
  } },
  { id: 'movements', title: 'Stock movement report', group: 'Inventory', dated: true, build: (db, f, t) => {
    const rows = db.movements.filter((m) => inR(m.date, f, t)).map((m) => [fmtDateTime(m.date), db.items.find((i) => i.id === m.itemId)?.name ?? '', m.type, m.qty, m.ref, m.user]);
    return { columns: ['Date', 'Item', 'Movement', 'Qty', 'Source', 'By'], rows };
  } },
  { id: 'low', title: 'Low-stock report', group: 'Inventory', build: (db) => {
    const rows = db.items.filter((i) => i.qty <= i.min).map((i) => [i.code, i.name, num(i.qty, 2), num(i.min), num(Math.max(0, i.min * 2 - i.qty)), i.unit]);
    return { columns: ['Code', 'Item', 'In stock', 'Min level', 'Suggested reorder', 'Unit'], rows, note: 'Suggested reorder brings stock back to twice the minimum level.' };
  } },
  { id: 'expiry', title: 'Expiring and expired stock', group: 'Inventory', build: (db) => {
    const soon = new Date(); soon.setDate(soon.getDate() + db.settings.expiryAlertDays);
    const rows = db.items.flatMap((i) => i.lots.filter((l) => l.expiry && new Date(l.expiry) <= soon).map((l) => [i.name, l.lotNo, fmtDate(l.expiry), l.qty, new Date(l.expiry!) < new Date() ? 'EXPIRED' : `${Math.ceil((new Date(l.expiry!).getTime() - Date.now()) / 864e5)} days left`, l.qty * i.cost]));
    return { columns: ['Item', 'Lot', 'Expiry', 'Qty', 'Status', 'Value at cost'], rows, totals: ['Total', '', '', sum(rows, 3), '', sum(rows, 5)], money: [5], note: `Lots expiring within ${db.settings.expiryAlertDays} days.` };
  } },
  { id: 'valuation', title: 'Inventory valuation report', group: 'Inventory', build: (db) => {
    const rows = db.items.map((i) => [i.code, i.name, categoryLabel[i.category], num(i.qty, 2), Math.round(i.cost), Math.round(Math.max(0, i.qty) * i.cost)]);
    return { columns: ['Code', 'Item', 'Category', 'Qty', 'Avg unit cost', 'Value'], rows, totals: ['Total', '', '', '', '', sum(rows, 5)], money: [4, 5], note: 'Valued at weighted-average cost: each receipt re-averages the unit cost; issues use the current average.' };
  } },
  { id: 'wastage', title: 'Damaged goods and wastage', group: 'Inventory', dated: true, build: (db, f, t) => {
    const rows: Cell[][] = db.movements.filter((m) => ['Damaged', 'Expired'].includes(m.type) && inR(m.date, f, t)).map((m) => { const i = db.items.find((x) => x.id === m.itemId)!; return [fmtDate(m.date), i.name, m.type, -m.qty, m.note ?? '', Math.round(-m.qty * i.cost)]; });
    db.batches.forEach((b) => { if (inR(b.startDate, f, t)) { b.outputs.filter((o) => o.rejected).forEach((o) => rows.push([fmtDate(b.bottlingDate ?? b.startDate), db.items.find((i) => i.id === o.itemId)!.name, `Rejected at bottling (${b.batchNo})`, o.rejected, '', 0])); if (b.status === 'rejected') rows.push([fmtDate(b.startDate), `Batch ${b.batchNo}`, 'Rejected batch', `${b.expectedLitres} L`, b.qcNotes ?? '', batchCost(b)]); } });
    return { columns: ['Date', 'Item', 'Type', 'Qty', 'Reason', 'Cost lost'], rows, totals: ['Total', '', '', '', '', sum(rows, 5)], money: [5] };
  } },
  { id: 'batches', title: 'Production batch report', group: 'Production', dated: true, build: (db, f, t) => {
    const rows = db.batches.filter((b) => inR(b.startDate, f, t)).map((b) => [b.batchNo, fmtDate(b.startDate), b.status.replace('_', ' '), b.expectedLitres, batchGoodUnits(b), b.lossLitres, batchCost(b), batchGoodUnits(b) ? Math.round(batchCost(b) / batchGoodUnits(b)) : 0]);
    return { columns: ['Batch', 'Started', 'Status', 'Expected (L)', 'Good units', 'Loss (L)', 'Batch cost', 'Cost / unit'], rows, totals: ['Total', '', '', sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6), ''], money: [6, 7] };
  } },
  { id: 'consumption', title: 'Raw-material consumption', group: 'Production', dated: true, build: (db, f, t) => {
    const m = new Map<number, number[]>();
    db.batches.filter((b) => inR(b.startDate, f, t)).forEach((b) => b.materials.forEach((x) => { const r = m.get(x.itemId) ?? [0, 0]; r[0] += x.qty; r[1] += x.qty * x.cost; m.set(x.itemId, r); }));
    const rows = [...m.entries()].map(([id, r]) => { const i = db.items.find((x) => x.id === id)!; return [i.name, categoryLabel[i.category], `${num(r[0], 2)} ${i.unit}`, Math.round(r[1])]; });
    return { columns: ['Material', 'Category', 'Quantity used', 'Cost'], rows, totals: ['Total', '', '', sum(rows, 3)], money: [3] };
  } },
  { id: 'purchases', title: 'Purchase report', group: 'Purchases & finance', dated: true, build: (db, f, t) => {
    const rows = db.purchases.filter((p) => inR(p.date, f, t)).map((p) => [p.po, fmtDate(p.date), db.suppliers.find((s) => s.id === p.supplierId)?.name ?? '', p.status, purchaseTotal(p), purchaseBilled(p), purchasePaid(p)]);
    return { columns: ['PO', 'Date', 'Supplier', 'Status', 'Ordered', 'Received value', 'Paid'], rows, totals: ['Total', '', '', '', sum(rows, 4), sum(rows, 5), sum(rows, 6)], money: [4, 5, 6] };
  } },
  { id: 'payables', title: 'Supplier payable report', group: 'Purchases & finance', build: (db) => {
    const rows = db.suppliers.map((s) => { const ps = db.purchases.filter((p) => p.supplierId === s.id); return [s.name, s.phone, ps.reduce((t, p) => t + purchaseBilled(p), 0), ps.reduce((t, p) => t + purchasePaid(p), 0), ps.reduce((t, p) => t + Math.max(0, purchaseBalance(p)), 0)]; }).filter((r) => Number(r[4]) > 0);
    return { columns: ['Supplier', 'Phone', 'Goods received', 'Paid', 'Owed'], rows, totals: ['Total', '', sum(rows, 2), sum(rows, 3), sum(rows, 4)], money: [2, 3, 4] };
  } },
  { id: 'debts', title: 'Customer debt report (by age)', group: 'Purchases & finance', build: (db) => {
    const m = new Map<string, number[]>();
    db.sales.forEach((s) => { const bal = saleBalance(s); if (bal <= 0) return; const days = (Date.now() - new Date(s.dueDate ?? s.date).getTime()) / 864e5; const r = m.get(s.customerName) ?? [0, 0, 0, 0, 0]; r[days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3] += bal; r[4] += bal; m.set(s.customerName, r); });
    const rows = [...m.entries()].map(([k, r]) => [k, ...r]).sort((a, b) => Number(b[5]) - Number(a[5]));
    return { columns: ['Customer', 'Not yet due', '1–30 days', '31–60 days', '60+ days', 'Total owed'], rows, totals: ['Total', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4), sum(rows, 5)], money: [1, 2, 3, 4, 5] };
  } },
  { id: 'expenses', title: 'Expense report', group: 'Purchases & finance', dated: true, build: (db, f, t) => {
    const m = new Map<string, number[]>();
    db.expenses.filter((e) => e.status === 'active' && inR(e.date, f, t)).forEach((e) => { const r = m.get(e.category) ?? [0, 0]; r[0]++; r[1] += e.amount; m.set(e.category, r); });
    const rows = [...m.entries()].map(([k, r]) => [k, ...r]).sort((a, b) => Number(b[2]) - Number(a[2]));
    return { columns: ['Category', 'Entries', 'Amount'], rows, totals: ['Total', sum(rows, 1), sum(rows, 2)], money: [2] };
  } },
  { id: 'cashbook', title: 'Cashbook & cash reconciliation', group: 'Purchases & finance', dated: true, build: (db, f, t) => {
    const book = cashbook(db);
    const rows = (['cash', 'mobile_money', 'bank'] as const).map((m) => {
      const lines = book.filter((c) => c.method === m);
      const val = (c: typeof lines[0]) => (c.direction === 'in' ? c.amount : -c.amount);
      const opening = lines.filter((c) => dayOf(c.date) < f).reduce((s, c) => s + val(c), 0);
      const inP = lines.filter((c) => inR(c.date, f, t));
      const ins = inP.filter((c) => c.direction === 'in').reduce((s, c) => s + c.amount, 0);
      const outs = inP.filter((c) => c.direction === 'out').reduce((s, c) => s + c.amount, 0);
      return [methodLabel[m], opening, ins, outs, opening + ins - outs];
    });
    return { columns: ['Account', 'Opening', 'Money in', 'Money out', 'Closing'], rows, totals: ['Total', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4)], money: [1, 2, 3, 4], note: 'Compare closing balances with physical counts on the Finance → Reconciliation tab.' };
  } },
  { id: 'profitability', title: 'Product profitability', group: 'Profit', dated: true, build: (db, f, t) => {
    const m = new Map<string, number[]>();
    db.sales.filter((s) => s.status === 'completed' && inR(s.date, f, t)).forEach((s) => s.lines.forEach((l) => { const r = m.get(l.name) ?? [0, 0, 0, 0]; r[0] += l.qty; r[1] += lineTotal(l); r[2] += l.qty * l.cost; r[3] += l.discount; m.set(l.name, r); }));
    const rows = [...m.entries()].map(([k, [q, rev, cost, disc]]) => [k, q, Math.round(rev / q), Math.round(cost / q), Math.round((rev - cost) / q), rev, Math.round(rev - cost), `${rev ? Math.round((rev - cost) / rev * 100) : 0}%`, disc]);
    return { columns: ['Product', 'Units', 'Avg price', 'Unit cost', 'Profit / unit', 'Revenue', 'Gross profit', 'Margin', 'Discounts'], rows, totals: ['Total', sum(rows, 1), '', '', '', sum(rows, 5), sum(rows, 6), '', sum(rows, 8)], money: [2, 3, 4, 5, 6, 8], note: 'Unit cost = materials + packaging consumed by the batch ÷ good units produced (weighted average).' };
  } },
  { id: 'pnl', title: 'Profit and loss statement', group: 'Profit', dated: true, build: (db, f, t) => {
    const sales = db.sales.filter((s) => s.status === 'completed' && inR(s.date, f, t));
    const rev = sales.reduce((x, s) => x + saleTotal(s), 0);
    const cogs = Math.round(sales.reduce((x, s) => x + saleCost(s), 0));
    const exp = new Map<string, number>();
    db.expenses.filter((e) => e.status === 'active' && inR(e.date, f, t)).forEach((e) => exp.set(e.category, (exp.get(e.category) ?? 0) + e.amount));
    const totalExp = [...exp.values()].reduce((a, b) => a + b, 0);
    const rows: Cell[][] = [['Sales revenue', rev], ['Less: cost of wine sold', -cogs], ['GROSS PROFIT', rev - cogs], ...[...exp.entries()].map(([k, v]) => [`  ${k}`, -v]), ['Total operating expenses', -totalExp]];
    return { columns: ['Line', 'Amount'], rows, totals: ['NET PROFIT (ESTIMATE)', rev - cogs - totalExp], money: [1], note: 'Management estimate on an accrual basis (credit sales count as revenue when invoiced). Not audited financial statements.' };
  } },
];


export const REPORT_LIST = REPORTS.map(({ id, title, group, dated }) => ({ id, title, group, dated: !!dated }));

export function runReport(db: Db, id: string, from: string, to: string) {
  const def = REPORTS.find((r) => r.id === id);
  if (!def) return null;
  return { id: def.id, title: def.title, dated: !!def.dated, from, to, ...def.build(db, from, to) };
}
