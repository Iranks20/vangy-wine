import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Plus, Printer } from 'lucide-react';
import { saleBalance, salePaid, saleStatus, saleTotal, useStore } from '../lib/store';
import { customerTypeLabel, fmtDate, ugx } from '../lib/format';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Stat, Textarea, useRun } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from './Dashboard';
import type { Customer, CustomerType } from '../lib/types';

const blank: Customer = { id: 0, name: '', phone: '', type: 'retail', location: '', terms: 0 };

export default function Customers() {
  const { db, saveCustomer } = useStore();
  const run = useRun();
  const [edit, setEdit] = useState<Customer | null>(null);
  const [view, setView] = useState<Customer | null>(null);
  const sales = (id: number) => db.sales.filter((s) => s.customerId === id && s.status === 'completed');
  const bought = (id: number) => sales(id).reduce((t, s) => t + saleTotal(s), 0);
  const owes = (id: number) => sales(id).reduce((t, s) => t + saleBalance(s), 0);
  const overdue = (id: number) => sales(id).some((s) => saleBalance(s) > 0 && s.dueDate && new Date(s.dueDate) < new Date());
  const topValue = [...db.customers].sort((a, b) => bought(b.id) - bought(a.id)).slice(0, 3).map((c) => c.id);

  // Debt ageing buckets, counted from invoice due date
  const aging = [0, 0, 0, 0];
  db.sales.forEach((s) => {
    const bal = saleBalance(s); if (bal <= 0 || !s.customerId) return;
    const days = (Date.now() - new Date(s.dueDate ?? s.date).getTime()) / 864e5;
    aging[days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3] += bal;
  });

  const cols: Column<Customer>[] = [
    { key: 'name', label: 'Customer', render: (c) => <div><p className="font-medium">{c.name}</p><div className="mt-0.5 flex flex-wrap gap-1">
      {sales(c.id).length > 2 && <Badge tone="blue">Repeat</Badge>}{topValue.includes(c.id) && <Badge tone="wine">High value</Badge>}{overdue(c.id) && <Badge tone="red">Overdue</Badge>}</div></div> },
    { key: 'type', label: 'Type', value: (c) => customerTypeLabel[c.type] },
    { key: 'location', label: 'Location', hideOnMobile: true },
    { key: 'phone', label: 'Phone', hideOnMobile: true },
    { key: 'bought', label: 'Total bought', align: 'right', value: (c) => bought(c.id), render: (c) => ugx(bought(c.id)) },
    { key: 'owes', label: 'Owes', align: 'right', value: (c) => owes(c.id), render: (c) => <span className={owes(c.id) ? 'font-semibold text-red-600' : ''}>{ugx(owes(c.id))}</span> },
  ];

  return (
    <>
      <PageHeader title="Customers" subtitle="Sales history, debts and follow-ups." actions={<Button onClick={() => setEdit({ ...blank })}><Plus size={16} />Add customer</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Not yet due" value={ugx(aging[0])} tone="green" />
        <Stat label="1–30 days overdue" value={ugx(aging[1])} tone="gold" />
        <Stat label="31–60 days overdue" value={ugx(aging[2])} tone="red" />
        <Stat label="Over 60 days" value={ugx(aging[3])} tone="red" />
      </div>
      <DataTable rows={db.customers} columns={cols} onRowClick={setView} />

      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''} wide
        footer={view && <><Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print statement</Button><Button variant="secondary" onClick={() => { setEdit(view); setView(null); }}>Edit details</Button></>}>
        {view && <>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-stone-500">Type</p><p className="font-medium">{customerTypeLabel[view.type]}</p></div>
            <div><p className="text-stone-500">Phone</p><a href={`tel:${view.phone}`} className="flex items-center gap-1 font-medium text-wine-700"><Phone size={14} />{view.phone}</a></div>
            <div><p className="text-stone-500">Payment terms</p><p className="font-medium">{view.terms ? `${view.terms} days` : 'Cash on delivery'}</p></div>
            <div><p className="text-stone-500">Balance owed</p><p className="font-semibold text-red-600">{ugx(owes(view.id))}</p></div>
          </div>
          {(view.notes || view.followUp) && <div className="mt-3 rounded-lg bg-gold-100/50 p-3 text-sm">{view.notes && <p>{view.notes}</p>}{view.followUp && <p className="mt-1"><b>Follow up:</b> {fmtDate(view.followUp)}</p>}</div>}
          <h3 className="mb-2 mt-5 font-semibold">Statement</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Invoice</th><th>Date</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th className="pl-2">Status</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{[...sales(view.id)].reverse().map((s) => <tr key={s.id}><td className="py-1.5"><Link className="text-wine-700 hover:underline" to={`/sales/${s.id}`}>{s.invoice}</Link></td><td>{fmtDate(s.date)}</td><td>{fmtDate(s.dueDate)}</td><td className="text-right">{ugx(saleTotal(s))}</td><td className="text-right">{ugx(salePaid(s))}</td><td className="text-right">{ugx(saleBalance(s))}</td><td className="pl-2"><StatusBadge status={saleStatus(s)} /></td></tr>)}</tbody>
          </table></div>
        </>}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit customer' : 'New customer'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit!.name.trim()) return run(() => { throw new Error('Customer name is required.'); }, ''); run(() => saveCustomer(edit!), 'Customer saved') && setEdit(null); }}>Save</Button></>}>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={edit.phone} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Type"><Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as CustomerType })}>{Object.entries(customerTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Location"><Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
          <Field label="Payment terms (days)"><Input type="number" value={edit.terms} onChange={(e) => setEdit({ ...edit, terms: Number(e.target.value) })} /></Field>
          <Field label="Follow-up date"><Input type="date" value={edit.followUp ?? ''} onChange={(e) => setEdit({ ...edit, followUp: e.target.value })} /></Field>
          <Field label="Notes / referrals" className="sm:col-span-2"><Textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        </div>}
      </Modal>
    </>
  );
}
