import { beforeAll, describe, expect, it } from 'vitest';
import { saleBalance, salePaid, saleTotal } from '../../shared/calc';
import { useApi } from './helpers';

const api = useApi();
const year = new Date().getFullYear();
let wine: { id: number }, magnum: { id: number }, sugar: { id: number }, hotel: { id: number; terms: number };

const now = () => new Date().toISOString();
const stockOf = async (id: number) => (await api.get('/api/items')).body.find((i: { id: number }) => i.id === id);

beforeAll(async () => {
  wine = (await api.post('/api/items', { code: 'S-750', name: 'Sweet Red 750ml', category: 'finished', unit: 'bottle', price: 10000, qty: 50, cost: 5000 })).body;
  magnum = (await api.post('/api/items', { code: 'S-1500', name: 'Sweet Red 1.5L', category: 'finished', unit: 'bottle', price: 18000, qty: 10, cost: 9000 })).body;
  sugar = (await api.post('/api/items', { code: 'S-SUG', name: 'Sugar', category: 'raw', unit: 'kg', qty: 100, cost: 4000 })).body;
  hotel = (await api.post('/api/customers', { name: 'Nile View Hotel', type: 'hotel', terms: 30 })).body;
});

describe('recording a sale', () => {
  it('calculates totals with discounts, records cost, deducts stock and issues invoice + receipt', async () => {
    const res = await api.post('/api/sales', {
      date: now(), customerId: hotel.id, method: 'mobile_money', paid: 100000,
      lines: [{ itemId: wine.id, qty: 12, price: 10000, discount: 6000 }, { itemId: magnum.id, qty: 2, price: 18000, discount: 0 }],
    });
    expect(res.status).toBe(201);
    const s = res.body;
    expect(s.invoice).toBe(`INV-${year}-00001`);
    expect(saleTotal(s)).toBe(12 * 10000 - 6000 + 36000); // 150,000
    expect(salePaid(s)).toBe(100000);
    expect(saleBalance(s)).toBe(50000);
    expect(s.lines[0]).toMatchObject({ name: 'Sweet Red 750ml', cost: 5000 });
    expect(s.payments[0]).toMatchObject({ receiptNo: `RCT-${year}-00001`, method: 'mobile_money', amount: 100000 });
    expect(s.customerName).toBe('Nile View Hotel');
    expect((await stockOf(wine.id)).qty).toBe(38);
    expect((await stockOf(magnum.id)).qty).toBe(8);
  });

  it('sets the due date from the customer payment terms', async () => {
    const date = new Date(Date.now() - 3 * 864e5);
    const s = (await api.post('/api/sales', { date: date.toISOString(), customerId: hotel.id, method: 'credit', paid: 0, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] })).body;
    const due = new Date(date); due.setDate(due.getDate() + 30);
    expect(s.dueDate).toBe(`${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`);
    expect(s.payments).toHaveLength(0); // a credit sale is never counted as cash received
    expect(saleBalance(s)).toBe(10000);
  });

  it('numbers invoices one after another', async () => {
    const s = (await api.post('/api/sales', { date: now(), method: 'cash', paid: 10000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] })).body;
    expect(s.invoice).toBe(`INV-${year}-00003`);
    expect(s.customerName).toBe('Walk-in customer');
    expect(s.payments[0].receiptNo).toBe(`RCT-${year}-00002`);
  });

  it('requires a registered customer for credit or part-payment', async () => {
    const res = await api.post('/api/sales', { date: now(), method: 'cash', paid: 5000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/registered customer/);
  });

  it('rejects overpayment, oversized discounts, bad quantities and non-finished goods', async () => {
    const base = { date: now(), customerId: hotel.id, method: 'cash' };
    expect((await api.post('/api/sales', { ...base, paid: 20000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] })).status).toBe(400);
    expect((await api.post('/api/sales', { ...base, paid: 0, lines: [{ itemId: wine.id, qty: 1, price: 10000, discount: 20000 }] })).status).toBe(400);
    expect((await api.post('/api/sales', { ...base, paid: 0, lines: [{ itemId: wine.id, qty: 0, price: 10000 }] })).status).toBe(400);
    expect((await api.post('/api/sales', { ...base, paid: 0, lines: [] })).status).toBe(400);
    const raw = await api.post('/api/sales', { ...base, paid: 0, lines: [{ itemId: sugar.id, qty: 1, price: 5000 }] });
    expect(raw.status).toBe(400);
    expect(raw.body.error).toMatch(/not a finished product/);
  });

  it('blocks selling more than is in stock and leaves nothing half-saved', async () => {
    const before = await stockOf(wine.id);
    const salesBefore = (await api.get('/api/sales')).body.length;
    const res = await api.post('/api/sales', { date: now(), customerId: hotel.id, method: 'credit', paid: 0,
      lines: [{ itemId: magnum.id, qty: 1, price: 18000 }, { itemId: wine.id, qty: 999, price: 10000 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not enough stock for Sweet Red 750ml/);
    expect((await stockOf(wine.id)).qty).toBe(before.qty);
    expect((await stockOf(magnum.id)).qty).toBe(8); // first line was rolled back too
    expect((await api.get('/api/sales')).body.length).toBe(salesBefore);
  });

  it('allows overselling only when the setting is switched on', async () => {
    const settings = (await api.get('/api/settings')).body;
    await api.put('/api/settings', { ...settings, allowOversell: true });
    const res = await api.post('/api/sales', { date: now(), customerId: hotel.id, method: 'credit', paid: 0, lines: [{ itemId: magnum.id, qty: 9, price: 18000 }] });
    expect(res.status).toBe(201);
    expect((await stockOf(magnum.id)).qty).toBe(-1);
    await api.put('/api/settings', { ...settings, allowOversell: false });
    // receiving stock afterwards covers the shortfall first
    await api.ctx.db.transaction(async (trx) => {
      const { stockIn } = await import('../src/services/stock');
      await stockIn(trx, { itemId: magnum.id, qty: 5, unitCost: 9000, type: 'Purchase received', ref: 'TEST', user: 'test' });
    });
    const m = await stockOf(magnum.id);
    expect(m.qty).toBe(4);
    expect(m.lots.reduce((t: number, l: { qty: number }) => t + l.qty, 0)).toBe(4);
  });

  it('ignores a repeated submission with the same key', async () => {
    const body = { date: now(), method: 'cash', paid: 10000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }], idemKey: 'sale-key-0001' };
    const a = await api.post('/api/sales', body);
    const b = await api.post('/api/sales', body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect((await api.get('/api/sales')).body.filter((s: { idemKey?: string; id: number }) => s.id === a.body.id)).toHaveLength(1);
  });
});

describe('payments against an invoice', () => {
  it('records later payments, issues receipts and closes the balance', async () => {
    const sale = (await api.get('/api/sales')).body.find((x: { invoice: string }) => x.invoice === `INV-${year}-00001`);
    const r1 = await api.post(`/api/sales/${sale.id}/payments`, { amount: 30000, method: 'cash', ref: 'part 2' });
    expect(r1.status).toBe(201);
    expect(r1.body.receiptNo).toMatch(new RegExp(`^RCT-${year}-\\d{5}$`));
    expect((await api.post(`/api/sales/${sale.id}/payments`, { amount: 30000, method: 'cash' })).status).toBe(400); // only 20,000 left
    await api.post(`/api/sales/${sale.id}/payments`, { amount: 20000, method: 'bank' });
    const s = (await api.get(`/api/sales/${sale.id}`)).body;
    expect(saleBalance(s)).toBe(0);
    expect(s.payments).toHaveLength(3);
  });

  it('rejects zero amounts, unknown methods and duplicate payment keys', async () => {
    const credit = (await api.get('/api/sales')).body.find((x: { invoice: string }) => x.invoice === `INV-${year}-00002`);
    expect((await api.post(`/api/sales/${credit.id}/payments`, { amount: 0, method: 'cash' })).status).toBe(400);
    expect((await api.post(`/api/sales/${credit.id}/payments`, { amount: 100, method: 'cheque' })).status).toBe(400);
    const a = await api.post(`/api/sales/${credit.id}/payments`, { amount: 1000, method: 'cash', idemKey: 'pay-key-0001' });
    const b = await api.post(`/api/sales/${credit.id}/payments`, { amount: 1000, method: 'cash', idemKey: 'pay-key-0001' });
    expect(b.body.receiptNo).toBe(a.body.receiptNo);
    expect(salePaid((await api.get(`/api/sales/${credit.id}`)).body)).toBe(1000);
  });
});

describe('cancelling a sale', () => {
  it('returns the stock, keeps the invoice as cancelled and blocks further payments', async () => {
    const s = (await api.post('/api/sales', { date: now(), customerId: hotel.id, method: 'cash', paid: 20000, lines: [{ itemId: wine.id, qty: 2, price: 10000 }] })).body;
    const before = (await stockOf(wine.id)).qty;
    expect((await api.post(`/api/sales/${s.id}/cancel`, { reason: '' })).status).toBe(400);
    const res = await api.post(`/api/sales/${s.id}/cancel`, { reason: 'Customer changed order' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.cancelledAt).toBeTruthy();
    expect(saleBalance(res.body)).toBe(0);
    expect((await stockOf(wine.id)).qty).toBe(before + 2);
    expect((await api.post(`/api/sales/${s.id}/cancel`, { reason: 'again' })).status).toBe(409);
    expect((await api.post(`/api/sales/${s.id}/payments`, { amount: 100, method: 'cash' })).status).toBe(409);
  });

  it('edits delivery and notes without touching amounts', async () => {
    const s = (await api.get('/api/sales')).body[0];
    const res = await api.put(`/api/sales/${s.id}`, { delivery: 'Delivered to Jinja', notes: 'Call before delivery' });
    expect(res.body).toMatchObject({ delivery: 'Delivered to Jinja', notes: 'Call before delivery' });
    expect(saleTotal(res.body)).toBe(saleTotal(s));
  });
});
