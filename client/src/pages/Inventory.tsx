import { useState } from 'react';
import { ClipboardList, Download, Eye, Pencil, Plus, Printer, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { categoryLabel, downloadCsv, fmtDate, fmtDateTime, num, ugx } from '../lib/format';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Stat, Tabs, Textarea, useRun, useToast } from '../components/ui';
import { DataTable, type Column, type RowAction } from '../components/DataTable';
import type { Item, ItemCategory, Movement } from '../lib/types';

// No category is pre-selected: the category decides whether an item can be sold, so it must be a deliberate choice.
const blank: Item = { id: 0, code: '', name: '', category: '' as ItemCategory, unit: '', price: 0, cost: 0, qty: 0, min: 0, location: '', lots: [] };

export default function Inventory() {
  const { db, saveItem, adjustStock, deleteItem } = useStore();
  const nav = useNavigate();
  const run = useRun();
  const toast = useToast();
  const [tab, setTab] = useState<'items' | 'moves' | 'count'>('items');
  const [cat, setCat] = useState<'' | ItemCategory>('');
  const [edit, setEdit] = useState<Item | null>(null);
  const [view, setView] = useState<Item | null>(null);
  const [adj, setAdj] = useState<{ itemId: number; kind: 'increase' | 'decrease' | 'damage' | 'expired'; qty: string; reason: string } | null>(null);

  const items = db.items.filter((i) => !cat || i.category === cat);
  const value = db.items.reduce((t, i) => t + Math.max(0, i.qty) * i.cost, 0);
  const low = db.items.filter((i) => i.qty <= i.min).length;
  const soon = new Date(); soon.setDate(soon.getDate() + db.settings.expiryAlertDays);
  const expLots = db.items.flatMap((i) => i.lots).filter((l) => l.expiry && new Date(l.expiry) <= soon).length;
  const name = (id: number) => db.items.find((i) => i.id === id)?.name ?? '';

  const cols: Column<Item>[] = [
    { key: 'name', label: 'Item', render: (i) => <div><p className="font-medium">{i.name}</p><p className="text-xs text-stone-500">{i.code}</p></div>, value: (i) => `${i.name} ${i.code}` },
    { key: 'category', label: 'Category', value: (i) => categoryLabel[i.category], render: (i) => <Badge tone={i.category === 'finished' ? 'wine' : 'gray'}>{categoryLabel[i.category]}</Badge> },
    { key: 'qty', label: 'In stock', align: 'right', value: (i) => i.qty, render: (i) => <span className={i.qty <= i.min ? 'font-semibold text-red-600' : ''}>{num(i.qty, 2)} {i.unit}</span> },
    { key: 'min', label: 'Min', align: 'right', hideOnMobile: true, render: (i) => num(i.min) },
    { key: 'cost', label: 'Avg cost', align: 'right', render: (i) => ugx(i.cost), hideOnMobile: true },
    { key: 'value', label: 'Value', align: 'right', value: (i) => i.qty * i.cost, render: (i) => ugx(Math.max(0, i.qty) * i.cost) },
    { key: 'location', label: 'Location', hideOnMobile: true },
    { key: 'st', label: 'Status', value: (i) => (i.qty <= i.min ? 'Low' : 'OK'), render: (i) => <Badge tone={i.qty <= 0 ? 'red' : i.qty <= i.min ? 'amber' : 'green'}>{i.qty <= 0 ? 'Out' : i.qty <= i.min ? 'Low' : 'OK'}</Badge> },
  ];
  const mcols: Column<Movement>[] = [
    { key: 'date', label: 'Date', render: (m) => fmtDateTime(m.date) },
    { key: 'item', label: 'Item', value: (m) => name(m.itemId) },
    { key: 'type', label: 'Movement' },
    { key: 'qty', label: 'Qty', align: 'right', render: (m) => <span className={m.qty < 0 ? 'text-red-600' : 'text-emerald-700'}>{m.qty > 0 ? '+' : ''}{num(m.qty, 2)}</span> },
    { key: 'ref', label: 'Source', render: (m) => <span className="font-mono text-xs">{m.ref}</span> },
    { key: 'user', label: 'By', hideOnMobile: true },
    { key: 'note', label: 'Note', hideOnMobile: true, value: (m) => m.note ?? '' },
  ];

  const removeItem = async (i: Item) => {
    if (await toast.confirm({ title: `Delete ${i.name}?`, text: 'This cannot be undone. Items that are already used in transactions cannot be deleted.', danger: true, confirmLabel: 'Delete' })) run(() => deleteItem(i.id), 'Item deleted');
  };
  const itemActions: RowAction<Item>[] = [
    { label: 'View details', icon: Eye, onClick: setView },
    { label: 'Edit', icon: Pencil, onClick: (i) => setEdit(i) },
    { label: 'Order more', icon: ClipboardList, onClick: (i) => nav(`/purchases?item=${i.id}`), show: (i) => i.category !== 'finished' },
    { label: 'Adjust stock', icon: SlidersHorizontal, onClick: (i) => setAdj({ itemId: i.id, kind: 'damage', qty: '', reason: '' }) },
    { label: 'Delete', icon: Trash2, tone: 'danger', onClick: removeItem },
  ];

  return (
    <>
      <PageHeader title="Inventory" subtitle="Finished wine, raw materials and packaging. Valued at weighted-average cost."
        actions={<>
          <Button variant="secondary" disabled={!db.items.length} onClick={() => setAdj({ itemId: db.items[0].id, kind: 'damage', qty: '', reason: '' })}><SlidersHorizontal size={16} />Adjust stock</Button>
          <Button onClick={() => setEdit({ ...blank })}><Plus size={16} />New item</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stock value" value={ugx(value)} />
        <Stat label="Items tracked" value={db.items.length} tone="gold" />
        <Stat label="Low / out of stock" value={low} tone={low ? 'red' : 'green'} />
        <Stat label="Lots expiring soon" value={expLots} tone={expLots ? 'red' : 'green'} hint={`Within ${db.settings.expiryAlertDays} days`} />
      </div>
      <div className="no-print">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Stock items' }, { id: 'moves', label: 'Movement ledger' }, { id: 'count', label: 'Stock count sheet' }]} />
      </div>

      {tab === 'items' && (
        <DataTable rows={items} columns={cols} actions={itemActions} onRowClick={setView}
          toolbar={<Select value={cat} onChange={(e) => setCat(e.target.value as ItemCategory)} aria-label="Category"><option value="">All categories</option>{Object.entries(categoryLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>} />
      )}
      {tab === 'moves' && (
        <DataTable rows={db.movements} columns={mcols} actions={[{ label: 'View item', icon: Eye, onClick: (m) => setView(db.items.find((i) => i.id === m.itemId) ?? null) }]} searchPlaceholder="Search item, reference…"
          toolbar={<Button variant="secondary" onClick={() => downloadCsv('stock-movements.csv', ['Date', 'Item', 'Movement', 'Qty', 'Source', 'By', 'Note'], db.movements.map((m) => [fmtDateTime(m.date), name(m.itemId), m.type, m.qty, m.ref, m.user, m.note ?? '']))}><Download size={16} />CSV</Button>} />
      )}
      {tab === 'count' && (
        <div className="print-area rounded-xl border border-stone-200 bg-white p-5">
          <div className="mb-4 flex items-start justify-between">
            <div><p className="font-display text-xl font-bold text-wine-800">{db.settings.businessName}</p><p className="text-sm text-stone-500">Physical stock count sheet · {fmtDate(new Date().toISOString())}</p></div>
            <Button variant="secondary" className="no-print" onClick={() => window.print()}><Printer size={16} />Print</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-stone-200 bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-2">Code</th><th className="p-2">Item</th><th className="p-2">Location</th><th className="p-2 text-right">System qty</th><th className="p-2">Counted</th><th className="p-2">Difference</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{db.items.map((i) => <tr key={i.id}><td className="p-2 font-mono text-xs">{i.code}</td><td className="p-2">{i.name}</td><td className="p-2">{i.location}</td><td className="p-2 text-right">{num(i.qty, 2)} {i.unit}</td><td className="p-2"><span className="inline-block w-24 border-b border-stone-400">&nbsp;</span></td><td className="p-2"><span className="inline-block w-20 border-b border-stone-400">&nbsp;</span></td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-6 text-sm text-stone-500">Counted by: ______________________ &nbsp; Checked by: ______________________</p>
        </div>
      )}

      {/* item detail */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''} wide
        footer={view && <Button variant="secondary" onClick={() => { setEdit(view); setView(null); }}>Edit item</Button>}>
        {view && <>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-stone-500">Code</p><p className="font-medium">{view.code}</p></div>
            <div><p className="text-stone-500">In stock</p><p className="font-medium">{num(view.qty, 2)} {view.unit}</p></div>
            <div><p className="text-stone-500">Avg cost</p><p className="font-medium">{ugx(view.cost)}</p></div>
            <div><p className="text-stone-500">{view.category === 'finished' ? 'Selling price' : 'Location'}</p><p className="font-medium">{view.category === 'finished' ? ugx(view.price) : view.location}</p></div>
          </div>
          {view.lots.length > 0 && <>
            <h3 className="mb-2 mt-5 font-semibold">Lots / batches</h3>
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Lot</th><th>Made</th><th>Expires</th><th className="text-right">Qty</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{view.lots.map((l) => <tr key={l.lotNo}><td className="py-1.5 font-mono text-xs">{l.lotNo}</td><td>{fmtDate(l.mfg)}</td><td>{l.expiry && new Date(l.expiry) <= soon ? <Badge tone="amber">{fmtDate(l.expiry)}</Badge> : fmtDate(l.expiry)}</td><td className="text-right">{l.qty}</td></tr>)}</tbody></table>
          </>}
          <h3 className="mb-2 mt-5 font-semibold">Recent movements</h3>
          <ul className="divide-y divide-stone-100 text-sm">
            {db.movements.filter((m) => m.itemId === view.id).slice(0, 10).map((m) => (
              <li key={m.id} className="flex justify-between py-1.5"><span>{m.type} <span className="font-mono text-xs text-stone-500">{m.ref}</span><br /><span className="text-xs text-stone-500">{fmtDateTime(m.date)}</span></span><span className={m.qty < 0 ? 'text-red-600' : 'text-emerald-700'}>{m.qty > 0 ? '+' : ''}{num(m.qty, 2)}</span></li>
            ))}
          </ul>
        </>}
      </Modal>

      {/* add / edit item */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit item' : 'New stock item'}
        footer={<>{edit?.id ? <Button variant="ghost" className="mr-auto text-red-600" onClick={async () => { if (await toast.confirm({ title: `Delete ${edit.name}?`, text: 'This cannot be undone. Records that are already used in transactions cannot be deleted.', danger: true, confirmLabel: 'Delete' })) run(() => deleteItem(edit.id), 'Item deleted').then((ok) => ok && setEdit(null)); }}>Delete</Button> : null}<Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit!.code || !edit!.name) return run(() => { throw new Error('Code and name are required.'); }, ''); if (!edit!.category) return run(() => { throw new Error('Choose a category. Wine you sell must be a Finished product.'); }, ''); if (edit!.category === 'finished' && !(edit!.price > 0)) return run(() => { throw new Error('Enter the selling price. It is filled in automatically on every sale.'); }, ''); run(() => saveItem(edit!), 'Item saved').then((ok) => ok && setEdit(null)); }}>Save</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="Category" hint="Only Finished products can be sold."><Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as ItemCategory })}><option value="" disabled>Choose a category…</option>{Object.entries(categoryLabel).map(([k, v]) => <option key={k} value={k}>{v}{k === 'finished' ? ' (sold to customers)' : ''}</option>)}</Select></Field>
            <Field label="Name" className="col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Unit of measure"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="kg, bottle, pcs" /></Field>
            <Field label="Minimum level"><Input type="number" value={edit.min} onChange={(e) => setEdit({ ...edit, min: Number(e.target.value) })} /></Field>
            {edit.category === 'finished' && <Field label="Selling price (UGX)"><Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></Field>}
            <Field label="Storage location"><Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
            {!edit.id && <>
              <Field label="Opening stock"><Input type="number" value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: Number(e.target.value) })} /></Field>
              <Field label="Unit cost (UGX)"><Input type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></Field>
            </>}
          </div>
        )}
      </Modal>

      {/* adjustment */}
      <Modal open={!!adj} onClose={() => setAdj(null)} title="Stock adjustment"
        footer={<><Button variant="secondary" onClick={() => setAdj(null)}>Cancel</Button><Button onClick={() => run(() => adjustStock(adj!.itemId, adj!.kind, Number(adj!.qty), adj!.reason), 'Adjustment recorded').then((ok) => ok && setAdj(null))}>Save adjustment</Button></>}>
        {adj && (
          <div className="space-y-3">
            <Field label="Item"><Select value={adj.itemId} onChange={(e) => setAdj({ ...adj, itemId: Number(e.target.value) })}>{db.items.map((i) => <option key={i.id} value={i.id}>{i.name} ({num(i.qty, 2)} {i.unit})</option>)}</Select></Field>
            <Field label="Type"><Select value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value as typeof adj.kind })}>
              <option value="damage">Damaged / broken</option><option value="expired">Expired</option><option value="decrease">Count shortage (−)</option><option value="increase">Count surplus (+)</option>
            </Select></Field>
            <Field label="Quantity"><Input type="number" inputMode="decimal" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} /></Field>
            <Field label="Reason (required)"><Textarea value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></Field>
            <p className="text-xs text-stone-500">Adjustments are logged with your name and time in the audit trail.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
