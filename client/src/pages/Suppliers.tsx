import { useState } from 'react';
import { Mail, Phone, Plus } from 'lucide-react';
import { purchaseBalance, purchasePaid, purchaseTotal, useStore } from '../lib/store';
import { fmtDate, ugx } from '../lib/format';
import { Badge, Button, Field, Input, Modal, PageHeader, useRun } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Supplier } from '../lib/types';

const blank: Supplier = { id: 0, name: '', contact: '', phone: '', email: '', supplies: '' };

export default function Suppliers() {
  const { db, saveSupplier } = useStore();
  const run = useRun();
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [view, setView] = useState<Supplier | null>(null);
  const pos = (id: number) => db.purchases.filter((p) => p.supplierId === id && p.status !== 'cancelled');
  const owed = (id: number) => pos(id).reduce((t, p) => t + Math.max(0, purchaseBalance(p)), 0);

  const cols: Column<Supplier>[] = [
    { key: 'name', label: 'Supplier', render: (s) => <div><p className="font-medium">{s.name}</p><p className="text-xs text-stone-500">{s.supplies}</p></div> },
    { key: 'contact', label: 'Contact person' },
    { key: 'phone', label: 'Phone' },
    { key: 'orders', label: 'Orders', align: 'right', value: (s) => pos(s.id).length, hideOnMobile: true },
    { key: 'bought', label: 'Total purchased', align: 'right', value: (s) => pos(s.id).reduce((t, p) => t + purchaseTotal(p), 0), render: (s) => ugx(pos(s.id).reduce((t, p) => t + purchaseTotal(p), 0)), hideOnMobile: true },
    { key: 'owed', label: 'We owe', align: 'right', value: (s) => owed(s.id), render: (s) => <span className={owed(s.id) ? 'font-semibold text-red-600' : ''}>{ugx(owed(s.id))}</span> },
  ];

  return (
    <>
      <PageHeader title="Suppliers" subtitle="Who supplies what, and what we owe them." actions={<Button onClick={() => setEdit({ ...blank })}><Plus size={16} />Add supplier</Button>} />
      <DataTable rows={db.suppliers} columns={cols} onRowClick={setView} />

      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''} wide footer={view && <Button variant="secondary" onClick={() => { setEdit(view); setView(null); }}>Edit details</Button>}>
        {view && <>
          <div className="flex flex-wrap gap-4 text-sm text-stone-600">
            <span>{view.contact}</span>
            <a href={`tel:${view.phone}`} className="flex items-center gap-1 text-wine-700"><Phone size={14} />{view.phone}</a>
            {view.email && <a href={`mailto:${view.email}`} className="flex items-center gap-1 text-wine-700"><Mail size={14} />{view.email}</a>}
          </div>
          <h3 className="mb-2 mt-5 font-semibold">Statement</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">PO</th><th>Date</th><th className="text-right">Value</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th className="pl-2">Status</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{pos(view.id).map((p) => <tr key={p.id}><td className="py-1.5 font-mono text-xs">{p.po}</td><td>{fmtDate(p.date)}</td><td className="text-right">{ugx(purchaseTotal(p))}</td><td className="text-right">{ugx(purchasePaid(p))}</td><td className="text-right">{ugx(Math.max(0, purchaseBalance(p)))}</td><td className="pl-2"><Badge>{p.status}</Badge></td></tr>)}</tbody>
          </table>
          <p className="mt-3 text-right font-semibold">Balance owed: {ugx(owed(view.id))}</p>
        </>}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit supplier' : 'New supplier'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit!.name.trim()) return run(() => { throw new Error('Supplier name is required.'); }, ''); run(() => saveSupplier(edit!), 'Supplier saved').then((ok) => ok && setEdit(null)); }}>Save</Button></>}>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Contact person"><Input value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></Field>
          <Field label="Phone"><Input value={edit.phone} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label="Supplies"><Input value={edit.supplies} onChange={(e) => setEdit({ ...edit, supplies: e.target.value })} placeholder="e.g. Bottles, labels" /></Field>
        </div>}
      </Modal>
    </>
  );
}
