import { beforeAll, describe, expect, it } from 'vitest';
import { purchaseBalance, purchasePaid, saleBalance, salePaid } from '../../shared/calc';
import { useApi } from './helpers';

const api = useApi();
const now = () => new Date().toISOString();
let wine: { id: number }, bottles: { id: number }, hotel: { id: number }, supplier: { id: number };

beforeAll(async () => {
  wine = (await api.post('/api/items', { code: 'C-750', name: 'Sweet Red 750ml', category: 'finished', unit: 'bottle', price: 10000, qty: 50, cost: 5000 })).body;
  bottles = (await api.post('/api/items', { code: 'C-B750', name: 'Bottles', category: 'packaging', unit: 'pcs' })).body;
  hotel = (await api.post('/api/customers', { name: 'Kololo Hill Restaurant', type: 'restaurant', terms: 14 })).body;
  supplier = (await api.post('/api/suppliers', { name: 'Glass Co' })).body;
});

const cashBalance = async () => {
  const d = (await api.get('/api/dashboard?range=month')).body;
  return d.cashIn as number;
};

describe('voiding a receipt', () => {
  it('keeps the receipt, re-opens the balance and removes the money from cash received', async () => {
    const s = (await api.post('/api/sales', { date: now(), customerId: hotel.id, method: 'cash', paid: 30000, lines: [{ itemId: wine.id, qty: 3, price: 10000 }] })).body;
    const p = s.payments[0];
    expect(await cashBalance()).toBe(30000);
    expect((await api.post(`/api/sales/${s.id}/payments/${p.id}/void`, { reason: '' })).status).toBe(400);
    const res = await api.post(`/api/sales/${s.id}/payments/${p.id}/void`, { reason: 'Customer had not paid — entered by mistake' });
    expect(res.status).toBe(200);
    expect(res.body.payments[0]).toMatchObject({ voided: true, voidReason: 'Customer had not paid — entered by mistake', receiptNo: p.receiptNo });
    expect(salePaid(res.body)).toBe(0);
    expect(saleBalance(res.body)).toBe(30000);
    expect(await cashBalance()).toBe(0);
    expect((await api.post(`/api/sales/${s.id}/payments/${p.id}/void`, { reason: 'again' })).status).toBe(409);
    // the correct payment can now be recorded
    expect((await api.post(`/api/sales/${s.id}/payments`, { amount: 30000, method: 'mobile_money' })).status).toBe(201);
  });

  it('does not allow voiding receipts on a cancelled sale', async () => {
    const s = (await api.post('/api/sales', { date: now(), method: 'cash', paid: 10000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] })).body;
    await api.post(`/api/sales/${s.id}/cancel`, { reason: 'Wrong order' });
    expect((await api.post(`/api/sales/${s.id}/payments/${s.payments[0].id}/void`, { reason: 'test' })).status).toBe(409);
    expect((await api.post(`/api/sales/${s.id}/payments/99999/void`, { reason: 'test' })).status).toBe(409);
  });
});

describe('editing and correcting purchases', () => {
  it('edits an order until something is received or paid', async () => {
    const po = (await api.post('/api/purchases', { supplierId: supplier.id, lines: [{ itemId: bottles.id, qty: 100, cost: 900 }] })).body;
    const res = await api.put(`/api/purchases/${po.id}`, { supplierId: supplier.id, supplierInvoice: 'GC-77', transport: 5000, lines: [{ itemId: bottles.id, qty: 200, cost: 850 }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ supplierInvoice: 'GC-77', transport: 5000, lines: [expect.objectContaining({ qty: 200, cost: 850 })] });
    await api.post(`/api/purchases/${po.id}/receive`, { qtys: [50] });
    expect((await api.put(`/api/purchases/${po.id}`, { supplierId: supplier.id, lines: [{ itemId: bottles.id, qty: 1, cost: 1 }] })).status).toBe(409);
  });

  it('voids a supplier payment so the balance owed returns', async () => {
    const po = (await api.post('/api/purchases', { supplierId: supplier.id, lines: [{ itemId: bottles.id, qty: 10, cost: 1000 }] })).body;
    await api.post(`/api/purchases/${po.id}/receive`, { qtys: [10] });
    const paid = (await api.post(`/api/purchases/${po.id}/pay`, { amount: 10000, method: 'cash' })).body;
    expect(purchaseBalance(paid)).toBe(0);
    const res = await api.post(`/api/purchases/${po.id}/payments/${paid.payments[0].id}/void`, { reason: 'Paid from wrong account' });
    expect(res.body.payments[0].voided).toBe(true);
    expect(purchasePaid(res.body)).toBe(0);
    expect(purchaseBalance(res.body)).toBe(10000);
  });

  it('lets an order with only voided payments be cancelled', async () => {
    const po = (await api.post('/api/purchases', { supplierId: supplier.id, lines: [{ itemId: bottles.id, qty: 5, cost: 1000 }] })).body;
    const paid = (await api.post(`/api/purchases/${po.id}/pay`, { amount: 1000, method: 'cash' })).body;
    await api.post(`/api/purchases/${po.id}/payments/${paid.payments[0].id}/void`, { reason: 'Mistake' });
    expect((await api.post(`/api/purchases/${po.id}/cancel`)).body.status).toBe('cancelled');
  });
});

describe('editing expenses and voiding cashbook entries', () => {
  it('edits an active expense and audits the amount change', async () => {
    const e = (await api.post('/api/expenses', { date: now(), category: 'Utilities', description: 'Electricity', amount: 180000, method: 'mobile_money' })).body;
    const res = await api.put(`/api/expenses/${e.id}`, { ...e, amount: 150000, description: 'Electricity (UMEME)' });
    expect(res.body).toMatchObject({ amount: 150000, description: 'Electricity (UMEME)', ref: e.ref });
    const log = (await api.get('/api/audit')).body;
    expect(log.find((a: { action: string }) => a.action === 'Expense edited').details).toMatch(/180,000 → 150,000/);
    await api.post(`/api/expenses/${e.id}/void`, { reason: 'Duplicate' });
    expect((await api.put(`/api/expenses/${e.id}`, { ...e })).status).toBe(409);
  });

  it('voids a single entry, and both halves of a transfer together', async () => {
    const open = (await api.post('/api/cash', { category: 'Opening balance', method: 'cash', amount: 100000, description: 'Opening cash' })).body;
    await api.post('/api/cash/transfer', { from: 'cash', to: 'bank', amount: 40000, description: 'Deposit' });
    const cash = (await api.get('/api/cash')).body;
    const transferOut = cash.find((c: { category: string; direction: string }) => c.category === 'Transfer' && c.direction === 'out');
    const after = (await api.post(`/api/cash/${transferOut.id}/void`, { reason: 'Deposit bounced' })).body;
    expect(after.filter((c: { category: string; voided: boolean }) => c.category === 'Transfer' && c.voided)).toHaveLength(2);
    expect((await api.post(`/api/cash/${open.id}/void`, { reason: 'Wrong amount' })).body.find((c: { id: number }) => c.id === open.id).voided).toBe(true);
    expect((await api.post(`/api/cash/${open.id}/void`, { reason: 'again' })).status).toBe(409);
  });

  it('deletes a mistaken cash count', async () => {
    const c = (await api.post('/api/reconciliations', { method: 'cash', counted: 1 })).body;
    expect((await api.del(`/api/reconciliations/${c.id}`)).status).toBe(204);
    expect((await api.get('/api/reconciliations')).body).toHaveLength(0);
  });
});

describe('editing a batch', () => {
  it('updates expected litres and responsible person while in progress only', async () => {
    const b = (await api.post('/api/batches', { expectedLitres: 100, materials: [] })).body;
    const res = await api.put(`/api/batches/${b.id}`, { expectedLitres: 150, responsible: 'Florence Achieng' });
    expect(res.body).toMatchObject({ expectedLitres: 150, responsible: 'Florence Achieng' });
    await api.post(`/api/batches/${b.id}/reject`, { reason: 'Trial only' });
    expect((await api.put(`/api/batches/${b.id}`, { expectedLitres: 1, responsible: 'x' })).status).toBe(409);
  });
});
