import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, HandCoins, Printer, ReceiptText } from 'lucide-react';
import { saleBalance, useStore } from '../lib/store';
import { fmtDateTime, methodLabel, ugx } from '../lib/format';
import { Button, Card, Empty, Field, Input, Modal, Select, useRun, useToast } from '../components/ui';
import { InvoiceDoc } from '../components/Documents';
import type { Method } from '../lib/types';

// Used for both /sales/:id and /invoices/:id
export default function SaleDetail() {
  const { id } = useParams();
  const fromInvoices = useLocation().pathname.startsWith('/invoices');
  const nav = useNavigate();
  const { db, addPayment, cancelSale } = useStore();
  const run = useRun();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [ref, setRef] = useState('');
  const back = fromInvoices ? { to: '/invoices', label: 'All invoices' } : { to: '/sales', label: 'All sales' };
  const s = db.sales.find((x) => x.id === Number(id));
  if (!s) return <Empty title="Invoice not found" action={<Link to={back.to} className="text-wine-700">{back.label}</Link>} />;
  const balance = saleBalance(s);

  const cancel = async () => {
    const reason = await toast.confirm({ title: `Cancel ${s.invoice}?`, text: 'Stock will be returned and any payments refunded in the cashbook. The invoice stays on record as cancelled.', danger: true, reason: true, confirmLabel: 'Cancel sale' });
    if (reason) run(() => cancelSale(s.id, reason), 'Sale cancelled and stock returned');
  };
  const savePayment = () => {
    try {
      const receiptNo = addPayment(s.id, Number(amount), method, ref);
      setPayOpen(false);
      toast.success(`Payment recorded — receipt ${receiptNo}`);
      nav(`/receipts/${receiptNo}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link to={back.to} className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />{back.label}</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
          {balance > 0 && <Button onClick={() => { setAmount(String(balance)); setRef(''); setPayOpen(true); }}><HandCoins size={16} />Record payment</Button>}
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
                <li key={p.id}>
                  <Link to={`/receipts/${p.receiptNo}`} className="flex items-center justify-between gap-2 py-2 hover:text-wine-700">
                    <div><p className="flex items-center gap-1.5 font-medium"><ReceiptText size={14} />{p.receiptNo}</p><p className="text-xs text-stone-500">{fmtDateTime(p.date)} · {methodLabel[p.method]}</p></div>
                    <span className="font-semibold text-emerald-700">{ugx(p.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">No payments yet — full amount on credit.</p>}
        </Card>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Payment for ${s.invoice}`}
        footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={savePayment}>Save & issue receipt</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-stone-600">Outstanding balance: <b>{ugx(balance)}</b></p>
          <Field label="Amount"><Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>{(['cash', 'mobile_money', 'bank'] as const).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}</Select></Field>
          <Field label="Reference (optional)"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. MoMo transaction ID" /></Field>
        </div>
      </Modal>
    </>
  );
}
