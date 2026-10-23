import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { saleBalance, salePaid, saleStatus, saleTotal, useStore } from '../lib/store';
import { dayOf } from '../../../shared/reports';
import { downloadCsv, fmtDateTime, methodLabel, ugx } from '../lib/format';
import { Button, Input, PageHeader, Select, Stat } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from './Dashboard';
import type { Sale } from '../lib/types';

export default function Sales() {
  const { db } = useStore();
  const nav = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [person, setPerson] = useState('');
  const [method, setMethod] = useState('');

  const rows = useMemo(() => [...db.sales].reverse().filter((s) =>
    (!from || dayOf(s.date) >= from) && (!to || dayOf(s.date) <= to) &&
    (!status || saleStatus(s) === status) && (!person || s.salesperson === person) &&
    (!method || s.payments.some((p) => p.method === method) || (method === 'credit' && saleBalance(s) > 0))), [db.sales, from, to, status, person, method]);

  const live = rows.filter((s) => s.status === 'completed');
  const people = [...new Set(db.sales.map((s) => s.salesperson))];

  const cols: Column<Sale>[] = [
    { key: 'invoice', label: 'Invoice', render: (s) => <span className="font-medium text-wine-700">{s.invoice}</span> },
    { key: 'date', label: 'Date', value: (s) => s.date, render: (s) => fmtDateTime(s.date) },
    { key: 'customerName', label: 'Customer' },
    { key: 'items', label: 'Items', value: (s) => s.lines.map((l) => `${l.qty}× ${l.name}`).join(', '), hideOnMobile: true },
    { key: 'total', label: 'Total', align: 'right', value: saleTotal, render: (s) => ugx(saleTotal(s)) },
    { key: 'paid', label: 'Paid', align: 'right', value: salePaid, render: (s) => ugx(salePaid(s)), hideOnMobile: true },
    { key: 'balance', label: 'Balance', align: 'right', value: saleBalance, render: (s) => <span className={saleBalance(s) > 0 ? 'font-semibold text-red-600' : ''}>{ugx(saleBalance(s))}</span> },
    { key: 'status', label: 'Status', value: saleStatus, render: (s) => <StatusBadge status={saleStatus(s)} /> },
    { key: 'salesperson', label: 'Salesperson', hideOnMobile: true },
  ];

  const exportCsv = () => downloadCsv('sales.csv', ['Invoice', 'Date', 'Customer', 'Items', 'Total', 'Paid', 'Balance', 'Status', 'Salesperson'],
    rows.map((s) => [s.invoice, fmtDateTime(s.date), s.customerName, s.lines.map((l) => `${l.qty} x ${l.name}`).join('; '), saleTotal(s), salePaid(s), saleBalance(s), saleStatus(s), s.salesperson]));

  return (
    <>
      <PageHeader title="Sales" subtitle="Every invoice, payment and balance."
        actions={<>
          <Button variant="secondary" onClick={exportCsv}><Download size={16} />Export</Button>
          <Button onClick={() => nav('/sales/new')}><Plus size={16} />New sale</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue (filtered)" value={ugx(live.reduce((t, s) => t + saleTotal(s), 0))} />
        <Stat label="Collected" value={ugx(live.reduce((t, s) => t + salePaid(s), 0))} tone="green" />
        <Stat label="Outstanding" value={ugx(live.reduce((t, s) => t + saleBalance(s), 0))} tone="red" />
        <Stat label="Invoices" value={live.length} tone="gold" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Payment status">
          <option value="">All statuses</option>{['Paid', 'Partial', 'Credit', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
          <option value="">All methods</option>{Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Salesperson" className="col-span-2 md:col-span-1">
          <option value="">All salespeople</option>{people.map((p) => <option key={p}>{p}</option>)}
        </Select>
      </div>
      <DataTable rows={rows} columns={cols} onRowClick={(s) => nav(`/sales/${s.id}`)} searchPlaceholder="Search invoice, customer, product…" />
    </>
  );
}
