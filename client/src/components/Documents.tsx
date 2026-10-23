// Printable business documents: tax-style invoice and payment receipt (A4).
import type { ReactNode } from 'react';
import { lineTotal, saleBalance, salePaid, saleTotal } from '../lib/store';
import { amountInWords, fmtDate, fmtDateTime, methodLabel, ugx } from '../lib/format';
import type { Customer, Payment, Sale, Settings } from '../lib/types';
import { cx } from './ui';

function Letterhead({ s, title, rows }: { s: Settings; title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="flex flex-col justify-between gap-5 border-b-4 border-wine-700 pb-5 sm:flex-row">
      <div className="flex min-w-0 gap-3">
        <svg viewBox="0 0 32 32" className="h-14 w-14 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#6b1d2f" />
          <path d="M11 6h10c0 6-1.5 10-5 10s-5-4-5-10zm5 10v8m-4 2h8" stroke="#d4a64a" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <div className="min-w-0 text-sm leading-relaxed text-stone-600">
          <p className="font-display text-xl font-bold text-wine-800">{s.businessName}</p>
          <p>{s.address}</p>
          {s.phone && <p>Tel: {s.phone}</p>}
          <p>{s.email}</p>
          {s.tin && <p>TIN: {s.tin}</p>}
        </div>
      </div>
      <div className="sm:text-right">
        <p className="font-display text-3xl font-bold uppercase tracking-wide text-wine-700">{title}</p>
        <table className="mt-2 text-sm sm:ml-auto">
          <tbody>{rows.map(([k, v]) => <tr key={k}><td className="pr-4 text-stone-500">{k}</td><td className="text-right font-semibold">{v}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Stamp({ text, tone }: { text: string; tone: 'green' | 'red' }) {
  return (
    <div aria-hidden className={cx('pointer-events-none absolute right-8 top-40 rotate-[-14deg] rounded-lg border-4 px-4 py-1 font-display text-3xl font-bold uppercase tracking-widest opacity-25',
      tone === 'green' ? 'border-emerald-600 text-emerald-600' : 'border-red-600 text-red-600')}>{text}</div>
  );
}

function PaymentDetails({ s }: { s: Settings }) {
  const rows = [
    s.bankName && ['Bank', s.bankName],
    s.accountName && ['Account name', s.accountName],
    s.accountNo && ['Account number', s.accountNo],
    s.mobileMoney && ['Mobile money', s.mobileMoney],
  ].filter(Boolean) as [string, string][];
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Payment details</p>
      <table className="text-sm"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="pr-3 text-stone-500">{k}</td><td className="font-medium">{v}</td></tr>)}</tbody></table>
    </div>
  );
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-10 text-sm text-stone-500">
      {[left, right].map((l) => <div key={l}><div className="h-10 border-b border-stone-400" /><p className="mt-1">{l}</p></div>)}
    </div>
  );
}

export function InvoiceDoc({ sale, settings: s, customer }: { sale: Sale; settings: Settings; customer?: Customer }) {
  const total = saleTotal(sale);
  const gross = sale.lines.reduce((t, l) => t + l.qty * l.price, 0);
  const discount = sale.lines.reduce((t, l) => t + l.discount, 0);
  const paid = salePaid(sale);
  const balance = saleBalance(sale);
  const overdue = balance > 0 && sale.dueDate && new Date(sale.dueDate + 'T23:59:59') < new Date();
  const status = sale.status === 'cancelled' ? 'Cancelled' : balance <= 0 ? 'Paid' : overdue ? 'Overdue' : paid > 0 ? 'Part paid' : 'Unpaid';

  return (
    <article className="print-area relative overflow-hidden rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      {sale.status === 'cancelled' ? <Stamp text="Cancelled" tone="red" /> : balance <= 0 && <Stamp text="Paid" tone="green" />}
      <Letterhead s={s} title="Invoice" rows={[
        ['Invoice no.', sale.invoice],
        ['Invoice date', fmtDate(sale.date)],
        ['Due date', fmtDate(sale.dueDate ?? sale.date)],
        ['Status', <span className={status === 'Paid' ? 'text-emerald-700' : status === 'Cancelled' || status === 'Overdue' ? 'text-red-600' : 'text-amber-700'}>{status}</span>],
      ]} />

      <div className="grid gap-4 py-5 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-stone-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Bill to</p>
          <p className="text-base font-semibold">{sale.customerName}</p>
          {customer?.location && <p>{customer.location}</p>}
          {(sale.customerPhone || customer?.phone) && <p>Tel: {sale.customerPhone || customer?.phone}</p>}
          {customer && <p className="text-stone-500">Terms: {customer.terms ? `${customer.terms} days` : 'Due on receipt'}</p>}
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Sale details</p>
          <p>Sold by: <span className="font-medium">{sale.salesperson}</span></p>
          <p>Currency: <span className="font-medium">{s.currency}</span></p>
          {sale.delivery && <p>Delivery: <span className="font-medium">{sale.delivery}</span></p>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-wine-700 text-left text-xs uppercase tracking-wide text-white print:bg-wine-700">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Discount</th><th className="px-3 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {sale.lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-stone-500">{i + 1}</td><td className="px-3 py-2">{l.name}</td>
                <td className="px-3 py-2 text-right">{l.qty}</td><td className="px-3 py-2 text-right">{l.price.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{l.discount ? l.discount.toLocaleString() : '—'}</td><td className="px-3 py-2 text-right font-medium">{lineTotal(l).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
        <div className="max-w-sm text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Amount in words</p>
          <p className="italic">{amountInWords(total)}</p>
        </div>
        <dl className="w-full space-y-1.5 text-sm sm:w-72">
          <div className="flex justify-between"><dt className="text-stone-500">Subtotal</dt><dd>{ugx(gross)}</dd></div>
          {discount > 0 && <div className="flex justify-between"><dt className="text-stone-500">Discount</dt><dd>− {ugx(discount)}</dd></div>}
          <div className="flex justify-between border-t border-stone-300 pt-1.5 text-base font-bold"><dt>Total</dt><dd>{ugx(total)}</dd></div>
          <div className="flex justify-between text-emerald-700"><dt>Amount paid</dt><dd>{ugx(paid)}</dd></div>
          <div className={cx('flex justify-between rounded-md px-2 py-1.5 font-bold', balance > 0 ? 'bg-wine-700 text-white' : 'bg-stone-100')}><dt>Balance due</dt><dd>{ugx(balance)}</dd></div>
        </dl>
      </div>

      {sale.payments.length > 0 && (
        <div className="mt-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Payments received</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">{sale.payments.map((p) => <tr key={p.id}><td className="py-1 font-mono text-xs">{p.receiptNo}</td><td>{fmtDate(p.date)}</td><td>{methodLabel[p.method]}{p.ref ? ` · ${p.ref}` : ''}</td><td className="text-right">{ugx(p.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-5 border-t border-stone-200 pt-5 sm:grid-cols-2">
        <PaymentDetails s={s} />
        <div className="text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Terms & notes</p>
          <p className="text-stone-600">{s.invoiceTerms}</p>
          {sale.notes && <p className="mt-1 text-stone-600">{sale.notes}</p>}
        </div>
      </div>

      <Signatures left="Authorised signature" right="Customer signature" />
      <p className="mt-8 text-center text-xs text-stone-400">Thank you for your business — {s.businessName}</p>
    </article>
  );
}

export function ReceiptDoc({ sale, payment, settings: s }: { sale: Sale; payment: Payment; settings: Settings }) {
  const idx = sale.payments.findIndex((p) => p.id === payment.id);
  const before = sale.payments.slice(0, idx).reduce((t, p) => t + p.amount, 0);
  const total = saleTotal(sale);
  const after = total - before - payment.amount;

  return (
    <article className="print-area relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <Letterhead s={s} title="Receipt" rows={[['Receipt no.', payment.receiptNo], ['Date', fmtDateTime(payment.date)]]} />

      <div className="space-y-4 py-6 text-sm">
        <Line label="Received with thanks from"><span className="text-base font-semibold">{sale.customerName}</span></Line>
        <Line label="The sum of"><span className="italic">{amountInWords(payment.amount)}</span></Line>
        <Line label="Being payment for">Invoice <span className="font-semibold">{sale.invoice}</span> dated {fmtDate(sale.date)}</Line>
        <Line label="Payment method">{methodLabel[payment.method]}{payment.ref ? ` — Ref: ${payment.ref}` : ''}</Line>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="rounded-xl border-2 border-wine-700 px-5 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Amount received</p>
          <p className="text-2xl font-bold text-wine-800">{ugx(payment.amount)}</p>
        </div>
        <dl className="w-full space-y-1 text-sm sm:w-64">
          <div className="flex justify-between"><dt className="text-stone-500">Invoice total</dt><dd>{ugx(total)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-500">Previously paid</dt><dd>{ugx(before)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-500">This payment</dt><dd>{ugx(payment.amount)}</dd></div>
          <div className="flex justify-between border-t border-stone-300 pt-1 font-bold"><dt>Balance remaining</dt><dd className={after > 0 ? 'text-red-600' : 'text-emerald-700'}>{ugx(Math.max(0, after))}</dd></div>
        </dl>
      </div>

      <Signatures left={`Received by: ${sale.salesperson}`} right="Customer signature" />
      <p className="mt-8 text-center text-xs text-stone-400">This receipt is valid only for the amount shown. Thank you — {s.businessName}</p>
    </article>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-dotted border-stone-300 pb-1.5 sm:flex-row sm:gap-3">
      <span className="shrink-0 text-stone-500 sm:w-48">{label}:</span><span>{children}</span>
    </div>
  );
}
