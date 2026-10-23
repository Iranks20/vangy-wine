import { beforeAll, describe, expect, it } from 'vitest';
import { useApi } from './helpers';

const api = useApi();
const year = new Date().getFullYear();
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const now = () => new Date().toISOString();

beforeAll(async () => {
  const wine = (await api.post('/api/items', { code: 'F-750', name: 'Sweet Red 750ml', category: 'finished', unit: 'bottle', price: 10000, qty: 100, cost: 5000 })).body;
  await api.post('/api/sales', { date: now(), method: 'cash', paid: 50000, lines: [{ itemId: wine.id, qty: 5, price: 10000 }] }); // +50,000 cash
});

describe('expenses', () => {
  it('records an expense with a receipt photo', async () => {
    const res = await api.post('/api/expenses', { date: now(), category: 'Transport and delivery', description: 'Boda delivery', amount: 15000, method: 'cash', recipient: 'Rider', attachment: { filename: 'receipt.png', mime: 'image/png', data: PNG } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ref: `EXP-${year}-0001`, amount: 15000, status: 'active', hasAttachment: true });
    const file = await api.get(`/api/expenses/${res.body.id}/attachment`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
  });

  it('validates category, amount, and attachment type', async () => {
    const base = { date: now(), category: 'Rent', description: 'Rent', amount: 800000, method: 'bank' };
    expect((await api.post('/api/expenses', { ...base, category: 'Parties' })).status).toBe(400);
    expect((await api.post('/api/expenses', { ...base, amount: 0 })).status).toBe(400);
    expect((await api.post('/api/expenses', { ...base, amount: 10.5 })).status).toBe(400);
    expect((await api.post('/api/expenses', { ...base, attachment: { filename: 'x.exe', mime: 'application/x-msdownload', data: PNG } })).status).toBe(400);
  });

  it('voids an expense with a reason and keeps it on record', async () => {
    const e = (await api.post('/api/expenses', { date: now(), category: 'Utilities', description: 'Water', amount: 65000, method: 'cash' })).body;
    expect((await api.post(`/api/expenses/${e.id}/void`, { reason: '' })).status).toBe(400);
    const v = await api.post(`/api/expenses/${e.id}/void`, { reason: 'Entered twice' });
    expect(v.body).toMatchObject({ status: 'voided', voidReason: 'Entered twice' });
    expect((await api.post(`/api/expenses/${e.id}/void`, { reason: 'again' })).status).toBe(409);
    expect((await api.get('/api/expenses')).body).toHaveLength(2);
  });
});

describe('cashbook and reconciliation', () => {
  it('records opening balances and other money in/out', async () => {
    expect((await api.post('/api/cash', { category: 'Opening balance', method: 'bank', amount: 2000000, description: 'Opening balance — bank' })).status).toBe(201);
    const out = await api.post('/api/cash', { category: 'Other payment', method: 'cash', amount: 5000, description: 'Owner drawings' });
    expect(out.body.direction).toBe('out');
    expect((await api.post('/api/cash', { category: 'Gift', method: 'cash', amount: 5000, description: 'x' })).status).toBe(400);
  });

  it('transfers between accounts but never more than the account holds', async () => {
    // cash: +50,000 sale − 15,000 expense − 5,000 drawings = 30,000 (the voided expense does not count)
    const tooMuch = await api.post('/api/cash/transfer', { from: 'cash', to: 'bank', amount: 30001, description: 'Deposit' });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toMatch(/only has 30,000/);
    expect((await api.post('/api/cash/transfer', { from: 'cash', to: 'cash', amount: 1, description: 'x' })).status).toBe(400);
    const ok = await api.post('/api/cash/transfer', { from: 'cash', to: 'bank', amount: 20000, description: 'Deposit' });
    expect(ok.status).toBe(201);
    expect(ok.body.filter((c: { category: string }) => c.category === 'Transfer')).toHaveLength(2);
  });

  it('saves a cash count against the balance calculated by the server', async () => {
    const res = await api.post('/api/reconciliations', { method: 'cash', counted: 9500, notes: 'Short by 500' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ systemAmount: 10000, counted: 9500, difference: -500 });
    const bank = await api.post('/api/reconciliations', { method: 'bank', counted: 2020000 });
    expect(bank.body.difference).toBe(0);
    expect((await api.get('/api/reconciliations')).body).toHaveLength(2);
  });
});
