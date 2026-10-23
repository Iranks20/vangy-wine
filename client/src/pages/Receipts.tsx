import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import { useStore } from '../lib/store';
import { dayOf } from '../../../shared/reports';
import { downloadCsv, fmtDateTime, methodLabel, today, ugx } from '../lib/format';
import { Badge, Button, Empty, PageHeader, Stat, useRun, useToast } from '../components/ui';
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
  const valid = rows.filter((r) => !r.voided);
  const thisMonth = valid.filter((r) => dayOf(r.date).slice(0, 7) === today().slice(0, 7));

  const cols: Column<Row>[] = [
    { key: 'receiptNo', label: 'Receipt no.', value: (r) => r.receiptNo ?? '', render: (r) => <span className="font-medium text-wine-700">{r.receiptNo}</span> },
    { key: 'date', label: 'Date', value: (r) => r.date, render: (r) => fmtDateTime(r.date) },
    { key: 'from', label: 'Received from', value: (r) => r.sale.customerName },
    { key: 'invoice', label: 'Invoice', value: (r) => r.sale.invoice, hideOnMobile: true },
    { key: 'method', label: 'Method', value: (r) => methodLabel[r.method] },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className={r.voided ? 'text-stone-400 line-through' : 'font-semibold'}>{ugx(r.amount)}</span> },
    { key: 'status', label: 'Status', value: (r) => (r.voided ? 'Void' : 'Valid'), render: (r) => <Badge tone={r.voided ? 'red' : 'green'}>{r.voided ? 'Void' : 'Valid'}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Receipts" subtitle="A receipt is issued for every payment received from a customer."
        actions={<Button variant="secondary" onClick={() => downloadCsv('receipts.csv', ['Receipt', 'Date', 'Received from', 'Invoice', 'Method', 'Reference', 'Amount'], rows.map((r) => [r.receiptNo ?? '', fmtDateTime(r.date), r.sale.customerName, r.sale.invoice, methodLabel[r.method], r.ref ?? '', r.amount]))}><Download size={16} />Export</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receipts this month" value={thisMonth.length} tone="gold" />
        <Stat label="Received this month" value={ugx(thisMonth.reduce((t, r) => t + r.amount, 0))} tone="green" />
        <Stat label="All receipts" value={valid.length} hint={rows.length > valid.length ? `${rows.length - valid.length} voided` : undefined} />
        <Stat label="All money received" value={ugx(valid.reduce((t, r) => t + r.amount, 0))} tone="gray" />
      </div>
      <DataTable rows={rows} columns={cols} onRowClick={(r) => nav(`/receipts/${r.receiptNo}`)} searchPlaceholder="Search receipt, invoice or customer…" />
    </>
  );
}

export function ReceiptView() {
  const { no } = useParams();
  const { db, voidPayment } = useStore();
  const run = useRun();
  const toast = useToast();
  const r = useReceipts().find((x) => x.receiptNo === no);
  if (!r) return <Empty title="Receipt not found" action={<Link to="/receipts" className="text-wine-700">Back to receipts</Link>} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link to="/receipts" className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />All receipts</Link>
        <div className="flex flex-wrap gap-2">
          <Link to={`/invoices/${r.sale.id}`}><Button variant="secondary"><FileText size={16} />View invoice</Button></Link>
          <Button onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
          {!r.voided && r.sale.status === 'completed' && <Button variant="danger" onClick={async () => {
            const reason = await toast.confirm({ title: `Void receipt ${r.receiptNo}?`, text: 'Use this when the payment was entered by mistake. The receipt stays on record marked VOID and the amount goes back onto the invoice balance.', danger: true, reason: true, confirmLabel: 'Void receipt' });
            if (reason) run(() => voidPayment(r.sale.id, r.id, reason), 'Receipt voided');
          }}>Void receipt</Button>}
        </div>
      </div>
      <ReceiptDoc sale={r.sale} payment={r} settings={db.settings} />
    </>
  );
}
