import { useState } from 'react';
import { Eye, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { saleTotal, useStore } from '../lib/store';
import { fmtDate, ugx } from '../lib/format';
import { Badge, Button, Field, Input, Modal, PageHeader, useRun, useToast } from '../components/ui';
import { DataTable, type Column, type RowAction } from '../components/DataTable';
import type { Employee } from '../lib/types';

const blank: Employee = { id: 0, name: '', phone: '', position: '', active: true };

export default function Employees() {
  const { db, saveEmployee, deleteEmployee } = useStore();
  const run = useRun();
  const toast = useToast();
  const [edit, setEdit] = useState<Employee | null>(null);
  const [view, setView] = useState<Employee | null>(null);
  const sold = (name: string) => db.sales.filter((s) => s.salesperson === name && s.status === 'completed').reduce((t, s) => t + saleTotal(s), 0);

  const cols: Column<Employee>[] = [
    { key: 'name', label: 'Name', render: (e) => <span className="font-medium">{e.name}</span> },
    { key: 'position', label: 'Position' },
    { key: 'phone', label: 'Phone', hideOnMobile: true },
    { key: 'sold', label: 'Sales recorded', align: 'right', value: (e) => sold(e.name), render: (e) => ugx(sold(e.name)) },
    { key: 'active', label: 'Status', value: (e) => (e.active ? 'Active' : 'Left'), render: (e) => <Badge tone={e.active ? 'green' : 'gray'}>{e.active ? 'Active' : 'Left'}</Badge> },
  ];

  const actions: RowAction<Employee>[] = [
    { label: 'View details', icon: Eye, onClick: setView },
    { label: 'Edit', icon: Pencil, onClick: (e) => setEdit(e) },
    { label: 'Delete', icon: Trash2, tone: 'danger', onClick: async (e) => {
      if (await toast.confirm({ title: `Delete ${e.name}?`, text: 'Their past sales keep their name. This cannot be undone.', danger: true, confirmLabel: 'Delete' })) run(() => deleteEmployee(e.id), 'Employee deleted');
    } },
  ];
  const theirSales = view ? db.sales.filter((s) => s.salesperson === view.name && s.status === 'completed') : [];

  return (
    <>
      <PageHeader title="Employees" subtitle="Staff records. Pick who made a sale when recording it — only the director signs in." actions={<Button onClick={() => setEdit({ ...blank })}><Plus size={16} />Add employee</Button>} />
      <DataTable rows={db.employees} columns={cols} actions={actions} onRowClick={setView} />

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit employee' : 'New employee'}
        footer={<>{edit?.id ? <Button variant="ghost" className="mr-auto text-red-600" onClick={async () => { if (await toast.confirm({ title: `Delete ${edit.name}?`, text: 'This cannot be undone. Records that are already used in transactions cannot be deleted.', danger: true, confirmLabel: 'Delete' })) run(() => deleteEmployee(edit.id), 'Employee deleted').then((ok) => ok && setEdit(null)); }}>Delete</Button> : null}<Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit!.name.trim()) return run(() => { throw new Error('Name is required.'); }, ''); run(() => saveEmployee(edit!), 'Employee saved').then((ok) => ok && setEdit(null)); }}>Save</Button></>}>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Position"><Input value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} placeholder="e.g. Sales Representative" /></Field>
          <Field label="Phone"><Input value={edit.phone} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="h-4 w-4 accent-wine-700" />Currently working here</label>
        </div>}
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''}
        footer={view && <Button variant="secondary" onClick={() => { setEdit(view); setView(null); }}><Pencil size={16} />Edit</Button>}>
        {view && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-stone-500">Position</p><p className="font-medium">{view.position || '—'}</p></div>
            <div><p className="text-stone-500">Status</p><Badge tone={view.active ? 'green' : 'gray'}>{view.active ? 'Active' : 'Left'}</Badge></div>
            <div><p className="text-stone-500">Phone</p>{view.phone ? <a href={`tel:${view.phone}`} className="flex items-center gap-1 font-medium text-wine-700"><Phone size={14} />{view.phone}</a> : '—'}</div>
            <div><p className="text-stone-500">Sales recorded</p><p className="font-medium">{theirSales.length} · {ugx(sold(view.name))}</p></div>
          </div>
          {theirSales.length > 0 && <div>
            <p className="mb-1 font-semibold">Recent sales</p>
            <ul className="divide-y divide-stone-100">{[...theirSales].reverse().slice(0, 8).map((s) => <li key={s.id} className="flex justify-between py-1.5"><span>{s.invoice} · {s.customerName}</span><span className="text-stone-500">{fmtDate(s.date)}</span></li>)}</ul>
          </div>}
        </div>}
      </Modal>
    </>
  );
}
