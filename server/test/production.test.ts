import { beforeAll, describe, expect, it } from 'vitest';
import { batchCost, batchGoodUnits } from '../../shared/calc';
import { useApi } from './helpers';

const api = useApi();
const year = new Date().getFullYear();
const ids: Record<string, number> = {};
const item = async (id: number) => (await api.get('/api/items')).body.find((i: { id: number }) => i.id === id);

beforeAll(async () => {
  const mk = async (code: string, name: string, category: string, unit: string, qty: number, cost: number) =>
    (ids[code] = (await api.post('/api/items', { code, name, category, unit, qty, cost })).body.id);
  await mk('HIB', 'Hibiscus flowers', 'raw', 'kg', 50, 12000);
  await mk('SUG', 'Sugar', 'raw', 'kg', 200, 4000);
  await mk('YST', 'Yeast', 'raw', 'sachet', 20, 3500);
  await mk('B750', 'Bottles 750ml', 'packaging', 'pcs', 500, 900);
  await mk('W750', 'Sweet Red 750ml', 'finished', 'bottle', 0, 0);
});

describe('recipes', () => {
  it('creates, updates and deletes a bill of materials', async () => {
    const res = await api.post('/api/recipes', { name: 'Hibiscus Sweet Red', baseLitres: 100, lines: [{ itemId: ids.HIB, qty: 6 }, { itemId: ids.SUG, qty: 25 }] });
    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(2);
    const upd = await api.put(`/api/recipes/${res.body.id}`, { ...res.body, lines: [...res.body.lines, { itemId: ids.YST, qty: 2 }] });
    expect(upd.body.lines).toHaveLength(3);
    expect((await api.post('/api/recipes', { name: '', baseLitres: 0, lines: [] })).status).toBe(400);
    const tmp = await api.post('/api/recipes', { name: 'Trial', baseLitres: 10, lines: [] });
    expect((await api.del(`/api/recipes/${tmp.body.id}`)).status).toBe(204);
  });
});

describe('a production batch', () => {
  let batch: { id: number; batchNo: string };

  it('starts a batch and issues the ingredients from stock at average cost', async () => {
    const res = await api.post('/api/batches', { expectedLitres: 200, materials: [{ itemId: ids.HIB, qty: 12 }, { itemId: ids.SUG, qty: 50 }, { itemId: ids.YST, qty: 4 }] });
    expect(res.status).toBe(201);
    batch = res.body;
    expect(batch.batchNo).toBe(`B-${year}-001`);
    expect(res.body).toMatchObject({ stage: 'Preparation', status: 'in_progress', qc: 'pending' });
    expect(batchCost(res.body)).toBe(12 * 12000 + 50 * 4000 + 4 * 3500);
    expect((await item(ids.HIB)).qty).toBe(38);
    const mov = (await api.get('/api/movements')).body.filter((m: { ref: string }) => m.ref === batch.batchNo);
    expect(mov).toHaveLength(3);
  });

  it('refuses ingredients that are not in stock, without partial changes', async () => {
    const res = await api.post('/api/batches', { expectedLitres: 100, materials: [{ itemId: ids.SUG, qty: 10 }, { itemId: ids.HIB, qty: 999 }] });
    expect(res.status).toBe(400);
    expect((await item(ids.SUG)).qty).toBe(150);
  });

  it('tracks stages, packaging used and bottled output', async () => {
    expect((await api.post(`/api/batches/${batch.id}/stages`, { stage: 'Fermentation', notes: '24°C, 12 Brix' })).body.stage).toBe('Fermentation');
    expect((await api.post(`/api/batches/${batch.id}/stages`, { stage: 'Party' })).status).toBe(400);
    const pk = await api.post(`/api/batches/${batch.id}/materials`, { materials: [{ itemId: ids.B750, qty: 250 }] });
    expect(batchCost(pk.body)).toBe(358000 + 250 * 900);
    const raw = await api.post(`/api/batches/${batch.id}/outputs`, { outputs: [{ itemId: ids.SUG, good: 5 }], lossLitres: 0 });
    expect(raw.status).toBe(400); // only finished products can be output
    const out = await api.post(`/api/batches/${batch.id}/outputs`, { outputs: [{ itemId: ids.W750, good: 240, rejected: 6 }], lossLitres: 8 });
    expect(batchGoodUnits(out.body)).toBe(240);
    expect(out.body).toMatchObject({ stage: 'Bottling', lossLitres: 8 });
    expect(out.body.bottlingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('will not release into stock before quality check passes', async () => {
    const res = await api.post(`/api/batches/${batch.id}/release`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/passes quality check/);
    await api.post(`/api/batches/${batch.id}/qc`, { result: 'failed', notes: 'Too sweet' });
    expect((await api.post(`/api/batches/${batch.id}/release`)).status).toBe(400);
    expect((await item(ids.W750)).qty).toBe(0);
  });

  it('releases a passed batch as a lot with expiry at the batch cost per bottle', async () => {
    await api.post(`/api/batches/${batch.id}/qc`, { result: 'passed', notes: 'Adjusted and re-tasted' });
    const expiry = `${year + 1}-12-31`;
    const res = await api.post(`/api/batches/${batch.id}/release`, { expiry });
    expect(res.body).toMatchObject({ status: 'released', stage: 'Released' });
    const wine = await item(ids.W750);
    expect(wine.qty).toBe(240);
    expect(wine.cost).toBeCloseTo((358000 + 225000) / 240, 3);
    expect(wine.lots).toEqual([expect.objectContaining({ lotNo: batch.batchNo, expiry, qty: 240 })]);
  });

  it('locks the batch after release or rejection', async () => {
    expect((await api.post(`/api/batches/${batch.id}/stages`, { stage: 'Aging' })).status).toBe(409);
    expect((await api.post(`/api/batches/${batch.id}/reject`, { reason: 'late' })).status).toBe(409);
    const b2 = (await api.post('/api/batches', { expectedLitres: 50, materials: [{ itemId: ids.SUG, qty: 10 }] })).body;
    expect(b2.batchNo).toBe(`B-${year}-002`);
    expect((await api.post(`/api/batches/${b2.id}/reject`, { reason: '' })).status).toBe(400);
    const rej = await api.post(`/api/batches/${b2.id}/reject`, { reason: 'Contaminated vessel' });
    expect(rej.body.status).toBe('rejected');
    expect((await api.post(`/api/batches/${b2.id}/qc`, { result: 'passed' })).status).toBe(409);
    expect((await item(ids.SUG)).qty).toBe(140); // rejected batch materials stay consumed (wastage)
  });
});
