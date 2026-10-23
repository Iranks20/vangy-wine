// Production batches. Raw materials and packaging leave stock when they are recorded against a
// batch; bottled wine only enters saleable stock after the batch passes QC and is released.
// Cost per unit = everything consumed by the batch ÷ good units produced.
import type { Batch, Recipe } from '../../../shared/types';
import { batchCost, batchGoodUnits } from '../../../shared/calc';
import type { Db, Tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import { audit, iso, nextNumber, opt } from '../lib/util';
import { localDay } from './sales';
import { stockIn, stockOut } from './stock';

type Conn = Db | Tx;
type Material = { itemId: number; qty: number };

export async function loadRecipes(db: Conn): Promise<Recipe[]> {
  const [rows, lines] = await Promise.all([db('recipes').orderBy('name'), db('recipe_lines').orderBy('id')]);
  return rows.map((r) => ({ id: r.id, name: r.name, baseLitres: Number(r.base_litres), lines: lines.filter((l) => l.recipe_id === r.id).map((l) => ({ itemId: l.item_id, qty: Number(l.qty) })) }));
}

export async function saveRecipe(db: Db, user: string, id: number | null, b: { name: string; baseLitres: number; lines: Material[] }) {
  return db.transaction(async (trx) => {
    for (const l of b.lines) if (!(await trx('items').where({ id: l.itemId }).first())) throw badRequest('An ingredient on this recipe no longer exists.');
    let rid = id;
    if (rid) {
      if (!(await trx('recipes').where({ id: rid }).update({ name: b.name, base_litres: b.baseLitres }))) throw notFound('Recipe');
      await trx('recipe_lines').where({ recipe_id: rid }).delete();
    } else {
      [rid] = await trx('recipes').insert({ name: b.name, base_litres: b.baseLitres });
    }
    if (b.lines.length) await trx('recipe_lines').insert(b.lines.map((l) => ({ recipe_id: rid, item_id: l.itemId, qty: l.qty })));
    await audit(trx, user, id ? 'Recipe updated' : 'Recipe created', b.name);
    return rid!;
  });
}

export async function loadBatches(db: Conn, ids?: number[]): Promise<Batch[]> {
  const q = db('batches').orderBy('start_date').orderBy('id');
  if (ids) q.whereIn('id', ids);
  const rows = await q;
  if (!rows.length) return [];
  const bids = rows.map((r) => r.id);
  const [mats, stages, outs] = await Promise.all([
    db('batch_materials').whereIn('batch_id', bids).orderBy('id'),
    db('batch_stages').whereIn('batch_id', bids).orderBy('date').orderBy('id'),
    db('batch_outputs').whereIn('batch_id', bids).orderBy('id'),
  ]);
  return rows.map((b) => ({
    id: b.id, batchNo: b.batch_no, startDate: iso(b.start_date)!, responsible: b.responsible, expectedLitres: Number(b.expected_litres),
    stage: b.stage, lossLitres: Number(b.loss_litres), qc: b.qc, qcNotes: opt(b.qc_notes), status: b.status, bottlingDate: opt(b.bottling_date),
    stages: stages.filter((s) => s.batch_id === b.id).map((s) => ({ stage: s.stage, date: iso(s.date)!, notes: s.notes ?? '' })),
    materials: mats.filter((m) => m.batch_id === b.id).map((m) => ({ itemId: m.item_id, qty: Number(m.qty), cost: Number(m.cost) })),
    outputs: outs.filter((o) => o.batch_id === b.id).map((o) => ({ itemId: o.item_id, good: Number(o.good), rejected: Number(o.rejected) })),
  }));
}

const one = async (db: Conn, id: number) => {
  const [b] = await loadBatches(db, [id]);
  if (!b) throw notFound('Batch');
  return b;
};

// Locks the batch row and checks it can still be changed.
async function openBatch(trx: Tx, id: number) {
  const row = await trx('batches').where({ id }).forUpdate().first();
  if (!row) throw notFound('Batch');
  if (row.status !== 'in_progress') throw conflict(`Batch ${row.batch_no} is ${row.status} and can no longer be changed.`);
  return row as { id: number; batch_no: string; qc: string };
}

async function consume(trx: Tx, batchId: number, batchNo: string, user: string, materials: Material[]) {
  for (const m of materials) {
    const cost = await stockOut(trx, { itemId: m.itemId, qty: m.qty, type: 'Used in production', ref: batchNo, user });
    await trx('batch_materials').insert({ batch_id: batchId, item_id: m.itemId, qty: m.qty, cost });
  }
}

const stage = (trx: Tx, batchId: number, name: string, notes: string) =>
  Promise.all([trx('batches').where({ id: batchId }).update({ stage: name }), trx('batch_stages').insert({ batch_id: batchId, stage: name, date: new Date(), notes })]);

export async function createBatch(db: Db, user: string, b: { expectedLitres: number; responsible?: string; materials: Material[] }) {
  const id = await db.transaction(async (trx) => {
    const batchNo = await nextNumber(trx, 'B', 3);
    const [bid] = await trx('batches').insert({ batch_no: batchNo, start_date: new Date(), responsible: b.responsible?.trim() || user, expected_litres: b.expectedLitres, stage: 'Preparation' });
    await trx('batch_stages').insert({ batch_id: bid, stage: 'Preparation', date: new Date(), notes: 'Batch started' });
    await consume(trx, bid, batchNo, user, b.materials);
    await audit(trx, user, 'Batch created', `${batchNo} — ${b.expectedLitres} L expected`);
    return bid;
  });
  return one(db, id);
}

export async function addMaterials(db: Db, user: string, id: number, materials: Material[]) {
  await db.transaction(async (trx) => {
    const row = await openBatch(trx, id);
    await consume(trx, id, row.batch_no, user, materials);
    await audit(trx, user, 'Batch materials added', `${row.batch_no} — ${materials.length} item(s)`);
  });
  return one(db, id);
}

export async function addStage(db: Db, user: string, id: number, name: string, notes: string) {
  await db.transaction(async (trx) => {
    const row = await openBatch(trx, id);
    await stage(trx, id, name, notes);
    await audit(trx, user, 'Batch stage', `${row.batch_no} — ${name}`);
  });
  return one(db, id);
}

export async function recordOutputs(db: Db, user: string, id: number, outputs: { itemId: number; good: number; rejected: number }[], lossLitres: number) {
  await db.transaction(async (trx) => {
    const row = await openBatch(trx, id);
    const kept = outputs.filter((o) => o.good > 0 || o.rejected > 0);
    for (const o of kept) {
      const it = await trx('items').where({ id: o.itemId }).first();
      if (!it) throw badRequest('A product on this batch no longer exists.');
      if (it.category !== 'finished') throw badRequest(`${it.name} is not a finished product.`);
    }
    await trx('batch_outputs').where({ batch_id: id }).delete();
    if (kept.length) await trx('batch_outputs').insert(kept.map((o) => ({ batch_id: id, item_id: o.itemId, good: o.good, rejected: o.rejected })));
    await trx('batches').where({ id }).update({ loss_litres: lossLitres, bottling_date: localDay(new Date()) });
    const units = kept.reduce((t, o) => t + o.good, 0);
    await stage(trx, id, 'Bottling', `${units} good units recorded`);
    await audit(trx, user, 'Batch output recorded', `${row.batch_no} — ${units} good units`);
  });
  return one(db, id);
}

export async function setQc(db: Db, user: string, id: number, result: 'passed' | 'failed', notes: string) {
  await db.transaction(async (trx) => {
    const row = await openBatch(trx, id);
    await trx('batches').where({ id }).update({ qc: result, qc_notes: notes || null });
    await stage(trx, id, 'Quality check', `${result.toUpperCase()}${notes ? ` — ${notes}` : ''}`);
    await audit(trx, user, 'Quality check', `${row.batch_no} ${result}`);
  });
  return one(db, id);
}

export async function releaseBatch(db: Db, user: string, id: number, expiry?: string) {
  await db.transaction(async (trx) => {
    const row = await openBatch(trx, id);
    if (row.qc !== 'passed') throw badRequest('A batch can only be released after it passes quality check.');
    const b = await one(trx, id);
    const units = batchGoodUnits(b);
    if (!units) throw badRequest('Record the bottled output first.');
    const unitCost = batchCost(b) / units;
    const exp = expiry ?? (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return localDay(d); })();
    for (const o of b.outputs) {
      if (o.good > 0) await stockIn(trx, { itemId: o.itemId, qty: o.good, unitCost, type: 'Production output', ref: b.batchNo, user, lotNo: b.batchNo, expiry: exp });
    }
    await trx('batches').where({ id }).update({ status: 'released' });
    await stage(trx, id, 'Released', 'Moved to saleable stock');
    await audit(trx, user, 'Batch released', `${b.batchNo} — ${units} units to stock at ${Math.round(unitCost).toLocaleString()} each`);
  });
  return one(db, id);
}

export async function rejectBatch(db: Db, user: string, id: number, reason: string) {
  await db.transaction(async (trx) => {
    const row = await openBatch(trx, id);
    await trx('batches').where({ id }).update({ status: 'rejected' });
    await stage(trx, id, 'Rejected', reason);
    await audit(trx, user, 'Batch rejected', `${row.batch_no} — ${reason}`);
  });
  return one(db, id);
}
