import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, HandCoins, Pencil, Printer, ReceiptText } from 'lucide-react';
import { saleBalance, useStore } from '../lib/store';
import { fmtDateTime, methodLabel, ugx } from '../lib/format';
import { Badge, Button, Card, Empty } from '../components/ui';
import { PaymentModal, SaleEditModal, useSaleActions } from '../components/SaleModals';
import { InvoiceDoc } from '../components/Documents';
import type { Sale } from '../lib/types';

// Used for both /sales/:id and /invoices/:id
export default function SaleDetail() {
  const { id } = useParams();
  const fromInvoices = useLocation().pathname.startsWith('/invoices');
  const { db } = useStore();
  const { cancel, voidReceipt } = useSaleActions();
  const [payFor, setPayFor] = useState<Sale | null>(null);
  const [editFor, setEditFor] = useState<Sale | null>(null);
  const back = fromInvoices ? { to: '/invoices', label: 'All invoices' } : { to: '/sales', label: 'All sales' };
  const s = db.sales.find((x) => x.id === Number(id));
  if (!s) return <Empty title="Invoice not found" action={<Link to={back.to} className="text-wine-700">{back.label}</Link>} />;
  const balance = saleBalance(s);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link to={back.to} className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />{back.label}</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
          {balance > 0 && <Button onClick={() => setPayFor(s)}><HandCoins size={16} />Record payment</Button>}
          <Button variant="secondary" onClick={() => setEditFor(s)}><Pencil size={16} />Edit details</Button>
          {s.status === 'completed' && <Button variant="danger" onClick={() => cancel(s)}><Ban size={16} />Cancel sale</Button>}
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
                    <button className="text-xs text-red-600 hover:underline" onClick={() => voidReceipt(s, p)}>Void</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">No payments yet — full amount on credit.</p>}
        </Card>
      </div>

      <PaymentModal sale={payFor} onClose={() => setPayFor(null)} />
      <SaleEditModal sale={editFor} onClose={() => setEditFor(null)} />
    </>
  );
}
