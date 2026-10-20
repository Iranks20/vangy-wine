import { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import { useStore } from '../lib/store';
import { downloadCsv, fmtDateTime, ugx } from '../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Tabs, Textarea, useRun, useToast } from '../components/ui';
import { DataTable } from '../components/DataTable';
import type { Settings } from '../lib/types';
import { KeyRound } from 'lucide-react';

export default function SettingsPage() {
  const { db, updateSettings, updateAccount, backupNow, restore } = useStore();
  const run = useRun();
  const toast = useToast();
  const [tab, setTab] = useState<'business' | 'products' | 'backup' | 'audit'>('business');
  const [s, setS] = useState<Settings>(db.settings);
  const [acc, setAcc] = useState({ name: db.account.name, username: db.account.username });
  const file = useRef<HTMLInputElement>(null);
  const backupAge = db.settings.lastBackup ? (Date.now() - new Date(db.settings.lastBackup).getTime()) / 36e5 : Infinity;

  const onRestore = async (f?: File) => {
    if (!f) return;
    if (!(await toast.confirm({ title: 'Restore this backup?', text: 'All current data will be replaced by the backup file.', danger: true, confirmLabel: 'Restore' }))) return;
    try { restore(JSON.parse(await f.text())); toast.success('Backup restored'); } catch (e) { toast.error((e as Error).message || 'Could not read the backup file.'); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Business details, prices, backups and the audit trail." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'business', label: 'Business' }, { id: 'products', label: 'Products & prices' }, { id: 'backup', label: 'Backup & data' }, { id: 'audit', label: 'Audit trail' }]} />

      {tab === 'business' && (
        <Card title="Business profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2"><Input value={s.businessName} onChange={(e) => setS({ ...s, businessName: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></Field>
            <Field label="Address"><Input value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
            <Field label="Country / currency"><Input value={`${s.country} · ${s.currency}`} disabled /></Field>
            <Field label="Tax rate (%)" hint="Applied on new sales when above zero."><Input type="number" value={s.taxRate} onChange={(e) => setS({ ...s, taxRate: Number(e.target.value) })} /></Field>
            <Field label="Invoice prefix"><Input value={s.invoicePrefix} onChange={(e) => setS({ ...s, invoicePrefix: e.target.value.toUpperCase() })} /></Field>
            <Field label="Expiry alert (days before)"><Input type="number" value={s.expiryAlertDays} onChange={(e) => setS({ ...s, expiryAlertDays: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-wine-700" checked={s.allowOversell} onChange={(e) => setS({ ...s, allowOversell: e.target.checked })} />Allow selling more than stock (admin exception)</label>
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={() => run(() => updateSettings(s), 'Settings saved')}>Save settings</Button></div>
        </Card>
      )}
      {tab === 'business' && (
        <Card title="Invoice & receipt details" className="mt-5">
          <p className="mb-3 text-sm text-stone-500">Printed on every invoice and receipt. Leave a field blank to hide it.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="TIN (URA)"><Input value={s.tin} onChange={(e) => setS({ ...s, tin: e.target.value })} /></Field>
            <Field label="Bank name"><Input value={s.bankName} onChange={(e) => setS({ ...s, bankName: e.target.value })} /></Field>
            <Field label="Account name"><Input value={s.accountName} onChange={(e) => setS({ ...s, accountName: e.target.value })} /></Field>
            <Field label="Account number"><Input value={s.accountNo} onChange={(e) => setS({ ...s, accountNo: e.target.value })} /></Field>
            <Field label="Mobile money (number & name)"><Input value={s.mobileMoney} onChange={(e) => setS({ ...s, mobileMoney: e.target.value })} placeholder="e.g. MTN 07xx xxx xxx — Vangy Wine" /></Field>
            <Field label="Invoice terms & notes" className="sm:col-span-2"><Textarea value={s.invoiceTerms} onChange={(e) => setS({ ...s, invoiceTerms: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={() => run(() => updateSettings(s), 'Invoice details saved')}>Save details</Button></div>
        </Card>
      )}
      {tab === 'business' && (
        <Card title={<span className="flex items-center gap-2"><KeyRound size={18} />Your profile</span>} className="mt-5">
          <p className="mb-3 text-sm text-stone-500">Your name appears on receipts, records and the audit trail.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name"><Input value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} /></Field>
            <Field label="Username"><Input value={acc.username} autoCapitalize="none" onChange={(e) => setAcc({ ...acc, username: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => run(() => updateAccount(acc), 'Profile updated')}>Update profile</Button>
          </div>
        </Card>
      )}

      {tab === 'products' && (
        <Card title="Selling prices" action={<span className="text-xs text-stone-500">Edit prices on the Inventory page</span>}>
          <ul className="divide-y divide-stone-100">
            {db.items.filter((i) => i.category === 'finished').map((i) => (
              <li key={i.id} className="flex items-center justify-between py-3 text-sm">
                <div><p className="font-medium">{i.name}</p><p className="text-xs text-stone-500">{i.code} · cost {ugx(i.cost)} · margin {i.price ? Math.round((i.price - i.cost) / i.price * 100) : 0}%</p></div>
                <span className="font-semibold">{ugx(i.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">Each invoice keeps the price at the time of sale, so changing a price never alters past records.</p>
        </Card>
      )}

      {tab === 'backup' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Backup">
            <div className="flex items-center gap-3">
              <DatabaseBackup className="text-wine-700" />
              <div><p className="text-sm text-stone-500">Last successful backup</p><p className="font-semibold">{fmtDateTime(db.settings.lastBackup)}</p></div>
              <Badge tone={backupAge < 48 ? 'green' : 'red'}>{backupAge < 48 ? 'Up to date' : 'Overdue'}</Badge>
            </div>
            <p className="mt-3 text-sm text-stone-600">Keep a copy on a separate flash drive or external disk at least once a week — a backup on the same laptop is lost if the laptop is.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => run(backupNow, 'Backup downloaded')}><Download size={16} />Back up now</Button>
              <Button variant="secondary" onClick={() => file.current?.click()}><Upload size={16} />Restore from file</Button>
              <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => onRestore(e.target.files?.[0])} />
            </div>
          </Card>
          <Card title="Export data">
            <p className="mb-3 text-sm text-stone-600">Download records as spreadsheets (open in Excel).</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => downloadCsv('customers.csv', ['Name', 'Phone', 'Type', 'Location', 'Terms'], db.customers.map((c) => [c.name, c.phone, c.type, c.location, c.terms]))}>Customers</Button>
              <Button variant="secondary" size="sm" onClick={() => downloadCsv('suppliers.csv', ['Name', 'Contact', 'Phone', 'Email', 'Supplies'], db.suppliers.map((c) => [c.name, c.contact, c.phone, c.email, c.supplies]))}>Suppliers</Button>
              <Button variant="secondary" size="sm" onClick={() => downloadCsv('items.csv', ['Code', 'Name', 'Category', 'Unit', 'Qty', 'Avg cost', 'Price'], db.items.map((i) => [i.code, i.name, i.category, i.unit, i.qty, i.cost, i.price]))}>Stock items</Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'audit' && (
        <DataTable rows={db.audit} columns={[
          { key: 'date', label: 'When', render: (a) => fmtDateTime(a.date) },
          { key: 'user', label: 'User' },
          { key: 'action', label: 'Action', render: (a) => <span className="font-medium">{a.action}</span> },
          { key: 'details', label: 'Details' },
        ]} />
      )}
    </>
  );
}
