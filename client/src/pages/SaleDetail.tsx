import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, HandCoins, Printer } from 'lucide-react';
import { lineTotal, saleBalance, salePaid, saleStatus, saleTotal, useStore } from '../lib/store';
import { fmtDate, fmtDateTime, methodLabel, ugx } from '../lib/format';
import { Button, Card, Empty, Field, Input, Modal, Select, useRun, useToast } from '../components/ui';
import { StatusBadge } from './Dashboard';
import type { Method } from '../lib/types';

export default function SaleDetail() {
  const { id } = useParams();
  const { db, addPayment, cancelSale } = useStore();
  const run = useRun();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [ref, setRef] = useState('');
  const s = db.sales.find((x) => x.id === Number(id));
  if (!s) return <Empty title="Sale not found" action={<Link to="/sales" className="text-wine-700">Back to sales</Link>} />;
  const st = db.settings;
  const balance = saleBalance(s);

  const cancel = async () => {
    const reason = await toast.confirm({ title: `Cancel ${s.invoice}?`, text: 'Stock will be returned and any payments refunded in the cashbook. The invoice stays on record as cancelled.', danger: true, reason: true, confirmLabel: 'Cancel sale' });
    if (reason) run(() => cancelSale(s.id, reason), 'Sale cancelled and stock returned');
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link to="/sales" className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />All sales</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
          {balance > 0 && <Button onClick={() => { setAmount(String(balance)); setPayOpen(true); }}><HandCoins size={16} />Record payment</Button>}
          {s.status === 'completed' && <Button variant="danger" onClick={cancel}><Ban size={16} />Cancel sale</Button>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="print-area lg:col-span-2">
          <div className="flex flex-col justify-between gap-4 border-b-2 border-wine-700 pb-4 sm:flex-row">
            <div>
              <p className="font-display text-xl font-bold text-wine-800">{st.businessName}</p>
              <p className="text-sm text-stone-500">{st.address} · {st.phone}</p>
              <p className="text-sm text-stone-500">{st.email}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-widest text-gold-500">{balance > 0 ? 'Invoice' : 'Receipt'}</p>
              <p className="text-lg font-bold">{s.invoice}</p>
              <p className="text-sm text-stone-500">{fmtDateTime(s.date)}</p>
              <div className="mt-1"><StatusBadge status={saleStatus(s)} /></div>
            </div>
          </div>
          <div className="grid gap-2 py-4 text-sm sm:grid-cols-2">
            <div><p className="text-stone-500">Bill to</p><p className="font-semibold">{s.customerName}</p>{s.customerPhone && <p>{s.customerPhone}</p>}</div>
            <div className="sm:text-right"><p className="text-stone-500">Served by</p><p className="font-medium">{s.salesperson}</p>{balance > 0 && s.dueDate && <p className="text-red-600">Due {fmtDate(s.dueDate)}</p>}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-stone-200 bg-stone-50 text-left text-xs uppercase text-stone-500">
                <tr><th className="px-2 py-2">Product</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">Disc.</th><th className="px-2 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {s.lines.map((l, i) => (
                  <tr key={i}><td className="px-2 py-2">{l.name}</td><td className="px-2 py-2 text-right">{l.qty}</td><td className="px-2 py-2 text-right">{l.price.toLocaleString()}</td><td className="px-2 py-2 text-right">{l.discount ? l.discount.toLocaleString() : '—'}</td><td className="px-2 py-2 text-right font-medium">{lineTotal(l).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between font-bold"><dt>Total</dt><dd>{ugx(saleTotal(s))}</dd></div>
            <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd>{ugx(salePaid(s))}</dd></div>
            <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold"><dt>Balance due</dt><dd className={balance > 0 ? 'text-red-600' : ''}>{ugx(balance)}</dd></div>
          </dl>
          {(s.delivery || s.notes) && <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">{s.delivery && <p><b>Delivery:</b> {s.delivery}</p>}{s.notes && <p><b>Notes:</b> {s.notes}</p>}</div>}
          <p className="mt-6 text-center text-xs text-stone-400">Thank you for choosing Vangy Natural Sweet Red Wine.</p>
        </Card>

        <Card title="Payment history" className="self-start no-print">
          {s.payments.length ? (
            <ul className="divide-y divide-stone-100 text-sm">
              {s.payments.map((p) => (
                <li key={p.id} className="flex justify-between py-2"><div><p className="font-medium">{methodLabel[p.method]}</p><p className="text-xs text-stone-500">{fmtDateTime(p.date)}{p.ref ? ` · ${p.ref}` : ''}</p></div><span className="font-semibold text-emerald-700">{ugx(p.amount)}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">No payments yet — full amount on credit.</p>}
        </Card>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Payment for ${s.invoice}`}
        footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={() => run(() => addPayment(s.id, Number(amount), method, ref), 'Payment recorded') && setPayOpen(false)}>Save payment</Button></>}>
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
