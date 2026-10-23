import { useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../lib/store';
import { dayOf } from '../../../shared/reports';
import { EXPENSE_CATEGORIES } from '../../../shared/defaults';
import { downloadCsv, fmtDate, methodLabel, today, ugx } from '../lib/format';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, useRun, useToast } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Expense, Method } from '../lib/types';

export default function Expenses() {
  const { db, addExpense, updateExpense, voidExpense, openAttachment } = useStore();
  const [editId, setEditId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const run = useRun();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [form, setForm] = useState({ date: today(), category: EXPENSE_CATEGORIES[0], description: '', amount: '', method: 'cash' as Method, recipient: '', reference: '' });

  const rows = [...db.expenses].reverse().filter((e) => (!cat || e.category === cat) && (!month || dayOf(e.date).slice(0, 7) === month));
  const active = rows.filter((e) => e.status === 'active');
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    active.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [active]);
  // Biggest categories get brand colours; the rest share a neutral "Other" tone.
  const shades = ['#8a2a3f', '#c9993a', '#5b6b8c', '#3f8a6b', '#a8a29e'];

  const cols: Column<Expense>[] = [
    { key: 'ref', label: 'Ref', render: (e) => <span className="font-mono text-xs">{e.ref}</span> },
    { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description', hideOnMobile: true, render: (e) => <span>{e.description}{e.hasAttachment && <button className="ml-2 text-xs text-wine-700 hover:underline" onClick={(ev) => { ev.stopPropagation(); run(() => openAttachment(e.id), ''); }}>📎 View</button>}</span> },
    { key: 'recipient', label: 'Paid to', hideOnMobile: true },
    { key: 'method', label: 'Method', value: (e) => methodLabel[e.method], hideOnMobile: true },
    { key: 'amount', label: 'Amount', align: 'right', render: (e) => <span className={e.status === 'voided' ? 'text-stone-400 line-through' : 'font-medium'}>{ugx(e.amount)}</span> },
    { key: 'status', label: '', value: (e) => e.status, render: (e) => e.status === 'voided' ? <Badge>voided</Badge> : (
      <button className="text-xs text-red-600 hover:underline" onClick={async (ev) => { ev.stopPropagation(); const r = await toast.confirm({ title: `Void ${e.ref}?`, text: 'The expense stays on record, marked as voided.', danger: true, reason: true, confirmLabel: 'Void' }); if (r) run(() => voidExpense(e.id, r), 'Expense voided'); }}>Void</button>
    ) },
  ];

  const save = async () => {
    if (!form.description.trim()) return toast.error('Description is required.');
    const body = { ...form, amount: Number(form.amount), date: new Date(form.date + 'T12:00:00').toISOString() };
    if (await run(() => (editId ? updateExpense(editId, body, file) : addExpense(body, file)), editId ? 'Expense updated' : 'Expense recorded')) {
      setOpen(false); setFile(null); setForm({ ...form, description: '', amount: '', recipient: '', reference: '' });
    }
  };

  return (
    <>
      <PageHeader title="Expenses" subtitle="Operating costs, paid from cash, mobile money or bank."
        actions={<>
          <Button variant="secondary" onClick={() => downloadCsv('expenses.csv', ['Ref', 'Date', 'Category', 'Description', 'Paid to', 'Method', 'Amount', 'Status'], rows.map((e) => [e.ref, fmtDate(e.date), e.category, e.description, e.recipient, methodLabel[e.method], e.amount, e.status]))}><Download size={16} />Export</Button>
          <Button onClick={() => { setEditId(null); setFile(null); setForm({ date: today(), category: EXPENSE_CATEGORIES[0], description: '', amount: '', method: 'cash', recipient: '', reference: '' }); setOpen(true); }}><Plus size={16} />Record expense</Button>
        </>} />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title={`Total: ${ugx(active.reduce((t, e) => t + e.amount, 0))}`} className="lg:col-span-1">
          {byCat.length ? <>
            <div className="h-44"><ResponsiveContainer><PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} stroke="#fff" strokeWidth={2}>
                {byCat.map((c, i) => <Cell key={c.name} fill={shades[Math.min(i, 4)]} />)}
              </Pie><Tooltip formatter={(v: number) => ugx(v)} />
            </PieChart></ResponsiveContainer></div>
            <ul className="space-y-1 text-sm">{byCat.map((c, i) => <li key={c.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: shades[Math.min(i, 4)] }} /><span className="flex-1 truncate">{c.name}</span><span className="tabular-nums">{ugx(c.value)}</span></li>)}</ul>
          </> : <p className="text-sm text-stone-500">No expenses for this filter.</p>}
        </Card>
        <div className="lg:col-span-2">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
            <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
          </div>
          <DataTable rows={rows} columns={cols} pageSize={8} onRowClick={(e) => { if (e.status !== 'active') return; setEditId(e.id); setFile(null); setForm({ date: dayOf(e.date), category: e.category, description: e.description, amount: String(e.amount), method: e.method, recipient: e.recipient, reference: e.reference ?? '' }); setOpen(true); }} emptyText="No expenses recorded for this month." />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? `Edit ${db.expenses.find((x) => x.id === editId)?.ref}` : 'Record expense'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>{editId ? 'Save changes' : 'Save expense'}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Description" className="sm:col-span-2"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Amount (UGX)"><Input type="number" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Paid from"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Method })}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>
          <Field label="Paid to"><Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} /></Field>
          <Field label="Receipt / reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          <Field label="Attachment (receipt photo or PDF, up to 4 MB)" className="sm:col-span-2"><Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        </div>
      </Modal>
    </>
  );
}
