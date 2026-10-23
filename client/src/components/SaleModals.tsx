// Sale actions shared by the Sales, Invoices, Receipts and invoice-detail pages.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newIdemKey } from '../lib/api';
import { saleBalance, useStore } from '../lib/store';
import { methodLabel, ugx } from '../lib/format';
import type { Method, Payment, Sale } from '../lib/types';
import { Button, Field, Input, Modal, Select, Textarea, useRun, useToast } from './ui';

export function PaymentModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { addPayment } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ amount: '', method: 'cash' as Method, ref: '', key: '' });
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<number | null>(null);
  // reset the form each time it opens for a sale
  if (sale && openFor !== sale.id) { setOpenFor(sale.id); setForm({ amount: String(saleBalance(sale)), method: 'cash', ref: '', key: newIdemKey() }); }
  if (!sale && openFor !== null) setOpenFor(null);

  const save = async () => {
    if (!sale || busy) return;
    setBusy(true);
    try {
      const receiptNo = await addPayment(sale.id, Number(form.amount), form.method, form.ref, form.key);
      onClose();
      toast.success(`Payment recorded — receipt ${receiptNo}`);
      nav(`/receipts/${receiptNo}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!sale} onClose={onClose} title={`Payment for ${sale?.invoice ?? ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save & issue receipt'}</Button></>}>
      {sale && <div className="space-y-3">
        <p className="text-sm text-stone-600">{sale.customerName} · outstanding balance <b>{ugx(saleBalance(sale))}</b></p>
        <Field label="Amount"><Input type="number" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Method"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Method })}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>
        <Field label="Reference (optional)"><Input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="e.g. MoMo transaction ID" /></Field>
      </div>}
    </Modal>
  );
}

export function SaleEditModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { db, updateSale } = useStore();
  const run = useRun();
  const [edit, setEdit] = useState({ salesperson: '', delivery: '', notes: '' });
  const [openFor, setOpenFor] = useState<number | null>(null);
  if (sale && openFor !== sale.id) { setOpenFor(sale.id); setEdit({ salesperson: sale.salesperson, delivery: sale.delivery ?? '', notes: sale.notes ?? '' }); }
  if (!sale && openFor !== null) setOpenFor(null);

  return (
    <Modal open={!!sale} onClose={onClose} title={`Edit ${sale?.invoice ?? ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => sale && run(() => updateSale(sale.id, edit), 'Invoice details updated').then((ok) => ok && onClose())}>Save</Button></>}>
      <div className="space-y-3">
        <p className="text-xs text-stone-500">Amounts and products cannot be edited — cancel the sale and record it again instead, so the stock and audit trail stay correct.</p>
        <Field label="Sold by"><Select value={edit.salesperson} onChange={(e) => setEdit({ ...edit, salesperson: e.target.value })}>
          {[...new Set([edit.salesperson, ...db.employees.filter((x) => x.active).map((x) => x.name)])].filter(Boolean).map((n) => <option key={n}>{n}</option>)}
        </Select></Field>
        <Field label="Delivery details"><Textarea value={edit.delivery} onChange={(e) => setEdit({ ...edit, delivery: e.target.value })} /></Field>
        <Field label="Notes"><Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// Confirm-then-act helpers for cancelling sales and voiding receipts.
export function useSaleActions() {
  const { cancelSale, voidPayment } = useStore();
  const run = useRun();
  const toast = useToast();
  return {
    cancel: async (s: Sale) => {
      const reason = await toast.confirm({ title: `Cancel ${s.invoice}?`, text: 'Stock will be returned and any payments refunded in the cashbook. The invoice stays on record as cancelled.', danger: true, reason: true, confirmLabel: 'Cancel sale' });
      if (reason) await run(() => cancelSale(s.id, reason), 'Sale cancelled and stock returned');
    },
    voidReceipt: async (s: Sale, p: Payment) => {
      const reason = await toast.confirm({ title: `Void receipt ${p.receiptNo}?`, text: `Use this when the payment was entered by mistake. The receipt stays on record marked VOID and ${ugx(p.amount)} goes back onto the invoice balance.`, danger: true, reason: true, confirmLabel: 'Void receipt' });
      if (reason) await run(() => voidPayment(s.id, p.id, reason), 'Receipt voided');
    },
  };
}
