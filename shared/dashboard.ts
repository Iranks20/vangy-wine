// Dashboard figures, calculated on the server (GET /api/dashboard) from the database records.
import { batchGoodUnits, cashbook, purchaseTotal, saleBalance, saleCost, saleStatus, saleTotal } from './calc';
import { dayOf } from './reports';
import type { Db } from './types';

export type Range = 'today' | 'week' | 'month' | 'year' | 'custom';

const startOf = (r: Exclude<Range, 'custom'>, now: Date) => {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (r === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // weeks start on Monday
  if (r === 'month') d.setDate(1);
  if (r === 'year') d.setMonth(0, 1);
  return d;
};

export function computeDashboard(db: Db, range: Range, from?: string, to?: string, now = new Date()) {
  let start: Date, end: Date;
  if (range === 'custom' && from && to) {
    start = new Date(from + 'T00:00:00');
    end = new Date(to + 'T00:00:00'); end.setDate(end.getDate() + 1);
  } else {
    start = startOf(range === 'custom' ? 'month' : range, now);
    end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  }
  const inRange = (iso: string) => { const t = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return t >= start && t < end; };

  const live = db.sales.filter((s) => s.status === 'completed');
  const salesIn = live.filter((s) => inRange(s.date));
  const since = (d: Date) => live.filter((s) => new Date(s.date) >= d).reduce((t, s) => t + saleTotal(s), 0);

  const revenue = salesIn.reduce((t, s) => t + saleTotal(s), 0);
  const cogs = salesIn.reduce((t, s) => t + saleCost(s), 0);
  // Money collected from customers, less refunds on cancelled sales.
  const book = cashbook(db).filter((c) => inRange(c.date));
  const cashIn = book.filter((c) => c.category === 'Customer receipt').reduce((t, c) => t + c.amount, 0)
    - book.filter((c) => c.category === 'Refund').reduce((t, c) => t + c.amount, 0);
  const expenses = db.expenses.filter((e) => e.status === 'active' && inRange(e.date));
  const expTotal = expenses.reduce((t, e) => t + e.amount, 0);
  const gross = revenue - cogs;

  const soon = new Date(now); soon.setDate(soon.getDate() + db.settings.expiryAlertDays);
  const expiring = db.items.flatMap((i) => i.lots.filter((l) => l.expiry && new Date(l.expiry) <= soon)
    .map((l) => ({ itemId: i.id, itemName: i.name, lotNo: l.lotNo, qty: l.qty, expiry: l.expiry!, expired: new Date(l.expiry!) < now })));

  const bestMap = new Map<string, { name: string; qty: number; revenue: number }>();
  salesIn.forEach((s) => s.lines.forEach((l) => {
    const r = bestMap.get(l.name) ?? { name: l.name, qty: 0, revenue: 0 };
    r.qty += l.qty; r.revenue += l.qty * l.price - l.discount; bestMap.set(l.name, r);
  }));

  // Daily bars for up to two months, monthly bars beyond that.
  const monthly = (end.getTime() - start.getTime()) / 864e5 > 62;
  const key = (iso: string) => (monthly ? dayOf(iso).slice(0, 7) : dayOf(iso));
  const trendMap = new Map<string, { key: string; Sales: number; Expenses: number }>();
  for (const cur = new Date(start); cur < end && cur <= now; cur.setDate(cur.getDate() + 1)) {
    const k = key(cur.toISOString());
    if (!trendMap.has(k)) trendMap.set(k, { key: k, Sales: 0, Expenses: 0 });
  }
  salesIn.forEach((s) => { const r = trendMap.get(key(s.date)); if (r) r.Sales += saleTotal(s); });
  expenses.forEach((e) => { const r = trendMap.get(key(e.date)); if (r) r.Expenses += e.amount; });

  const supplier = (id: number) => db.suppliers.find((s) => s.id === id)?.name ?? '';
  return {
    range, from: dayOf(start.toISOString()), to: dayOf(new Date(end.getTime() - 1).toISOString()), monthly,
    periods: { today: since(startOf('today', now)), week: since(startOf('week', now)), month: since(startOf('month', now)), year: since(startOf('year', now)) },
    revenue, invoices: salesIn.length, cogs, cashIn,
    receivables: live.reduce((t, s) => t + saleBalance(s), 0),
    expenses: expTotal, expenseCount: expenses.length,
    grossProfit: gross, netProfit: gross - expTotal,
    stockValue: db.items.reduce((t, i) => t + Math.max(0, i.qty) * i.cost, 0),
    produced: db.batches.filter((b) => b.status === 'released' && b.bottlingDate && inRange(b.bottlingDate)).reduce((t, b) => t + batchGoodUnits(b), 0),
    finished: db.items.filter((i) => i.category === 'finished').map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, min: i.min, value: Math.max(0, i.qty) * i.cost })),
    lowStock: db.items.filter((i) => i.qty <= i.min).map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, min: i.min })),
    expiring,
    best: [...bestMap.values()].sort((a, b) => b.revenue - a.revenue),
    trend: [...trendMap.values()],
    recentSales: [...db.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
      .map((s) => ({ id: s.id, invoice: s.invoice, customerName: s.customerName, date: s.date, total: saleTotal(s), status: saleStatus(s) })),
    recentPurchases: [...db.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
      .map((p) => ({ id: p.id, po: p.po, supplier: supplier(p.supplierId), date: p.date, total: purchaseTotal(p), status: p.status })),
  };
}

export type DashboardData = ReturnType<typeof computeDashboard>;
