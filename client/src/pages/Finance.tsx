import { useMemo, useState } from 'react';
import { Banknote, Building2, Download, Plus, Scale, Smartphone } from 'lucide-react';
import { cashbook, purchaseBalance, saleBalance, useStore, type CashLine } from '../lib/store';
import { downloadCsv, fmtDate, fmtDateTime, methodLabel, today, ugx } from '../lib/format';
import { Button, Card, Field, Input, Modal, PageHeader, Select, Stat, Tabs, useRun } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Method } from '../lib/types';

export default function Finance() {
  const { db, addCash, addTransfer } = useStore();
  const run = useRun();
  const [tab, setTab] = useState<'cashbook' | 'daily' | 'recon'>('cashbook');
  const [acct, setAcct] = useState<'' | Method>('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: 'other_in', method: 'cash' as Method, to: 'bank' as Method, amount: '', description: '' });
  const [counted, setCounted] = useState<Record<string, string>>({});

  const book = cashbook(db);
  const bal = (m: Method) => book.filter((c) => c.method === m).reduce((t, c) => t + (c.direction === 'in' ? c.amount : -c.amount), 0);
  const receivables = db.sales.reduce((t, s) => t + saleBalance(s), 0);
  const payables = db.purchases.reduce((t, p) => t + Math.max(0, purchaseBalance(p)), 0);
  const rows = book.filter((c) => !acct || c.method === acct);

  const daily = useMemo(() => {
    const m = new Map<string, { day: string; in: number; out: number }>();
    book.forEach((c) => { const d = c.date.slice(0, 10); const r = m.get(d) ?? { day: d, in: 0, out: 0 }; r[c.direction] += c.amount; m.set(d, r); });
    return [...m.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [book]);

  const cols: Column<CashLine>[] = [
    { key: 'date', label: 'Date', render: (c) => fmtDateTime(c.date) },
    { key: 'description', label: 'Description', render: (c) => <div><p>{c.description}</p><p className="text-xs text-stone-500">{c.category} · {c.ref}</p></div>, value: (c) => `${c.description} ${c.category} ${c.ref}` },
    { key: 'method', label: 'Account', value: (c) => methodLabel[c.method] },
    { key: 'in', label: 'Money in', align: 'right', value: (c) => (c.direction === 'in' ? c.amount : 0), render: (c) => c.direction === 'in' ? <span className="text-emerald-700">{ugx(c.amount)}</span> : '' },
    { key: 'out', label: 'Money out', align: 'right', value: (c) => (c.direction === 'out' ? c.amount : 0), render: (c) => c.direction === 'out' ? <span className="text-red-600">{ugx(c.amount)}</span> : '' },
  ];

  const save = async () => {
    const amount = Number(form.amount);
    const date = new Date().toISOString();
    const ok = await run(async () => {
      if (!form.description.trim()) throw new Error('Description is required.');
      if (form.kind === 'transfer') {
        if (form.method === form.to) throw new Error('Choose two different accounts.');
        await addTransfer({ date, amount, from: form.method, to: form.to, description: form.description });
      } else {
        const label = { other_in: 'Other income', other_out: 'Other payment', opening: 'Opening balance' }[form.kind]!;
        await addCash({ date, direction: form.kind === 'other_out' ? 'out' : 'in', amount, method: form.method, description: form.description, category: label });
      }
    }, 'Cashbook entry saved');
    if (ok) { setOpen(false); setForm({ ...form, amount: '', description: '' }); }
  };

  return (
    <>
      <PageHeader title="Finance" subtitle="Actual money in and out — separate from revenue and profit."
        actions={<>
          <Button variant="secondary" onClick={() => downloadCsv('cashbook.csv', ['Date', 'Description', 'Category', 'Ref', 'Account', 'In', 'Out'], rows.map((c) => [fmtDateTime(c.date), c.description, c.category, c.ref, methodLabel[c.method], c.direction === 'in' ? c.amount : '', c.direction === 'out' ? c.amount : '']))}><Download size={16} />Export</Button>
          <Button onClick={() => setOpen(true)}><Plus size={16} />Cashbook entry</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Cash at hand" value={ugx(bal('cash'))} icon={<Banknote size={18} />} tone="green" />
        <Stat label="Mobile money" value={ugx(bal('mobile_money'))} icon={<Smartphone size={18} />} tone="gold" />
        <Stat label="Bank" value={ugx(bal('bank'))} icon={<Building2 size={18} />} />
        <Stat label="Customers owe us" value={ugx(receivables)} tone="red" hint="Receivables" />
        <Stat label="We owe suppliers" value={ugx(payables)} tone="gray" hint="Payables" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'cashbook', label: 'Cashbook' }, { id: 'daily', label: 'Daily summary' }, { id: 'recon', label: 'Reconciliation' }]} />

      {tab === 'cashbook' && <DataTable rows={rows} columns={cols} toolbar={<Select value={acct} onChange={(e) => setAcct(e.target.value as Method)} aria-label="Account"><option value="">All accounts</option>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select>} />}

      {tab === 'daily' && (
        <DataTable rows={daily} columns={[
          { key: 'day', label: 'Day', render: (d) => fmtDate(d.day) },
          { key: 'in', label: 'Money in', align: 'right', render: (d) => <span className="text-emerald-700">{ugx(d.in)}</span> },
          { key: 'out', label: 'Money out', align: 'right', render: (d) => <span className="text-red-600">{ugx(d.out)}</span> },
          { key: 'net', label: 'Net', align: 'right', value: (d) => d.in - d.out, render: (d) => <span className="font-semibold">{ugx(d.in - d.out)}</span> },
        ]} />
      )}

      {tab === 'recon' && (
        <Card title={<span className="flex items-center gap-2"><Scale size={18} />Count and compare — {fmtDate(today())}</span>}>
          <p className="mb-4 text-sm text-stone-500">Count the actual money in each account and enter it. Any difference should be investigated and explained.</p>
          <div className="space-y-3">
            {(['cash', 'mobile_money', 'bank'] as const).map((m) => {
              const diff = counted[m] === undefined || counted[m] === '' ? null : Number(counted[m]) - bal(m);
              return (
                <div key={m} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-4">
                  <div><p className="text-sm font-medium">{methodLabel[m]}</p><p className="text-xs text-stone-500">System balance</p><p className="font-semibold">{ugx(bal(m))}</p></div>
                  <Field label="Counted"><Input type="number" value={counted[m] ?? ''} onChange={(e) => setCounted({ ...counted, [m]: e.target.value })} /></Field>
                  <div className="col-span-2 text-sm">{diff === null ? <span className="text-stone-400">Enter the counted amount</span> : diff === 0 ? <span className="font-medium text-emerald-700">Balanced ✓</span> : <span className="font-medium text-red-600">Difference: {ugx(diff)} ({diff > 0 ? 'surplus' : 'shortage'})</span>}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Cashbook entry"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <p className="text-xs text-stone-500">Customer payments, supplier payments and expenses are recorded automatically from their own screens — use this only for other money movements.</p>
          <Field label="Type"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="other_in">Other money in (e.g. owner capital, loan)</option><option value="other_out">Other money out (e.g. owner drawings)</option>
            <option value="transfer">Transfer between accounts</option><option value="opening">Opening balance</option>
          </Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={form.kind === 'transfer' ? 'From' : 'Account'}><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Method })}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>
            {form.kind === 'transfer' && <Field label="To"><Select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value as Method })}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>}
            <Field label="Amount (UGX)"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
