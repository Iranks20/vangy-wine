import { beforeAll, describe, expect, it } from 'vitest';
import { purchaseBalance, purchaseBilled, purchasePaid, purchaseTotal } from '../../shared/calc';
import { useApi } from './helpers';

const api = useApi();
const year = new Date().getFullYear();
let bottles: { id: number }, labels: { id: number }, glassCo: { id: number };
const item = async (id: number) => (await api.get('/api/items')).body.find((i: { id: number }) => i.id === id);

beforeAll(async () => {
  bottles = (await api.post('/api/items', { code: 'P-B750', name: 'Glass bottles 750ml', category: 'packaging', unit: 'pcs', qty: 100, cost: 800 })).body;
  labels = (await api.post('/api/items', { code: 'P-LBL', name: 'Labels', category: 'packaging', unit: 'pcs' })).body;
  glassCo = (await api.post('/api/suppliers', { name: 'Kampala Glass & Packaging' })).body;
});

describe('stock adjustments', () => {
  it('requires a reason and positive quantity', async () => {
    expect((await api.post('/api/stock/adjustments', { itemId: bottles.id, kind: 'damage', qty: 3, reason: '' })).status).toBe(400);
    expect((await api.post('/api/stock/adjustments', { itemId: bottles.id, kind: 'damage', qty: 0, reason: 'broken' })).status).toBe(400);
  });

  it('writes damaged stock off and records it in the ledger with a reference', async () => {
    const res = await api.post('/api/stock/adjustments', { itemId: bottles.id, kind: 'damage', qty: 3, reason: 'Broken in delivery' });
    expect(res.status).toBe(201);
    expect(res.body.qty).toBe(97);
    const mov = (await api.get('/api/movements')).body[0];
    expect(mov).toMatchObject({ itemId: bottles.id, type: 'Damaged', qty: -3, ref: `ADJ-${year}-0001`, note: 'Broken in delivery' });
  });

  it('adds a count surplus at the current average cost and blocks write-offs beyond stock', async () => {
    const res = await api.post('/api/stock/adjustments', { itemId: bottles.id, kind: 'increase', qty: 3, reason: 'Stock count surplus' });
    expect(res.body).toMatchObject({ qty: 100, cost: 800 });
    const tooMany = await api.post('/api/stock/adjustments', { itemId: bottles.id, kind: 'expired', qty: 1000, reason: 'Expired' });
    expect(tooMany.status).toBe(400);
  });
});

describe('purchases', () => {
  let po: { id: number; po: string };

  it('creates an order without changing stock', async () => {
    const res = await api.post('/api/purchases', { supplierId: glassCo.id, supplierInvoice: 'KGP-1', transport: 60000, lines: [{ itemId: bottles.id, qty: 1000, cost: 900 }, { itemId: labels.id, qty: 1500, cost: 200 }] });
    expect(res.status).toBe(201);
    po = res.body;
    expect(po.po).toBe(`PO-${year}-0001`);
    expect(res.body.status).toBe('ordered');
    expect(purchaseTotal(res.body)).toBe(900000 + 300000 + 60000);
    expect(purchaseBilled(res.body)).toBe(0); // nothing owed for goods not yet received
    expect((await item(bottles.id)).qty).toBe(100);
  });

  it('validates the order', async () => {
    expect((await api.post('/api/purchases', { supplierId: 9999, lines: [{ itemId: bottles.id, qty: 1, cost: 1 }] })).status).toBe(400);
    expect((await api.post('/api/purchases', { supplierId: glassCo.id, lines: [] })).status).toBe(400);
    expect((await api.post('/api/purchases', { supplierId: glassCo.id, lines: [{ itemId: bottles.id, qty: -1, cost: 1 }] })).status).toBe(400);
  });

  it('receives part of the order at landed cost and re-averages the item cost', async () => {
    const res = await api.post(`/api/purchases/${po.id}/receive`, { qtys: [500, 0] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('partial');
    // bottle line = 900,000 of 1,200,000 goods → 75% of 60,000 transport = 45,000 over 1,000 bottles = +45 each
    const b = await item(bottles.id);
    expect(b.qty).toBe(600);
    expect(b.cost).toBeCloseTo((100 * 800 + 500 * 945) / 600, 3);
    expect(purchaseBilled(res.body)).toBe(500 * 900 + 60000);
    expect((await api.get('/api/movements')).body[0]).toMatchObject({ type: 'Purchase received', qty: 500, ref: po.po });
  });

  it('blocks receiving more than ordered and completes the order', async () => {
    expect((await api.post(`/api/purchases/${po.id}/receive`, { qtys: [501, 0] })).status).toBe(400);
    expect((await api.post(`/api/purchases/${po.id}/receive`, { qtys: [0, 0] })).status).toBe(400);
    const res = await api.post(`/api/purchases/${po.id}/receive`, { qtys: [500, 1500] });
    expect(res.body.status).toBe('received');
    expect((await item(labels.id)).qty).toBe(1500);
    expect((await api.post(`/api/purchases/${po.id}/receive`, { qtys: [1, 1] })).status).toBe(409);
  });

  it('records supplier payments and the balance owed, without overpaying', async () => {
    const res = await api.post(`/api/purchases/${po.id}/pay`, { amount: 1000000, method: 'bank' });
    expect(purchasePaid(res.body)).toBe(1000000);
    expect(purchaseBalance(res.body)).toBe(260000);
    expect((await api.post(`/api/purchases/${po.id}/pay`, { amount: 260001, method: 'bank' })).status).toBe(400);
    const done = await api.post(`/api/purchases/${po.id}/pay`, { amount: 260000, method: 'cash' });
    expect(purchaseBalance(done.body)).toBe(0);
  });

  it('only cancels orders with nothing received or paid', async () => {
    expect((await api.post(`/api/purchases/${po.id}/cancel`)).status).toBe(409);
    const fresh = (await api.post('/api/purchases', { supplierId: glassCo.id, lines: [{ itemId: labels.id, qty: 10, cost: 200 }] })).body;
    const res = await api.post(`/api/purchases/${fresh.id}/cancel`);
    expect(res.body.status).toBe('cancelled');
    expect((await api.post(`/api/purchases/${fresh.id}/receive`, { qtys: [1] })).status).toBe(409);
    expect((await api.post(`/api/purchases/${fresh.id}/pay`, { amount: 100, method: 'cash' })).status).toBe(409);
  });

  it('protects suppliers and items that are used on orders from deletion', async () => {
    expect((await api.del(`/api/suppliers/${glassCo.id}`)).status).toBe(409);
    expect((await api.del(`/api/items/${labels.id}`)).status).toBe(409);
  });
});
