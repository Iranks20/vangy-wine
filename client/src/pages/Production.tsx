import { useState } from 'react';
import { CheckCircle2, FlaskConical, PackageCheck, PackagePlus, Plus, Trash2, XCircle } from 'lucide-react';
import { batchCost, batchGoodUnits, useStore } from '../lib/store';
import { fmtDate, fmtDateTime, num, today, ugx } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Stat, Tabs, Textarea, cx, useRun, useToast } from '../components/ui';
import type { Batch, Item, Recipe } from '../lib/types';

const STAGES = ['Preparation', 'Fermentation', 'Clarification', 'Aging', 'Bottling', 'Quality check', 'Released'];
type Mat = { itemId: number; qty: number };

// Editable list of items + quantities (recipes, batch ingredients, packaging used).
function MaterialRows({ rows, onChange, items, showStock }: { rows: Mat[]; onChange: (r: Mat[]) => void; items: Item[]; showStock?: boolean }) {
  if (!items.length) return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Add raw materials and packaging in Inventory first.</p>;
  return (
    <div className="space-y-2">
      {rows.map((m, i) => {
        const it = items.find((x) => x.id === m.itemId);
        return (
          <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
            <div>
              <Select value={m.itemId} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, itemId: Number(e.target.value) } : x)))} aria-label="Item">
                {items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              {showStock && it && <p className={cx('mt-0.5 text-xs', m.qty > it.qty ? 'text-red-600' : 'text-stone-500')}>{num(it.qty, 2)} {it.unit} in stock</p>}
            </div>
            <Input type="number" inputMode="decimal" value={m.qty || ''} placeholder="Qty" onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label="Quantity" />
            <button className="rounded-lg p-2 text-stone-400 hover:text-red-600" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={16} /></button>
          </div>
        );
      })}
      <Button size="sm" variant="ghost" onClick={() => onChange([...rows, { itemId: items[0].id, qty: 0 }])}><Plus size={16} />Add item</Button>
    </div>
  );
}

export default function Production() {
  const { db, user, addBatch, updateBatch, addBatchMaterials, addStage, recordOutputs, setQc, releaseBatch, rejectBatch, saveRecipe, deleteRecipe } = useStore();
  const run = useRun();
  const toast = useToast();
  const inputs = db.items.filter((i) => i.category !== 'finished');
  const products = db.items.filter((i) => i.category === 'finished');
  const name = (id: number) => db.items.find((i) => i.id === id)?.name ?? '';
  const unit = (id: number) => db.items.find((i) => i.id === id)?.unit ?? '';

  const [tab, setTab] = useState<'batches' | 'recipes'>('batches');
  // new batch
  const [newOpen, setNewOpen] = useState(false);
  const [litres, setLitres] = useState('200');
  const [recipeId, setRecipeId] = useState<number | ''>('');
  const [mats, setMats] = useState<Mat[]>([]);
  // recipe editor
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  // batch detail
  const [openId, setOpenId] = useState<number | null>(null);
  const [stageNote, setStageNote] = useState('');
  const [nextStage, setNextStage] = useState('Fermentation');
  const [extra, setExtra] = useState<Mat[]>([]);
  const [outs, setOuts] = useState<Batch['outputs']>([]);
  const [loss, setLoss] = useState('0');
  const [qcNote, setQcNote] = useState('');
  const [expiry, setExpiry] = useState('');
  const [editB, setEditB] = useState<{ expectedLitres: string; responsible: string } | null>(null);
  const b = db.batches.find((x) => x.id === openId);

  const active = db.batches.filter((x) => x.status === 'in_progress');
  const released = db.batches.filter((x) => x.status === 'released');
  const units = released.reduce((t, x) => t + batchGoodUnits(x), 0);
  const avgUnit = units ? released.reduce((t, x) => t + batchCost(x), 0) / units : 0;

  const fromRecipe = (rid: number | '', l: string) => {
    const r = db.recipes.find((x) => x.id === rid);
    setMats(r ? r.lines.map((x) => ({ itemId: x.itemId, qty: +((x.qty * (Number(l) || 0)) / r.baseLitres).toFixed(3) })) : []);
  };
  const startNew = () => {
    const rid = db.recipes[0]?.id ?? '';
    setRecipeId(rid); setLitres('200'); fromRecipe(rid, '200'); setNewOpen(true);
  };
  const open = (x: Batch) => {
    setOpenId(x.id); setStageNote(''); setQcNote(''); setExtra([]); setEditB(null);
    setNextStage(STAGES[Math.min(STAGES.indexOf(x.stage) + 1, 3)] ?? 'Fermentation');
    setOuts(products.map((p) => x.outputs.find((o) => o.itemId === p.id) ?? { itemId: p.id, good: 0, rejected: 0 }));
    setLoss(String(x.lossLitres));
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); setExpiry(d.toISOString().slice(0, 10));
  };

  return (
    <>
      <PageHeader title="Production" subtitle="Batch-level traceability from raw materials to bottled wine."
        actions={<Button onClick={startNew}><Plus size={16} />New batch</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Batches in progress" value={active.length} tone="gold" />
        <Stat label="Released batches" value={released.length} tone="green" />
        <Stat label="Units produced" value={num(units)} />
        <Stat label="Avg cost per unit" value={ugx(avgUnit)} tone="gray" hint="Materials & packaging" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'batches', label: 'Batches' }, { id: 'recipes', label: 'Recipes (bill of materials)' }]} />

      {tab === 'batches' && (db.batches.length ? (
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
      ) : <Card><Empty title="No production batches yet" text="Start a batch to issue ingredients from stock and track it through fermentation, bottling and quality check." /></Card>)}

      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setRecipe({ id: 0, name: '', baseLitres: 100, lines: inputs[0] ? [{ itemId: inputs[0].id, qty: 0 }] : [] })}><Plus size={16} />New recipe</Button></div>
          {db.recipes.length ? db.recipes.map((r) => (
            <Card key={r.id} title={`${r.name} — per ${r.baseLitres} litres`} action={<Button size="sm" variant="ghost" onClick={() => setRecipe(r)}>Edit</Button>}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-2">Ingredient</th><th className="text-right">Quantity</th><th className="text-right">Est. cost</th></tr></thead>
                <tbody className="divide-y divide-stone-100">{r.lines.map((l) => { const it = db.items.find((i) => i.id === l.itemId); return <tr key={l.itemId}><td className="py-2">{it?.name}</td><td className="text-right">{l.qty} {it?.unit}</td><td className="text-right">{ugx(l.qty * (it?.cost ?? 0))}</td></tr>; })}</tbody>
              </table>
              <p className="mt-2 text-right text-sm font-semibold">Ingredients ≈ {ugx(r.lines.reduce((t, l) => t + l.qty * (db.items.find((i) => i.id === l.itemId)?.cost ?? 0), 0))}</p>
            </Card>
          )) : <Card><Empty title="No recipes yet" text="A recipe lists the ingredients for a number of litres. New batches use it to suggest quantities — you always record what was actually used." /></Card>}
        </div>
      )}

      {/* recipe editor */}
      <Modal open={!!recipe} onClose={() => setRecipe(null)} title={recipe?.id ? 'Edit recipe' : 'New recipe'}
        footer={<>
          {recipe?.id ? <Button variant="ghost" className="mr-auto text-red-600" onClick={async () => { if (await toast.confirm({ title: `Delete ${recipe.name}?`, text: 'Batches already made are not affected.', danger: true, confirmLabel: 'Delete' })) run(() => deleteRecipe(recipe.id), 'Recipe deleted').then((ok) => ok && setRecipe(null)); }}>Delete</Button> : null}
          <Button variant="secondary" onClick={() => setRecipe(null)}>Cancel</Button>
          <Button onClick={() => run(() => saveRecipe({ ...recipe!, lines: recipe!.lines.filter((l) => l.qty > 0) }), 'Recipe saved').then((ok) => ok && setRecipe(null))}>Save recipe</Button>
        </>}>
        {recipe && <div className="space-y-3">
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Recipe name"><Input value={recipe.name} onChange={(e) => setRecipe({ ...recipe, name: e.target.value })} /></Field>
            <Field label="For (litres)"><Input type="number" value={recipe.baseLitres} onChange={(e) => setRecipe({ ...recipe, baseLitres: Number(e.target.value) })} /></Field>
          </div>
          <p className="text-sm font-medium text-stone-700">Ingredients</p>
          <MaterialRows rows={recipe.lines} onChange={(lines) => setRecipe({ ...recipe, lines })} items={inputs} />
        </div>}
      </Modal>

      {/* new batch */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Start a production batch"
        footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button><Button onClick={() => run(() => addBatch({ responsible: user!.name, expectedLitres: Number(litres), materials: mats.filter((m) => m.qty > 0) }), 'Batch started — materials issued from stock').then((ok) => ok && setNewOpen(false))}>Start batch</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected output (litres)"><Input type="number" value={litres} onChange={(e) => { setLitres(e.target.value); fromRecipe(recipeId, e.target.value); }} /></Field>
            <Field label="Recipe"><Select value={recipeId} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ''; setRecipeId(v); fromRecipe(v, litres); }}>
              <option value="">No recipe</option>{db.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select></Field>
          </div>
          <p className="text-sm font-medium text-stone-700">Ingredients used <span className="font-normal text-stone-500">— adjust to what you actually use</span></p>
          <MaterialRows rows={mats} onChange={setMats} items={inputs} showStock />
        </div>
      </Modal>

      {/* batch detail */}
      <Modal open={!!b} onClose={() => setOpenId(null)} title={b ? `Batch ${b.batchNo}` : ''} wide>
        {b && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-stone-500">Status</p><Badge tone={b.status === 'released' ? 'green' : b.status === 'rejected' ? 'red' : 'amber'}>{b.status === 'in_progress' ? b.stage : b.status}</Badge></div>
                <div><p className="text-stone-500">Quality check</p><Badge tone={b.qc === 'passed' ? 'green' : b.qc === 'failed' ? 'red' : 'gray'}>{b.qc}</Badge></div>
                <div><p className="text-stone-500">Expected</p><p className="font-medium">{b.expectedLitres} L</p></div>
                <div><p className="text-stone-500">Losses</p><p className="font-medium">{b.lossLitres} L</p></div>
                <div><p className="text-stone-500">Responsible</p><p className="font-medium">{b.responsible}</p></div>
                <div><p className="text-stone-500">Started</p><p className="font-medium">{fmtDate(b.startDate)}</p></div>
                <div><p className="text-stone-500">Batch cost</p><p className="font-medium">{ugx(batchCost(b))}</p></div>
                <div><p className="text-stone-500">Cost / unit</p><p className="font-medium">{batchGoodUnits(b) ? ugx(batchCost(b) / batchGoodUnits(b)) : '—'}</p></div>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Materials consumed</h3>
                <ul className="divide-y divide-stone-100 text-sm">{b.materials.map((m, i) => <li key={i} className="flex justify-between py-1"><span>{name(m.itemId)}</span><span>{num(m.qty, 3)} {unit(m.itemId)} · {ugx(m.qty * m.cost)}</span></li>)}</ul>
              </div>
              {b.outputs.length > 0 && <div>
                <h3 className="mb-1 text-sm font-semibold">Output</h3>
                <ul className="divide-y divide-stone-100 text-sm">{b.outputs.map((o) => <li key={o.itemId} className="flex justify-between py-1"><span>{name(o.itemId)}</span><span>{o.good} good{o.rejected ? ` · ${o.rejected} rejected` : ''}</span></li>)}</ul>
              </div>}
              {b.status === 'in_progress' && (editB ? (
                <div className="space-y-2 rounded-lg border border-stone-200 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Expected litres"><Input type="number" value={editB.expectedLitres} onChange={(e) => setEditB({ ...editB, expectedLitres: e.target.value })} /></Field>
                    <Field label="Responsible"><Select value={editB.responsible} onChange={(e) => setEditB({ ...editB, responsible: e.target.value })}>
                      {[...new Set([editB.responsible, user!.name, ...db.employees.filter((x) => x.active).map((x) => x.name)])].map((n) => <option key={n}>{n}</option>)}
                    </Select></Field>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => run(() => updateBatch(b.id, { expectedLitres: Number(editB.expectedLitres), responsible: editB.responsible }), 'Batch updated').then((ok) => ok && setEditB(null))}>Save details</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditB(null)}>Cancel</Button>
                  </div>
                </div>
              ) : <Button size="sm" variant="ghost" onClick={() => setEditB({ expectedLitres: String(b.expectedLitres), responsible: b.responsible })}>Edit batch details</Button>)}
              {b.qcNotes && <p className="rounded-lg bg-stone-50 p-2 text-sm"><b>QC notes:</b> {b.qcNotes}</p>}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Stage history</h3>
                <ol className="space-y-2 border-l-2 border-wine-100 pl-4 text-sm">
                  {b.stages.map((s, i) => <li key={i} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-wine-600" /><p className="font-medium">{s.stage}</p><p className="text-xs text-stone-500">{fmtDateTime(s.date)}{s.notes ? ` — ${s.notes}` : ''}</p></li>)}
                </ol>
              </div>
            </div>

            <div className="space-y-4">
              {b.status === 'in_progress' && (
                <div className="space-y-4 rounded-xl bg-stone-50 p-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Move to next stage</p>
                    <div className="flex gap-2"><Select value={nextStage} onChange={(e) => setNextStage(e.target.value)}>{STAGES.slice(0, 4).map((s) => <option key={s}>{s}</option>)}</Select>
                      <Button size="sm" onClick={() => run(() => addStage(b.id, nextStage, stageNote), `Stage set to ${nextStage}`).then((ok) => ok && setStageNote(''))}>Save stage</Button></div>
                    <Input placeholder="Readings / notes (e.g. sugar 12 Brix, 24°C)" value={stageNote} onChange={(e) => setStageNote(e.target.value)} />
                  </div>
                  <div className="space-y-2 border-t border-stone-200 pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><PackagePlus size={16} />Materials & packaging used</p>
                    <p className="text-xs text-stone-500">Record bottles, caps, labels or extra ingredients as you use them — they leave stock and are added to the batch cost.</p>
                    {extra.length ? <MaterialRows rows={extra} onChange={setExtra} items={inputs} showStock /> : <Button size="sm" variant="ghost" disabled={!inputs.length} onClick={() => setExtra([{ itemId: inputs[0].id, qty: 0 }])}><Plus size={16} />Add item</Button>}
                    {extra.length > 0 && <Button size="sm" variant="secondary" onClick={() => run(() => addBatchMaterials(b.id, extra.filter((m) => m.qty > 0)), 'Materials recorded').then((ok) => ok && setExtra([]))}>Save materials</Button>}
                  </div>
                  <div className="space-y-2 border-t border-stone-200 pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><PackageCheck size={16} />Bottling output</p>
                    {!products.length && <p className="text-xs text-amber-700">Add finished products in Inventory to record output.</p>}
                    {outs.map((o, i) => (
                      <div key={o.itemId} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 text-sm">
                        <span className="truncate">{name(o.itemId)}</span>
                        <Input type="number" value={o.good} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, good: Number(e.target.value) } : x)))} aria-label="Good units" />
                        <Input type="number" value={o.rejected} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, rejected: Number(e.target.value) } : x)))} aria-label="Rejected units" />
                      </div>
                    ))}
                    {products.length > 0 && <p className="text-right text-xs text-stone-500">good · rejected</p>}
                    <Field label="Liquid lost (litres)"><Input type="number" value={loss} onChange={(e) => setLoss(e.target.value)} /></Field>
                    <Button size="sm" variant="secondary" disabled={!products.length} onClick={() => run(() => recordOutputs(b.id, outs, Number(loss)), 'Output recorded')}>Save output</Button>
                  </div>
                  <div className="space-y-2 border-t border-stone-200 pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><FlaskConical size={16} />Quality check</p>
                    <Textarea placeholder="Taste, colour, clarity, alcohol, pH…" value={qcNote} onChange={(e) => setQcNote(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => run(() => setQc(b.id, 'passed', qcNote), 'QC passed')}><CheckCircle2 size={16} className="text-emerald-600" />Pass</Button>
                      <Button size="sm" variant="secondary" onClick={() => run(() => setQc(b.id, 'failed', qcNote), 'QC failed')}><XCircle size={16} className="text-red-600" />Fail</Button>
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-stone-200 pt-3">
                    <Field label="Expiry date for this lot"><Input type="date" value={expiry} min={today()} onChange={(e) => setExpiry(e.target.value)} /></Field>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={b.qc !== 'passed'} onClick={async () => { if (await toast.confirm({ title: 'Release batch to stock?', text: `${batchGoodUnits(b)} good units will become saleable stock, lot ${b.batchNo}, expiring ${fmtDate(expiry)}.` })) run(() => releaseBatch(b.id, expiry || undefined), 'Batch released to saleable stock'); }}>Approve & release</Button>
                      <Button variant="ghost" onClick={async () => { const r = await toast.confirm({ title: 'Reject this batch?', text: 'Materials already used are recorded as wastage.', danger: true, reason: true, confirmLabel: 'Reject batch' }); if (r) run(() => rejectBatch(b.id, r), 'Batch rejected'); }}>Reject</Button>
                    </div>
                    {b.qc !== 'passed' && <p className="text-xs text-amber-700">Release unlocks once quality check has passed.</p>}
                  </div>
                </div>
              )}
              {b.status === 'released' && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Released to stock as lot <b>{b.batchNo}</b>. Bottled {fmtDate(b.bottlingDate ?? today())}.</p>}
              {b.status === 'rejected' && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">This batch was rejected. Its materials are counted as wastage.</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
