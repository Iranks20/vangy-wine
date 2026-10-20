import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { saleBalance, salePaid, saleTotal, useStore } from '../lib/store';
import { downloadCsv, fmtDate, ugx } from '../lib/format';
import { Badge, Button, Input, PageHeader, Select, Stat, type Tone } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Sale } from '../lib/types';

export function invoiceStatus(s: Sale) {
  const bal = saleBalance(s);
  if (s.status === 'cancelled') return 'Cancelled';
  if (bal <= 0) return 'Paid';
  if (s.dueDate && new Date(s.dueDate + 'T23:59:59') < new Date()) return 'Overdue';
  return salePaid(s) > 0 ? 'Part paid' : 'Unpaid';
}
const tone: Record<string, Tone> = { Paid: 'green', 'Part paid': 'amber', Unpaid: 'blue', Overdue: 'red', Cancelled: 'gray' };

export default function Invoices() {
  const { db } = useStore();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rows = [...db.sales].reverse().filter((s) =>
    (!status || invoiceStatus(s) === status) && (!from || s.date.slice(0, 10) >= from) && (!to || s.date.slice(0, 10) <= to));
  const open = db.sales.filter((s) => saleBalance(s) > 0);

  const cols: Column<Sale>[] = [
    { key: 'invoice', label: 'Invoice no.', render: (s) => <span className="font-medium text-wine-700">{s.invoice}</span> },
    { key: 'date', label: 'Date', value: (s) => s.date, render: (s) => fmtDate(s.date) },
    { key: 'customerName', label: 'Customer' },
    { key: 'due', label: 'Due', value: (s) => s.dueDate ?? '', render: (s) => fmtDate(s.dueDate), hideOnMobile: true },
    { key: 'total', label: 'Amount', align: 'right', value: saleTotal, render: (s) => ugx(saleTotal(s)) },
    { key: 'balance', label: 'Balance', align: 'right', value: saleBalance, render: (s) => <span className={saleBalance(s) > 0 ? 'font-semibold text-red-600' : ''}>{ugx(saleBalance(s))}</span> },
    { key: 'status', label: 'Status', value: invoiceStatus, render: (s) => <Badge tone={tone[invoiceStatus(s)]}>{invoiceStatus(s)}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Invoices" subtitle="Every sale has an invoice. Open one to print, download as PDF or record a payment."
        actions={<>
          <Button variant="secondary" onClick={() => downloadCsv('invoices.csv', ['Invoice', 'Date', 'Customer', 'Due', 'Amount', 'Paid', 'Balance', 'Status'], rows.map((s) => [s.invoice, fmtDate(s.date), s.customerName, fmtDate(s.dueDate), saleTotal(s), salePaid(s), saleBalance(s), invoiceStatus(s)]))}><Download size={16} />Export</Button>
          <Button onClick={() => nav('/sales/new')}><Plus size={16} />New invoice</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unpaid invoices" value={open.length} tone="gold" />
        <Stat label="Amount outstanding" value={ugx(open.reduce((t, s) => t + saleBalance(s), 0))} tone="red" />
        <Stat label="Overdue" value={db.sales.filter((s) => invoiceStatus(s) === 'Overdue').length} tone="red" />
        <Stat label="Paid in full" value={db.sales.filter((s) => invoiceStatus(s) === 'Paid').length} tone="green" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="col-span-2 md:col-span-1">
          <option value="">All statuses</option>{Object.keys(tone).map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>
      <DataTable rows={rows} columns={cols} onRowClick={(s) => nav(`/invoices/${s.id}`)} searchPlaceholder="Search invoice number or customer…" />
    </>
  );
}
