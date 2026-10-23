import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import { useStore } from '../lib/store';
import { dayOf } from '../../../shared/reports';
import { downloadCsv, fmtDateTime, methodLabel, today, ugx } from '../lib/format';
import { Button, Empty, PageHeader, Stat } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { ReceiptDoc } from '../components/Documents';
import type { Payment, Sale } from '../lib/types';

type Row = Payment & { sale: Sale };

const useReceipts = () => {
  const { db } = useStore();
  return db.sales.flatMap((sale) => sale.payments.map((p) => ({ ...p, sale })))
    .sort((a, b) => (b.receiptNo ?? '').localeCompare(a.receiptNo ?? ''));
};

export default function Receipts() {
  const rows = useReceipts();
  const nav = useNavigate();
  const thisMonth = rows.filter((r) => dayOf(r.date).slice(0, 7) === today().slice(0, 7));

  const cols: Column<Row>[] = [
    { key: 'receiptNo', label: 'Receipt no.', value: (r) => r.receiptNo ?? '', render: (r) => <span className="font-medium text-wine-700">{r.receiptNo}</span> },
    { key: 'date', label: 'Date', value: (r) => r.date, render: (r) => fmtDateTime(r.date) },
    { key: 'from', label: 'Received from', value: (r) => r.sale.customerName },
    { key: 'invoice', label: 'Invoice', value: (r) => r.sale.invoice, hideOnMobile: true },
    { key: 'method', label: 'Method', value: (r) => methodLabel[r.method] },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className="font-semibold">{ugx(r.amount)}</span> },
  ];

  return (
    <>
      <PageHeader title="Receipts" subtitle="A receipt is issued for every payment received from a customer."
        actions={<Button variant="secondary" onClick={() => downloadCsv('receipts.csv', ['Receipt', 'Date', 'Received from', 'Invoice', 'Method', 'Reference', 'Amount'], rows.map((r) => [r.receiptNo ?? '', fmtDateTime(r.date), r.sale.customerName, r.sale.invoice, methodLabel[r.method], r.ref ?? '', r.amount]))}><Download size={16} />Export</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receipts this month" value={thisMonth.length} tone="gold" />
        <Stat label="Received this month" value={ugx(thisMonth.reduce((t, r) => t + r.amount, 0))} tone="green" />
        <Stat label="All receipts" value={rows.length} />
        <Stat label="All money received" value={ugx(rows.reduce((t, r) => t + r.amount, 0))} tone="gray" />
      </div>
      <DataTable rows={rows} columns={cols} onRowClick={(r) => nav(`/receipts/${r.receiptNo}`)} searchPlaceholder="Search receipt, invoice or customer…" />
    </>
  );
}

export function ReceiptView() {
  const { no } = useParams();
  const { db } = useStore();
  const r = useReceipts().find((x) => x.receiptNo === no);
  if (!r) return <Empty title="Receipt not found" action={<Link to="/receipts" className="text-wine-700">Back to receipts</Link>} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link to="/receipts" className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />All receipts</Link>
        <div className="flex flex-wrap gap-2">
          <Link to={`/invoices/${r.sale.id}`}><Button variant="secondary"><FileText size={16} />View invoice</Button></Link>
          <Button onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
        </div>
      </div>
      <ReceiptDoc sale={r.sale} payment={r} settings={db.settings} />
    </>
  );
}
