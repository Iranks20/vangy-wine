import { useState } from 'react';
import { CheckCircle2, FlaskConical, PackageCheck, Plus, XCircle } from 'lucide-react';
import { batchCost, batchGoodUnits, useStore } from '../lib/store';
import { fmtDate, fmtDateTime, num, today, ugx } from '../lib/format';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Stat, Tabs, Textarea, cx, useRun, useToast } from '../components/ui';
import type { Batch } from '../lib/types';

const STAGES = ['Preparation', 'Fermentation', 'Clarification', 'Aging', 'Bottling', 'Quality check', 'Released'];
// Default recipe — quantities per 100 litres.
const RECIPE = [{ itemId: 4, qty: 6 }, { itemId: 5, qty: 25 }, { itemId: 6, qty: 2 }, { itemId: 7, qty: 0.5 }];

export default function Production() {
  const { db, user, addBatch, addStage, recordOutputs, setQc, releaseBatch, rejectBatch } = useStore();
  const run = useRun();
  const toast = useToast();
  const [tab, setTab] = useState<'batches' | 'recipe'>('batches');
  const [newOpen, setNewOpen] = useState(false);
  const [litres, setLitres] = useState('200');
  const [mats, setMats] = useState(RECIPE.map((r) => ({ ...r, qty: r.qty * 2 })));
  const [openId, setOpenId] = useState<number | null>(null);
  const [stageNote, setStageNote] = useState('');
  const [nextStage, setNextStage] = useState('Fermentation');
  const [outs, setOuts] = useState<Batch['outputs']>([]);
  const [loss, setLoss] = useState('0');
  const [qcNote, setQcNote] = useState('');
  const b = db.batches.find((x) => x.id === openId);
  const name = (id: number) => db.items.find((i) => i.id === id)?.name ?? '';

  const active = db.batches.filter((x) => x.status === 'in_progress');
  const released = db.batches.filter((x) => x.status === 'released');
  const units = released.reduce((t, x) => t + batchGoodUnits(x), 0);
  const avgUnit = units ? released.reduce((t, x) => t + batchCost(x), 0) / units : 0;

  const open = (x: Batch) => {
    setOpenId(x.id); setStageNote(''); setQcNote('');
    setNextStage(STAGES[Math.min(STAGES.indexOf(x.stage) + 1, 4)] ?? 'Fermentation');
    setOuts(x.outputs.length ? x.outputs : db.items.filter((i) => i.category === 'finished').map((i) => ({ itemId: i.id, good: 0, rejected: 0 })));
    setLoss(String(x.lossLitres));
  };
  const scale = (l: string) => { setLitres(l); setMats(RECIPE.map((r) => ({ ...r, qty: +(r.qty * (Number(l) || 0) / 100).toFixed(2) }))); };

  return (
    <>
      <PageHeader title="Production" subtitle="Batch-level traceability from raw materials to bottled wine."
        actions={<Button onClick={() => { scale('200'); setNewOpen(true); }}><Plus size={16} />New batch</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Batches in progress" value={active.length} tone="gold" />
        <Stat label="Released batches" value={released.length} tone="green" />
        <Stat label="Units produced" value={num(units)} />
        <Stat label="Avg cost per unit" value={ugx(avgUnit)} tone="gray" hint="Materials & packaging" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'batches', label: 'Batches' }, { id: 'recipe', label: 'Recipe (bill of materials)' }]} />

      {tab === 'batches' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...db.batches].reverse().map((x) => {
            const idx = STAGES.indexOf(x.stage);
            return (
              <button key={x.id} onClick={() => open(x)} className="rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-wine-200 hover:shadow">
                <div className="flex items-start justify-between">
                  <div><p className="font-mono text-sm font-semibold text-wine-700">{x.batchNo}</p><p className="text-xs text-stone-500">Started {fmtDate(x.startDate)} · {x.responsible}</p></div>
                  <Badge tone={x.status === 'released' ? 'green' : x.status === 'rejected' ? 'red' : 'amber'}>{x.status === 'in_progress' ? x.stage : x.status}</Badge>
                </div>
                {x.status !== 'rejected' && (
                  <div className="mt-3 flex gap-1" aria-label={`Stage ${x.stage}`}>
                    {STAGES.map((s, i) => <span key={s} className={cx('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-wine-600' : 'bg-stone-200')} />)}
                  </div>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-stone-500">Expected</dt><dd className="font-semibold">{x.expectedLitres} L</dd></div>
                  <div><dt className="text-stone-500">Good units</dt><dd className="font-semibold">{batchGoodUnits(x) || '—'}</dd></div>
                  <div><dt className="text-stone-500">Cost</dt><dd className="font-semibold">{ugx(batchCost(x))}</dd></div>
                </dl>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'recipe' && (
        <Card title="Hibiscus Natural Sweet Red Wine — per 100 litres">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-2">Ingredient</th><th className="text-right">Quantity</th><th className="text-right">Est. cost</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{RECIPE.map((r) => { const it = db.items.find((i) => i.id === r.itemId)!; return <tr key={r.itemId}><td className="py-2">{it.name}</td><td className="text-right">{r.qty} {it.unit}</td><td className="text-right">{ugx(r.qty * it.cost)}</td></tr>; })}</tbody>
          </table>
          <p className="mt-3 text-xs text-stone-500">Recipes are a starting point only — actual quantities used are recorded on every batch. Packaging (bottles, caps, labels) is recorded at bottling.</p>
        </Card>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Start a production batch"
        footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button><Button onClick={() => run(() => addBatch({ startDate: new Date().toISOString(), responsible: user!.name, expectedLitres: Number(litres), materials: mats.filter((m) => m.qty > 0) }), 'Batch started — materials issued from stock') && setNewOpen(false)}>Start batch</Button></>}>
        <div className="space-y-3">
          <Field label="Expected output (litres)" hint="Ingredient quantities are suggested from the recipe; adjust to what you actually use."><Input type="number" value={litres} onChange={(e) => scale(e.target.value)} /></Field>
          {mats.map((m, i) => { const it = db.items.find((x) => x.id === m.itemId)!; return (
            <div key={m.itemId} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{it.name}<br /><span className={cx('text-xs', m.qty > it.qty ? 'text-red-600' : 'text-stone-500')}>{num(it.qty, 2)} {it.unit} in stock</span></span>
              <Input type="number" className="w-28" value={m.qty} onChange={(e) => setMats(mats.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label={it.name} />
            </div>); })}
        </div>
      </Modal>

      <Modal open={!!b} onClose={() => setOpenId(null)} title={b ? `Batch ${b.batchNo}` : ''} wide>
        {b && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-stone-500">Status</p><Badge tone={b.status === 'released' ? 'green' : b.status === 'rejected' ? 'red' : 'amber'}>{b.status === 'in_progress' ? b.stage : b.status}</Badge></div>
                <div><p className="text-stone-500">Quality check</p><Badge tone={b.qc === 'passed' ? 'green' : b.qc === 'failed' ? 'red' : 'gray'}>{b.qc}</Badge></div>
                <div><p className="text-stone-500">Expected</p><p className="font-medium">{b.expectedLitres} L</p></div>
                <div><p className="text-stone-500">Losses</p><p className="font-medium">{b.lossLitres} L</p></div>
                <div><p className="text-stone-500">Batch cost</p><p className="font-medium">{ugx(batchCost(b))}</p></div>
                <div><p className="text-stone-500">Cost / unit</p><p className="font-medium">{batchGoodUnits(b) ? ugx(batchCost(b) / batchGoodUnits(b)) : '—'}</p></div>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Materials consumed</h3>
                <ul className="divide-y divide-stone-100 text-sm">{b.materials.map((m) => <li key={m.itemId} className="flex justify-between py-1"><span>{name(m.itemId)}</span><span>{num(m.qty, 2)} · {ugx(m.qty * m.cost)}</span></li>)}</ul>
              </div>
              {b.outputs.length > 0 && <div>
                <h3 className="mb-1 text-sm font-semibold">Output</h3>
                <ul className="divide-y divide-stone-100 text-sm">{b.outputs.map((o) => <li key={o.itemId} className="flex justify-between py-1"><span>{name(o.itemId)}</span><span>{o.good} good{o.rejected ? ` · ${o.rejected} rejected` : ''}</span></li>)}</ul>
              </div>}
              {b.qcNotes && <p className="rounded-lg bg-stone-50 p-2 text-sm"><b>QC notes:</b> {b.qcNotes}</p>}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Stage history</h3>
                <ol className="space-y-2 border-l-2 border-wine-100 pl-4 text-sm">
                  {b.stages.map((s, i) => <li key={i} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-wine-600" /><p className="font-medium">{s.stage}</p><p className="text-xs text-stone-500">{fmtDateTime(s.date)}{s.notes ? ` — ${s.notes}` : ''}</p></li>)}
                </ol>
              </div>

              {b.status === 'in_progress' && (
                <div className="space-y-4 rounded-xl bg-stone-50 p-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Move to next stage</p>
                    <div className="flex gap-2"><Select value={nextStage} onChange={(e) => setNextStage(e.target.value)}>{STAGES.slice(0, 4).map((s) => <option key={s}>{s}</option>)}</Select>
                      <Button size="sm" onClick={() => run(() => addStage(b.id, nextStage, stageNote), `Stage set to ${nextStage}`)}>Save</Button></div>
                    <Input placeholder="Readings / notes (e.g. sugar 12 Brix, 24°C)" value={stageNote} onChange={(e) => setStageNote(e.target.value)} />
                  </div>
                  <div className="space-y-2 border-t border-stone-200 pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><PackageCheck size={16} />Bottling output</p>
                    {outs.map((o, i) => (
                      <div key={o.itemId} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 text-sm">
                        <span className="truncate">{name(o.itemId).replace('Vangy Natural Sweet Red Wine', 'Sweet Red')}</span>
                        <Input type="number" value={o.good} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, good: Number(e.target.value) } : x)))} aria-label="Good units" />
                        <Input type="number" value={o.rejected} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, rejected: Number(e.target.value) } : x)))} aria-label="Rejected units" />
                      </div>
                    ))}
                    <p className="text-right text-xs text-stone-500">good · rejected</p>
                    <Field label="Liquid lost (litres)"><Input type="number" value={loss} onChange={(e) => setLoss(e.target.value)} /></Field>
                    <Button size="sm" variant="secondary" onClick={() => run(() => recordOutputs(b.id, outs, Number(loss)), 'Output recorded')}>Save output</Button>
                  </div>
                  <div className="space-y-2 border-t border-stone-200 pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><FlaskConical size={16} />Quality check</p>
                    <Textarea placeholder="Taste, colour, clarity, alcohol, pH…" value={qcNote} onChange={(e) => setQcNote(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => run(() => setQc(b.id, 'passed', qcNote), 'QC passed')}><CheckCircle2 size={16} className="text-emerald-600" />Pass</Button>
                      <Button size="sm" variant="secondary" onClick={() => run(() => setQc(b.id, 'failed', qcNote), 'QC failed')}><XCircle size={16} className="text-red-600" />Fail</Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3">
                    <Button disabled={b.qc !== 'passed'} onClick={async () => { if (await toast.confirm({ title: 'Release batch to stock?', text: `${batchGoodUnits(b)} good units will become saleable stock, lot ${b.batchNo}.` })) run(() => releaseBatch(b.id), 'Batch released to saleable stock'); }}>Approve & release</Button>
                    <Button variant="ghost" onClick={async () => { const r = await toast.confirm({ title: 'Reject this batch?', text: 'Materials already used are recorded as wastage.', danger: true, reason: true, confirmLabel: 'Reject batch' }); if (r) run(() => rejectBatch(b.id, r), 'Batch rejected'); }}>Reject</Button>
                    {b.qc !== 'passed' && <p className="w-full text-xs text-amber-700">Release unlocks once quality check has passed.</p>}
                  </div>
                </div>
              )}
              {b.status === 'released' && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Released to stock as lot <b>{b.batchNo}</b>. Bottled {fmtDate(b.bottlingDate ?? today())}.</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
