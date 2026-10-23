import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, HandCoins, Pencil, Printer, ReceiptText } from 'lucide-react';
import { newIdemKey } from '../lib/api';
import { saleBalance, useStore } from '../lib/store';
import { fmtDateTime, methodLabel, ugx } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Textarea, useRun, useToast } from '../components/ui';
import { InvoiceDoc } from '../components/Documents';
import type { Method } from '../lib/types';

// Used for both /sales/:id and /invoices/:id
export default function SaleDetail() {
  const { id } = useParams();
  const fromInvoices = useLocation().pathname.startsWith('/invoices');
  const nav = useNavigate();
  const { db, addPayment, cancelSale, updateSale, voidPayment } = useStore();
  const run = useRun();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [ref, setRef] = useState('');
  const [payKey, setPayKey] = useState(newIdemKey);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ salesperson: string; delivery: string; notes: string } | null>(null);
  const back = fromInvoices ? { to: '/invoices', label: 'All invoices' } : { to: '/sales', label: 'All sales' };
  const s = db.sales.find((x) => x.id === Number(id));
  if (!s) return <Empty title="Invoice not found" action={<Link to={back.to} className="text-wine-700">{back.label}</Link>} />;
  const balance = saleBalance(s);

  const cancel = async () => {
    const reason = await toast.confirm({ title: `Cancel ${s.invoice}?`, text: 'Stock will be returned and any payments refunded in the cashbook. The invoice stays on record as cancelled.', danger: true, reason: true, confirmLabel: 'Cancel sale' });
    if (reason) run(() => cancelSale(s.id, reason), 'Sale cancelled and stock returned');
  };
  const savePayment = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const receiptNo = await addPayment(s.id, Number(amount), method, ref, payKey);
      setPayOpen(false);
      toast.success(`Payment recorded — receipt ${receiptNo}`);
      nav(`/receipts/${receiptNo}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link to={back.to} className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />{back.label}</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
          {balance > 0 && <Button onClick={() => { setAmount(String(balance)); setRef(''); setPayKey(newIdemKey()); setPayOpen(true); }}><HandCoins size={16} />Record payment</Button>}
          <Button variant="secondary" onClick={() => setEdit({ salesperson: s.salesperson, delivery: s.delivery ?? '', notes: s.notes ?? '' })}><Pencil size={16} />Edit details</Button>
          {s.status === 'completed' && <Button variant="danger" onClick={cancel}><Ban size={16} />Cancel sale</Button>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 print:block">
        <div className="min-w-0 lg:col-span-2">
          <InvoiceDoc sale={s} settings={db.settings} customer={db.customers.find((c) => c.id === s.customerId)} />
        </div>

        <Card title="Receipts issued" className="self-start no-print">
          {s.payments.length ? (
            <ul className="divide-y divide-stone-100 text-sm">
              {s.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Link to={`/receipts/${p.receiptNo}`} className={`flex flex-1 items-center justify-between gap-2 py-2 hover:text-wine-700 ${p.voided ? 'opacity-70' : ''}`}>
                    <div>
                      <p className="flex items-center gap-1.5 font-medium"><ReceiptText size={14} />{p.receiptNo}{p.voided && <Badge tone="red">VOID</Badge>}</p>
                      <p className="text-xs text-stone-500">{fmtDateTime(p.date)} · {methodLabel[p.method]}{p.voided && p.voidReason ? ` · ${p.voidReason}` : ''}</p>
                    </div>
                    <span className={p.voided ? 'text-stone-400 line-through' : 'font-semibold text-emerald-700'}>{ugx(p.amount)}</span>
                  </Link>
                  {!p.voided && s.status === 'completed' && (
                    <button className="text-xs text-red-600 hover:underline" onClick={async () => {
                      const reason = await toast.confirm({ title: `Void receipt ${p.receiptNo}?`, text: `Use this when the payment was entered by mistake. The receipt stays on record marked VOID and ${ugx(p.amount)} goes back onto the balance.`, danger: true, reason: true, confirmLabel: 'Void receipt' });
                      if (reason) run(() => voidPayment(s.id, p.id, reason), 'Receipt voided');
                    }}>Void</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">No payments yet — full amount on credit.</p>}
        </Card>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Payment for ${s.invoice}`}
        footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={savePayment} disabled={busy}>{busy ? 'Saving…' : 'Save & issue receipt'}</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-stone-600">Outstanding balance: <b>{ugx(balance)}</b></p>
          <Field label="Amount"><Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>
          <Field label="Reference (optional)"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. MoMo transaction ID" /></Field>
        </div>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit ${s.invoice}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => run(() => updateSale(s.id, edit!), 'Invoice details updated').then((ok) => ok && setEdit(null))}>Save</Button></>}>
        {edit && <div className="space-y-3">
          <p className="text-xs text-stone-500">Amounts and products cannot be edited — cancel the sale and record it again instead, so the stock and audit trail stay correct.</p>
          <Field label="Sold by"><Select value={edit.salesperson} onChange={(e) => setEdit({ ...edit, salesperson: e.target.value })}>
            {[...new Set([edit.salesperson, ...db.employees.filter((x) => x.active).map((x) => x.name)])].map((n) => <option key={n}>{n}</option>)}
          </Select></Field>
          <Field label="Delivery details"><Textarea value={edit.delivery} onChange={(e) => setEdit({ ...edit, delivery: e.target.value })} /></Field>
          <Field label="Notes"><Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        </div>}
      </Modal>
    </>
  );
}
