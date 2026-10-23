import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { downloadCsv, fmtDate, fmtDateTime, num, today, ugx } from '../lib/format';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';
import type { Cell, Report } from '../../../shared/reports';

type ReportInfo = { id: string; title: string; group: string; dated: boolean };

type Result = Report & { id: string; title: string; dated: boolean; generatedAt: string };

export default function Reports() {
  const { db } = useStore();
  const [id, setId] = useState<string | null>(null);
  const [from, setFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<ReportInfo[] | null>(null);
  useEffect(() => { api.get<ReportInfo[]>('/reports').then(setList).catch((e) => setError((e as Error).message)); }, []);
  const def = list?.find((r) => r.id === id);
  const groups = [...new Set((list ?? []).map((r) => r.group))];

  // Reports are calculated by the server from the database; re-run when the period or the data changes.
  useEffect(() => {
    if (!id || !from || !to) return;
    let live = true;
    setLoading(true); setError('');
    api.get<Result>(`/reports/${id}?from=${from}&to=${to}`)
      .then((r) => { if (live) setReport(r); })
      .catch((e) => { if (live) { setError((e as Error).message); setReport(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, from, to, db]);

  if (!list) return <div className="py-16 text-center text-sm text-stone-500">{error || 'Loading…'}</div>;
  if (!def) return (
    <>
      <PageHeader title="Reports" subtitle={`${list.length} printable reports. Export to Excel (CSV) or save as PDF.`} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <Card key={g} title={g}>
            <ul className="-my-2 divide-y divide-stone-100">
              {list.filter((r) => r.group === g).map((r) => (
                <li key={r.id}><button onClick={() => { setReport(null); setId(r.id); }} className="flex w-full items-center justify-between py-2.5 text-left text-sm hover:text-wine-700">{r.title}<ChevronRight size={16} className="text-stone-400" /></button></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );

  const shown = report?.id === def.id ? report : null;
  const fmt = (v: Cell, i: number) => (typeof v === 'number' && shown?.money?.includes(i) ? ugx(v) : typeof v === 'number' ? num(v, 2) : v);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 no-print">
        <button onClick={() => setId(null)} className="flex items-center gap-1 text-sm text-wine-700 hover:underline"><ArrowLeft size={16} />All reports</button>
        <div className="flex flex-wrap items-end gap-2">
          {def.dated && <><Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></>}
          <Button variant="secondary" disabled={!shown} onClick={() => shown && downloadCsv(`${def.id}-${to}.csv`, shown.columns, shown.totals ? [...shown.rows, shown.totals] : shown.rows)}><FileSpreadsheet size={16} />Excel / CSV</Button>
          <Button disabled={!shown} onClick={() => window.print()}><Printer size={16} />Print / PDF</Button>
        </div>
      </div>
      <div className="print-area rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-2 border-b-2 border-wine-700 pb-3 sm:flex-row">
          <div><p className="font-display text-xl font-bold text-wine-800">{db.settings.businessName}</p><h1 className="text-lg font-semibold">{def.title}</h1></div>
          <div className="text-sm text-stone-500 sm:text-right"><p>Period: {def.dated ? `${fmtDate(from)} – ${fmtDate(to)}` : `As at ${fmtDate(today())}`}</p><p>Generated: {fmtDateTime(shown?.generatedAt ?? new Date().toISOString())}</p></div>
        </div>
        {error ? <p className="py-8 text-center text-sm text-red-600">{error}</p> : !shown ? <p className="py-8 text-center text-sm text-stone-500">{loading ? 'Preparing report…' : ''}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase text-stone-500"><tr>{shown.columns.map((c, i) => <th key={c} className={`px-2 py-2 ${i && typeof shown.rows[0]?.[i] === 'number' ? 'text-right' : ''}`}>{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-stone-100">
                {shown.rows.length ? shown.rows.map((r, j) => <tr key={j} className={String(r[0]).toUpperCase() === r[0] && def.id === 'pnl' ? 'font-semibold' : ''}>{r.map((v, i) => <td key={i} className={`px-2 py-1.5 ${typeof v === 'number' ? 'text-right tabular-nums' : ''}`}>{fmt(v, i)}</td>)}</tr>)
                  : <tr><td colSpan={shown.columns.length} className="py-8 text-center text-stone-500">No records for this period.</td></tr>}
              </tbody>
              {shown.totals && <tfoot className="border-t-2 border-charcoal font-bold"><tr>{shown.totals.map((v, i) => <td key={i} className={`px-2 py-2 ${typeof v === 'number' ? 'text-right tabular-nums' : ''}`}>{fmt(v, i)}</td>)}</tr></tfoot>}
            </table>
          </div>
        )}
        {shown?.note && <p className="mt-4 text-xs text-stone-500">{shown.note}</p>}
      </div>
    </>
  );
}
