import { describe, expect, it } from 'vitest';
import { useApi } from './helpers';

const api = useApi();

const wine = { code: 'T-750', name: 'Test Sweet Red 750ml', category: 'finished', unit: 'bottle', price: 10000, min: 20, location: 'Main store' };

describe('items', () => {
  it('creates a product with opening stock, costed and recorded in the ledger', async () => {
    const res = await api.post('/api/items', { ...wine, qty: 100, cost: 5200 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: 'T-750', qty: 100, cost: 5200, price: 10000 });
    expect(res.body.lots).toEqual([expect.objectContaining({ lotNo: 'OPENING', qty: 100 })]);
    const mov = await api.ctx.db('stock_movements').where({ item_id: res.body.id });
    expect(mov).toHaveLength(1);
    expect(mov[0]).toMatchObject({ type: 'Opening stock', qty: 100 });
  });

  it('rejects duplicate codes, missing fields and negative numbers', async () => {
    expect((await api.post('/api/items', { ...wine })).status).toBe(409);
    const missing = await api.post('/api/items', { ...wine, code: 'X1', name: '' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Item name is required.');
    expect((await api.post('/api/items', { ...wine, code: 'X2', price: -5 })).status).toBe(400);
    expect((await api.post('/api/items', { ...wine, code: 'X3', category: 'wine' })).status).toBe(400);
  });

  it('updates details without touching stock, and audits price changes', async () => {
    const [it0] = (await api.get('/api/items')).body;
    const res = await api.put(`/api/items/${it0.id}`, { ...wine, price: 11000, qty: 9999 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ price: 11000, qty: 100 });
    const log = (await api.get('/api/audit')).body;
    expect(log.some((a: { action: string; details: string }) => a.action === 'Price changed' && a.details.includes('11,000'))).toBe(true);
  });

  it('deletes a product that was never traded', async () => {
    const created = await api.post('/api/items', { code: 'TMP-1', name: 'Temporary labels', category: 'packaging', unit: 'pcs', qty: 50, cost: 200 });
    const del = await api.del(`/api/items/${created.body.id}`);
    expect(del.status).toBe(204);
    expect((await api.get('/api/items')).body.find((i: { code: string }) => i.code === 'TMP-1')).toBeUndefined();
    expect(await api.ctx.db('stock_movements').where({ item_id: created.body.id }).first()).toBeUndefined();
    expect((await api.del(`/api/items/${created.body.id}`)).status).toBe(404);
  });
});

describe('customers, suppliers, employees', () => {
  it('runs the full create / update / delete cycle for customers', async () => {
    const c = await api.post('/api/customers', { name: 'Test Hotel', phone: '0772 000 111', type: 'hotel', location: 'Jinja', terms: 30 });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ name: 'Test Hotel', type: 'hotel', terms: 30 });
    const u = await api.put(`/api/customers/${c.body.id}`, { ...c.body, terms: 14, followUp: '2026-11-01' });
    expect(u.body).toMatchObject({ terms: 14, followUp: '2026-11-01' });
    expect((await api.post('/api/customers', { name: '' })).status).toBe(400);
    expect((await api.del(`/api/customers/${c.body.id}`)).status).toBe(204);
  });

  it('validates supplier emails and deletes suppliers', async () => {
    expect((await api.post('/api/suppliers', { name: 'Bad Mail Ltd', email: 'nope' })).status).toBe(400);
    const s = await api.post('/api/suppliers', { name: 'Glass Co', contact: 'Ivan', phone: '0758', email: 'glass@example.org', supplies: 'Bottles' });
    expect(s.status).toBe(201);
    expect((await api.get('/api/suppliers')).body).toHaveLength(1);
    expect((await api.del(`/api/suppliers/${s.body.id}`)).status).toBe(204);
  });

  it('manages employees', async () => {
    const e = await api.post('/api/employees', { name: 'John Mukasa', position: 'Sales Representative', phone: '0772' });
    expect(e.body).toMatchObject({ name: 'John Mukasa', active: true });
    const u = await api.put(`/api/employees/${e.body.id}`, { ...e.body, active: false });
    expect(u.body.active).toBe(false);
    expect((await api.del(`/api/employees/${e.body.id}`)).status).toBe(204);
  });

  it('returns 404 for unknown records and 400 for bad ids', async () => {
    expect((await api.put('/api/customers/99999', { name: 'Ghost' })).status).toBe(404);
    expect((await api.get('/api/items/abc')).status).toBe(404);
    expect((await api.del('/api/customers/abc')).status).toBe(400);
  });
});
