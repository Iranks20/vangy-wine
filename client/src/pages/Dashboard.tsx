import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, Boxes, CalendarClock, Factory, HandCoins, Receipt, TrendingUp, Wine } from 'lucide-react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import type { DashboardData, Range } from '../../../shared/dashboard';
import { fmtDate, num, shortUgx, ugx } from '../lib/format';
import { Badge, Card, Empty, Input, PageHeader, Stat, Tabs } from '../components/ui';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Dashboard() {
  const { db, user } = useStore();
  const [range, setRange] = useState<Range>('month');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return localDay(d); });
  const [to, setTo] = useState(() => localDay(new Date()));
  const [d, setD] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  // Figures are calculated by the server; reload when the range changes or any record changes.
  useEffect(() => {
    let live = true;
    const q = range === 'custom' ? `range=custom&from=${from}&to=${to}` : `range=${range}`;
    api.get<DashboardData>(`/dashboard?${q}`)
      .then((x) => { if (live) { setD(x); setError(''); } })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [range, from, to, db]);

  const trend = useMemo(() => (d?.trend ?? []).map((r) => ({
    ...r, label: d!.monthly ? new Date(r.key + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'short' }) : new Date(r.key + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
  })), [d]);

  if (!d) return <div className="py-16 text-center text-sm text-stone-500">{error || 'Loading dashboard…'}</div>;
  const { revenue, cashIn, receivables, stockValue, produced, best, expiring, finished, recentSales, recentPurchases } = d;
  const low = d.lowStock, expTotal = d.expenses, gross = d.grossProfit, net = d.netProfit;

  return (
    <div className="space-y-5">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user!.name.split(' ')[0]}`} subtitle="Every figure below is calculated from recorded transactions." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales today" value={ugx(d.periods.today)} icon={<Wine size={18} />} />
        <Stat label="This week" value={ugx(d.periods.week)} />
        <Stat label="This month" value={ugx(d.periods.month)} />
        <Stat label="This year" value={ugx(d.periods.year)} tone="gold" />
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
        <Stat label="Sales revenue" value={ugx(revenue)} hint={`${d.invoices} invoices (incl. credit)`} icon={<TrendingUp size={18} />} />
        <Stat label="Cash received" value={ugx(cashIn)} hint="Money actually collected from customers" tone="green" icon={<Banknote size={18} />} />
        <Stat label="Owed by customers" value={ugx(receivables)} hint="All unpaid invoices (today)" tone="red" icon={<HandCoins size={18} />} />
        <Stat label="Expenses" value={ugx(expTotal)} hint={`${d.expenseCount} expense records`} tone="gray" icon={<Receipt size={18} />} />
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
            {expiring.map((x) => (
              <li key={x.itemId + x.lotNo} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5">
                <CalendarClock size={16} className="mt-0.5 shrink-0 text-amber-700" />
                <span><b>{x.expired ? 'Expired' : 'Expiring'}:</b> {x.itemName}, lot {x.lotNo} — {num(x.qty)} units, {fmtDate(x.expiry)}</span>
              </li>
            ))}
            {!low.length && !expiring.length && <li className="text-stone-500">All stock levels are healthy.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Finished wine in stock">
          {!finished.length && <p className="text-sm text-stone-500">Add your finished products in Inventory.</p>}
          <ul className="space-y-4">
            {finished.map((i) => {
              const pct = Math.min(100, (i.qty / Math.max(i.min * 3, 1)) * 100);
              return (
                <li key={i.id}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{i.name}</span><span className="tabular-nums">{num(i.qty)} {i.unit}s</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-stone-100"><div className={`h-2 rounded-full ${i.qty <= i.min ? 'bg-red-500' : 'bg-wine-600'}`} style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-xs text-stone-500">Min level {num(i.min)} · value {ugx(i.value)}</p>
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
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.name}</p><p className="text-xs text-stone-500">{num(b.qty)} units sold</p></div>
                  <span className="font-semibold tabular-nums">{shortUgx(b.revenue)}</span>
                </li>
              ))}
            </ol>
          ) : <Empty title="No sales in this period" />}
        </Card>

        <Card title="Recent purchases" action={<Link to="/purchases" className="text-sm text-wine-700 hover:underline">View all</Link>}>
          {!recentPurchases.length && <p className="text-sm text-stone-500">No purchases recorded yet.</p>}
          <ul className="divide-y divide-stone-100 text-sm">
            {recentPurchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div><p className="font-medium">{p.supplier}</p><p className="text-xs text-stone-500">{p.po} · {fmtDate(p.date)}</p></div>
                <div className="text-right"><p className="tabular-nums">{shortUgx(p.total)}</p><Badge tone={p.status === 'received' ? 'green' : p.status === 'partial' ? 'amber' : 'blue'}>{p.status}</Badge></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Recent sales" action={<Link to="/sales" className="text-sm text-wine-700 hover:underline">View all</Link>}>
        {!recentSales.length && <p className="text-sm text-stone-500">No sales recorded yet.</p>}
        <ul className="divide-y divide-stone-100 text-sm">
          {recentSales.map((s) => (
            <li key={s.id}>
              <Link to={`/sales/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-wine-700">
                <div className="min-w-0"><p className="truncate font-medium">{s.customerName}</p><p className="text-xs text-stone-500">{s.invoice} · {fmtDate(s.date)}</p></div>
                <div className="flex items-center gap-3"><span className="tabular-nums font-semibold">{ugx(s.total)}</span><StatusBadge status={s.status} /></div>
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
