import { useState } from 'react';
import { Ban, Eye, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { purchaseBalance, purchaseBilled, purchasePaid, purchaseTotal, useStore } from '../lib/store';
import { fmtDate, fmtDateTime, methodLabel, num, ugx } from '../lib/format';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Stat, useRun, useToast } from '../components/ui';
import { DataTable, type Column, type RowAction } from '../components/DataTable';
import type { Method, Purchase } from '../lib/types';

const tone = { ordered: 'blue', partial: 'amber', received: 'green', cancelled: 'gray' } as const;

export default function Purchases() {
  const { db, updatePurchase, voidPurchasePayment, addPurchase, receivePurchase, payPurchase, cancelPurchase } = useStore();
  const run = useRun();
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const buyable = db.items.filter((i) => i.category !== 'finished');
  const blankLine = () => ({ itemId: buyable[0]?.id ?? 0, qty: 1, cost: buyable[0]?.cost ?? 0, received: 0 });
  const [form, setForm] = useState({ supplierId: db.suppliers[0]?.id, supplierInvoice: '', transport: 0, lines: [blankLine()] });
  const [editId, setEditId] = useState<number | null>(null);
  const startNew = () => { setEditId(null); setForm({ supplierId: db.suppliers[0]?.id, supplierInvoice: '', transport: 0, lines: [blankLine()] }); setNewOpen(true); };
  const [openId, setOpenId] = useState<number | null>(null);
  const [recv, setRecv] = useState<number[]>([]);
  const [pay, setPay] = useState({ amount: '', method: 'bank' as Method });
  const p = db.purchases.find((x) => x.id === openId);
  const sup = (id: number) => db.suppliers.find((s) => s.id === id)?.name ?? '';
  const item = (id: number) => db.items.find((i) => i.id === id)!;

  const cols: Column<Purchase>[] = [
    { key: 'po', label: 'PO number', render: (x) => <span className="font-medium text-wine-700">{x.po}</span> },
    { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
    { key: 'sup', label: 'Supplier', value: (x) => sup(x.supplierId) },
    { key: 'total', label: 'Order value', align: 'right', value: purchaseTotal, render: (x) => ugx(purchaseTotal(x)) },
    { key: 'paid', label: 'Paid', align: 'right', value: purchasePaid, render: (x) => ugx(purchasePaid(x)), hideOnMobile: true },
    { key: 'bal', label: 'We owe', align: 'right', value: purchaseBalance, render: (x) => <span className={purchaseBalance(x) > 0 ? 'font-semibold text-red-600' : ''}>{ugx(Math.max(0, purchaseBalance(x)))}</span> },
    { key: 'status', label: 'Delivery', render: (x) => <Badge tone={tone[x.status]}>{x.status}</Badge> },
  ];

  const openPo = (x: Purchase) => { setOpenId(x.id); setRecv(x.lines.map((l) => l.qty - l.received)); setPay({ amount: String(Math.max(0, purchaseTotal(x) - purchasePaid(x))), method: 'bank' }); };
  const startEdit = (x: Purchase) => {
    setEditId(x.id);
    setForm({ supplierId: x.supplierId, supplierInvoice: x.supplierInvoice ?? '', transport: x.transport, lines: x.lines.map((l) => ({ ...l })) });
    setOpenId(null); setNewOpen(true);
  };
  const live = (x: Purchase) => x.payments.filter((y) => !y.voided);
  const save = async () => {
    const body = { supplierId: Number(form.supplierId), supplierInvoice: form.supplierInvoice, transport: Number(form.transport), date: new Date().toISOString(), lines: form.lines.filter((l) => l.qty > 0) };
    const ok = editId ? await run(() => updatePurchase(editId, body), 'Purchase order updated') : await run(() => addPurchase(body), 'Purchase order created');
    if (ok) setNewOpen(false);
  };

  const editable = (x: Purchase) => x.status === 'ordered' && !live(x).length && !x.lines.some((l) => l.received > 0);
  const cancelOrder = async (x: Purchase) => {
    if (await toast.confirm({ title: `Cancel ${x.po}?`, text: 'The order stays on record as cancelled.', danger: true, confirmLabel: 'Cancel order' })) run(() => cancelPurchase(x.id), 'Order cancelled');
  };
  const actions: RowAction<Purchase>[] = [
    { label: 'View details', icon: Eye, onClick: openPo },
    { label: 'Receive goods', icon: Truck, onClick: openPo, show: (x) => x.status === 'ordered' || x.status === 'partial' },
    { label: 'Edit order', icon: Pencil, onClick: startEdit, show: editable },
    { label: 'Cancel order', icon: Ban, tone: 'danger', onClick: cancelOrder, show: (x) => x.status === 'ordered' && !live(x).length },
  ];

  return (
    <>
      <PageHeader title="Purchases" subtitle="Stock only increases when goods are actually received."
        actions={<Button onClick={startNew}><Plus size={16} />New purchase order</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open orders" value={db.purchases.filter((x) => x.status === 'ordered' || x.status === 'partial').length} tone="gold" />
        <Stat label="Received value" value={ugx(db.purchases.reduce((t, x) => t + purchaseBilled(x), 0))} />
        <Stat label="Paid to suppliers" value={ugx(db.purchases.reduce((t, x) => t + purchasePaid(x), 0))} tone="green" />
        <Stat label="Owed to suppliers" value={ugx(db.purchases.reduce((t, x) => t + Math.max(0, purchaseBalance(x)), 0))} tone="red" />
      </div>
      <DataTable rows={[...db.purchases].reverse()} columns={cols} actions={actions} onRowClick={openPo} />

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title={editId ? `Edit ${db.purchases.find((x) => x.id === editId)?.po}` : 'New purchase order'} wide
        footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button><Button onClick={save} disabled={!db.suppliers.length || !buyable.length}>{editId ? 'Save changes' : 'Create order'}</Button></>}>
        {(!db.suppliers.length || !buyable.length) && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">First add {!db.suppliers.length ? 'a supplier (Suppliers page)' : ''}{!db.suppliers.length && !buyable.length ? ' and ' : ''}{!buyable.length ? 'a raw material or packaging item (Inventory page)' : ''}.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier"><Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: Number(e.target.value) })}>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Supplier invoice no."><Input value={form.supplierInvoice} onChange={(e) => setForm({ ...form, supplierInvoice: e.target.value })} /></Field>
          <Field label="Transport & other costs"><Input type="number" value={form.transport} onChange={(e) => setForm({ ...form, transport: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4 space-y-2">
          {form.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] items-end gap-2">
              <Field label={i ? '' : 'Item'}><Select value={l.itemId} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, itemId: Number(e.target.value), cost: item(Number(e.target.value)).cost } : x)) })}>{buyable.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
              <Field label={i ? '' : 'Qty'}><Input type="number" value={l.qty} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)) })} /></Field>
              <Field label={i ? '' : 'Unit cost'}><Input type="number" value={l.cost} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, cost: Number(e.target.value) } : x)) })} /></Field>
              <button className="rounded-lg p-2.5 text-stone-400 hover:text-red-600 disabled:opacity-30" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 size={18} /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}><Plus size={16} />Add item</Button>
          <p className="text-right font-semibold">Total: {ugx(form.lines.reduce((t, l) => t + l.qty * l.cost, 0) + Number(form.transport))}</p>
        </div>
      </Modal>

      <Modal open={!!p} onClose={() => setOpenId(null)} title={p ? `${p.po} — ${sup(p.supplierId)}` : ''} wide>
        {p && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-stone-500">Ordered</p><p className="font-medium">{fmtDate(p.date)}</p></div>
              <div><p className="text-stone-500">Supplier invoice</p><p className="font-medium">{p.supplierInvoice || '—'}</p></div>
              <div><p className="text-stone-500">Order value</p><p className="font-medium">{ugx(purchaseTotal(p))}</p></div>
              <div><p className="text-stone-500">Balance owed</p><p className="font-medium text-red-600">{ugx(Math.max(0, purchaseBalance(p)))}</p></div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Item</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Unit cost</th>{p.status !== 'received' && p.status !== 'cancelled' && <th className="w-24 text-right">Receive now</th>}</tr></thead>
              <tbody className="divide-y divide-stone-100">
                {p.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2">{item(l.itemId).name}</td><td className="text-right">{num(l.qty)}</td>
                    <td className="text-right">{num(l.received)}{l.received < l.qty && l.received > 0 && <span className="ml-1 text-xs text-amber-700">({num(l.qty - l.received)} short)</span>}</td>
                    <td className="text-right">{ugx(l.cost)}</td>
                    {p.status !== 'received' && p.status !== 'cancelled' && <td className="pl-2"><Input type="number" value={recv[i] ?? 0} onChange={(e) => setRecv(recv.map((x, j) => (j === i ? Number(e.target.value) : x)))} aria-label="Receive quantity" /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2">
              {p.status !== 'received' && p.status !== 'cancelled' && <Button onClick={() => run(() => receivePurchase(p.id, recv), 'Goods received into stock')}><Truck size={16} />Receive goods</Button>}
              {p.status === 'ordered' && !live(p).length && !p.lines.some((l) => l.received > 0) && <Button variant="secondary" onClick={() => startEdit(p)}>Edit order</Button>}
              {p.status === 'ordered' && !live(p).length && <Button variant="ghost" onClick={async () => { if (await toast.confirm({ title: 'Cancel this order?', text: 'The order stays on record as cancelled.', danger: true })) run(() => cancelPurchase(p.id), 'Order cancelled'); }}>Cancel order</Button>}
            </div>
            {p.status !== 'cancelled' && purchaseTotal(p) - purchasePaid(p) > 0 && (
              <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3 sm:flex-row sm:items-end">
                <Field label="Pay supplier" className="flex-1"><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as Method })}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>
                <Button onClick={() => run(() => payPurchase(p.id, Number(pay.amount), pay.method), 'Supplier payment recorded')}>Record payment</Button>
              </div>
            )}
            {p.payments.length > 0 && <div><h3 className="mb-1 text-sm font-semibold">Payments</h3><ul className="divide-y divide-stone-100 text-sm">{p.payments.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className={x.voided ? 'text-stone-400' : ''}>{fmtDateTime(x.date)} · {methodLabel[x.method]}{x.voided && <> · <Badge tone="red">VOID</Badge>{x.voidReason ? ` ${x.voidReason}` : ''}</>}</span>
                <span className="flex items-center gap-3">
                  <span className={x.voided ? 'text-stone-400 line-through' : 'font-medium'}>{ugx(x.amount)}</span>
                  {!x.voided && <button className="text-xs text-red-600 hover:underline" onClick={async () => { const r = await toast.confirm({ title: 'Void this supplier payment?', text: 'Use this when the payment was entered by mistake. It stays on record marked VOID and the amount is owed again.', danger: true, reason: true, confirmLabel: 'Void payment' }); if (r) run(() => voidPurchasePayment(p.id, x.id, r), 'Payment voided'); }}>Void</button>}
                </span>
              </li>))}</ul></div>}
          </div>
        )}
      </Modal>
    </>
  );
}
