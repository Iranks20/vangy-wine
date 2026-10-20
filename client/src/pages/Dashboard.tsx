import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, Boxes, CalendarClock, Factory, HandCoins, Receipt, TrendingUp, Wine } from 'lucide-react';
import { batchGoodUnits, cashbook, purchaseTotal, saleBalance, saleCost, saleStatus, saleTotal, useStore } from '../lib/store';
import { fmtDate, num, shortUgx, ugx } from '../lib/format';
import { Badge, Card, Empty, Input, PageHeader, Stat, Tabs } from '../components/ui';

type Range = 'today' | 'week' | 'month' | 'year' | 'custom';

const startOf = (r: Exclude<Range, 'custom'>) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (r === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (r === 'month') d.setDate(1);
  if (r === 'year') d.setMonth(0, 1);
  return d;
};

export default function Dashboard() {
  const { db, user } = useStore();
  const [range, setRange] = useState<Range>('month');
  const [from, setFrom] = useState(() => startOf('month').toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [start, end] = useMemo(() => {
    if (range !== 'custom') return [startOf(range), new Date(Date.now() + 864e5)];
    const e = new Date(to + 'T00:00:00'); e.setDate(e.getDate() + 1);
    return [new Date(from + 'T00:00:00'), e];
  }, [range, from, to]);
  const inRange = (iso: string) => { const t = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return t >= start && t < end; };

  const live = db.sales.filter((s) => s.status === 'completed');
  const salesIn = live.filter((s) => inRange(s.date));
  const sumSales = (since: Date) => live.filter((s) => new Date(s.date) >= since).reduce((t, s) => t + saleTotal(s), 0);

  const revenue = salesIn.reduce((t, s) => t + saleTotal(s), 0);
  const cogs = salesIn.reduce((t, s) => t + saleCost(s), 0);
  const cash = cashbook(db).filter((c) => inRange(c.date));
  const cashIn = cash.filter((c) => c.category === 'Customer receipt').reduce((t, c) => t + c.amount, 0);
  const receivables = live.reduce((t, s) => t + saleBalance(s), 0);
  const expenses = db.expenses.filter((e) => e.status === 'active' && inRange(e.date));
  const expTotal = expenses.reduce((t, e) => t + e.amount, 0);
  const gross = revenue - cogs;
  const net = gross - expTotal;
  const stockValue = db.items.reduce((t, i) => t + Math.max(0, i.qty) * i.cost, 0);
  const produced = db.batches.filter((b) => b.status === 'released' && b.bottlingDate && inRange(b.bottlingDate)).reduce((t, b) => t + batchGoodUnits(b), 0);

  const finished = db.items.filter((i) => i.category === 'finished');
  const low = db.items.filter((i) => i.qty <= i.min);
  const soon = new Date(); soon.setDate(soon.getDate() + db.settings.expiryAlertDays);
  const expiring = db.items.flatMap((i) => i.lots.filter((l) => l.expiry && new Date(l.expiry) <= soon).map((l) => ({ item: i, lot: l })));

  const best = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    salesIn.forEach((s) => s.lines.forEach((l) => {
      const r = m.get(l.name) ?? { name: l.name, qty: 0, revenue: 0 };
      r.qty += l.qty; r.revenue += l.qty * l.price - l.discount; m.set(l.name, r);
    }));
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [salesIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const trend = useMemo(() => {
    const days = (end.getTime() - start.getTime()) / 864e5;
    const monthly = days > 62;
    const key = (iso: string) => { const d = new Date(iso); return monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : d.toISOString().slice(0, 10); };
    const label = (k: string) => monthly ? new Date(k + '-01').toLocaleDateString('en-GB', { month: 'short' }) : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const m = new Map<string, { key: string; Sales: number; Expenses: number }>();
    const cur = new Date(start);
    while (cur < end && cur <= new Date()) { const k = key(cur.toISOString()); if (!m.has(k)) m.set(k, { key: k, Sales: 0, Expenses: 0 }); cur.setDate(cur.getDate() + 1); }
    salesIn.forEach((s) => { const r = m.get(key(s.date)); if (r) r.Sales += saleTotal(s); });
    expenses.forEach((e) => { const r = m.get(key(e.date)); if (r) r.Expenses += e.amount; });
    return [...m.values()].map((r) => ({ ...r, label: label(r.key) }));
  }, [salesIn, expenses, start, end]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentSales = [...db.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const recentPurchases = [...db.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <div className="space-y-5">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user!.name.split(' ')[0]}`} subtitle="Every figure below is calculated from recorded transactions." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales today" value={ugx(sumSales(startOf('today')))} icon={<Wine size={18} />} />
        <Stat label="This week" value={ugx(sumSales(startOf('week')))} />
        <Stat label="This month" value={ugx(sumSales(startOf('month')))} />
        <Stat label="This year" value={ugx(sumSales(startOf('year')))} tone="gold" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs<Range> value={range} onChange={setRange} tabs={[{ id: 'today', label: 'Today' }, { id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: 'year', label: 'This year' }, { id: 'custom', label: 'Custom' }]} />
        {range === 'custom' && (
          <div className="mb-4 flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="text-stone-400">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales revenue" value={ugx(revenue)} hint={`${salesIn.length} invoices (incl. credit)`} icon={<TrendingUp size={18} />} />
        <Stat label="Cash received" value={ugx(cashIn)} hint="Money actually collected from customers" tone="green" icon={<Banknote size={18} />} />
        <Stat label="Owed by customers" value={ugx(receivables)} hint="All unpaid invoices (today)" tone="red" icon={<HandCoins size={18} />} />
        <Stat label="Expenses" value={ugx(expTotal)} hint={`${expenses.length} expense records`} tone="gray" icon={<Receipt size={18} />} />
        <Stat label="Gross profit (est.)" value={ugx(gross)} hint={`Revenue − cost of wine sold · ${revenue ? Math.round(gross / revenue * 100) : 0}% margin`} tone="gold" />
        <Stat label="Net profit (est.)" value={<span className={net < 0 ? 'text-red-600' : ''}>{ugx(net)}</span>} hint="Gross profit − expenses · unaudited" tone={net < 0 ? 'red' : 'green'} />
        <Stat label="Inventory value" value={ugx(stockValue)} hint="At weighted-average cost" tone="wine" icon={<Boxes size={18} />} />
        <Stat label="Bottled & released" value={`${num(produced)} units`} hint="Production output in period" tone="gold" icon={<Factory size={18} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Sales vs expenses" className="lg:col-span-2">
          {trend.length ? (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={trend} margin={{ left: -10, right: 8 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#eee8e2" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={{ stroke: '#d6d3d1' }} minTickGap={12} />
                  <YAxis tickFormatter={shortUgx} tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => ugx(v)} cursor={{ fill: '#f5e1e466' }} contentStyle={{ borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 13 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Sales" fill="#8a2a3f" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Expenses" fill="#c9993a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No activity in this period" />}
        </Card>

        <Card title="Alerts" action={<Badge tone={low.length + expiring.length ? 'red' : 'green'}>{low.length + expiring.length}</Badge>}>
          <ul className="space-y-2 text-sm">
            {low.map((i) => (
              <li key={i.id} className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <span><b>Low stock:</b> {i.name} — {num(i.qty, 2)} {i.unit} left (min {num(i.min)})</span>
              </li>
            ))}
            {expiring.map(({ item, lot }) => (
              <li key={item.id + lot.lotNo} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5">
                <CalendarClock size={16} className="mt-0.5 shrink-0 text-amber-700" />
                <span><b>{new Date(lot.expiry!) < new Date() ? 'Expired' : 'Expiring'}:</b> {item.name}, lot {lot.lotNo} — {lot.qty} units, {fmtDate(lot.expiry)}</span>
              </li>
            ))}
            {!low.length && !expiring.length && <li className="text-stone-500">All stock levels are healthy.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Finished wine in stock">
          <ul className="space-y-4">
            {finished.map((i) => {
              const pct = Math.min(100, (i.qty / Math.max(i.min * 3, 1)) * 100);
              return (
                <li key={i.id}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{i.name.replace('Vangy Natural Sweet Red Wine', 'Sweet Red')}</span><span className="tabular-nums">{num(i.qty)} {i.unit}s</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-stone-100"><div className={`h-2 rounded-full ${i.qty <= i.min ? 'bg-red-500' : 'bg-wine-600'}`} style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-xs text-stone-500">Min level {num(i.min)} · value {ugx(i.qty * i.cost)}</p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Best-selling products">
          {best.length ? (
            <ol className="space-y-3">
              {best.map((b, i) => (
                <li key={b.name} className="flex items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-bold text-gold-500">{i + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.name.replace('Vangy Natural Sweet Red Wine', 'Sweet Red')}</p><p className="text-xs text-stone-500">{num(b.qty)} units sold</p></div>
                  <span className="font-semibold tabular-nums">{shortUgx(b.revenue)}</span>
                </li>
              ))}
            </ol>
          ) : <Empty title="No sales in this period" />}
        </Card>

        <Card title="Recent purchases" action={<Link to="/purchases" className="text-sm text-wine-700 hover:underline">View all</Link>}>
          <ul className="divide-y divide-stone-100 text-sm">
            {recentPurchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div><p className="font-medium">{db.suppliers.find((s) => s.id === p.supplierId)?.name}</p><p className="text-xs text-stone-500">{p.po} · {fmtDate(p.date)}</p></div>
                <div className="text-right"><p className="tabular-nums">{shortUgx(purchaseTotal(p))}</p><Badge tone={p.status === 'received' ? 'green' : p.status === 'partial' ? 'amber' : 'blue'}>{p.status}</Badge></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Recent sales" action={<Link to="/sales" className="text-sm text-wine-700 hover:underline">View all</Link>}>
        <ul className="divide-y divide-stone-100 text-sm">
          {recentSales.map((s) => (
            <li key={s.id}>
              <Link to={`/sales/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-wine-700">
                <div className="min-w-0"><p className="truncate font-medium">{s.customerName}</p><p className="text-xs text-stone-500">{s.invoice} · {fmtDate(s.date)}</p></div>
                <div className="flex items-center gap-3"><span className="tabular-nums font-semibold">{ugx(saleTotal(s))}</span><StatusBadge status={saleStatus(s)} /></div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = ({ Paid: 'green', Partial: 'amber', Credit: 'red', Cancelled: 'gray' } as const)[status as 'Paid'] ?? 'gray';
  return <Badge tone={tone}>{status}</Badge>;
}
