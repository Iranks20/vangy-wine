import { beforeAll, describe, expect, it } from 'vitest';
import { useApi } from './helpers';

const api = useApi();
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = () => new Date().toISOString();
let wine: { id: number }, hotel: { id: number };

beforeAll(async () => {
  wine = (await api.post('/api/items', { code: 'D-750', name: 'Sweet Red 750ml', category: 'finished', unit: 'bottle', price: 10000, qty: 100, cost: 4000, min: 95 })).body;
  hotel = (await api.post('/api/customers', { name: 'Lakeside Lodge', type: 'hotel', terms: 30 })).body;
  // 10 bottles: 100,000 revenue, 40,000 cost, 60,000 paid now
  await api.post('/api/sales', { date: now(), customerId: hotel.id, method: 'cash', paid: 60000, lines: [{ itemId: wine.id, qty: 10, price: 10000 }] });
  await api.post('/api/expenses', { date: now(), category: 'Rent', description: 'Rent', amount: 25000, method: 'bank' });
});

describe('dashboard', () => {
  it('separates revenue, cash received, receivables and profit', async () => {
    const d = (await api.get('/api/dashboard?range=month')).body;
    expect(d.revenue).toBe(100000);
    expect(d.cashIn).toBe(60000);         // only money actually received
    expect(d.receivables).toBe(40000);    // still owed — not profit, not cash
    expect(d.cogs).toBe(40000);
    expect(d.grossProfit).toBe(60000);
    expect(d.netProfit).toBe(35000);
    expect(d.expenses).toBe(25000);
    expect(d.stockValue).toBe(90 * 4000);
    expect(d.periods.today).toBe(100000);
    expect(d.lowStock.map((i: { name: string }) => i.name)).toEqual(['Sweet Red 750ml']); // 90 left, min 95
    expect(d.best[0]).toMatchObject({ qty: 10, revenue: 100000 });
    expect(d.recentSales).toHaveLength(1);
    expect(d.trend.reduce((t: number, x: { Sales: number }) => t + x.Sales, 0)).toBe(100000);
  });

  it('counts refunds of cancelled sales against cash received', async () => {
    const s = (await api.post('/api/sales', { date: now(), method: 'cash', paid: 10000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] })).body;
    await api.post(`/api/sales/${s.id}/cancel`, { reason: 'Wrong product' });
    const d = (await api.get('/api/dashboard?range=month')).body;
    expect(d.revenue).toBe(100000);
    expect(d.cashIn).toBe(60000);
  });

  it('validates the date range', async () => {
    expect((await api.get('/api/dashboard?range=custom')).status).toBe(400);
    expect((await api.get('/api/dashboard?range=forever')).status).toBe(400);
    const empty = (await api.get('/api/dashboard?range=custom&from=2020-01-01&to=2020-01-31')).body;
    expect(empty.revenue).toBe(0);
  });
});

describe('reports', () => {
  it('lists all 20 reports', async () => {
    expect((await api.get('/api/reports')).body).toHaveLength(20);
  });

  it('builds the profit and loss statement from the records', async () => {
    const r = (await api.get(`/api/reports/pnl?from=${day()}&to=${day()}`)).body;
    expect(r.title).toBe('Profit and loss statement');
    expect(r.rows[0]).toEqual(['Sales revenue', 100000]);
    expect(r.rows[1]).toEqual(['Less: cost of wine sold', -40000]);
    expect(r.totals).toEqual(['NET PROFIT (ESTIMATE)', 35000]);
    expect(r.note).toMatch(/Not audited/);
  });

  it('shows customer debts by age and the daily sales total', async () => {
    const debts = (await api.get(`/api/reports/debts?from=${day()}&to=${day()}`)).body;
    expect(debts.rows[0]).toEqual(['Lakeside Lodge', 40000, 0, 0, 0, 40000]);
    const daily = (await api.get(`/api/reports/daily?from=${day()}&to=${day()}`)).body;
    expect(daily.totals).toEqual(['Total', 1, 100000, 60000, 40000]);
  });

  it('runs every report without error and rejects bad input', async () => {
    for (const { id } of (await api.get('/api/reports')).body) {
      const res = await api.get(`/api/reports/${id}?from=2020-01-01&to=${day()}`);
      expect(res.status, id).toBe(200);
      expect(Array.isArray(res.body.rows), id).toBe(true);
    }
    expect((await api.get('/api/reports/nope?from=2020-01-01&to=2020-01-02')).status).toBe(404);
    expect((await api.get('/api/reports/pnl?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await api.get('/api/reports/pnl')).status).toBe(400);
  });
});

describe('backup and restore', () => {
  it('downloads a backup, records the time, and restores it exactly', async () => {
    const salesAtBackup = (await api.get('/api/sales')).body.length;
    const res = await api.get('/api/backup');
    expect(res.status).toBe(200);
    const backup = res.body;
    expect(backup.app).toBe('vangy-wine');
    expect(backup.tables.users).toBeUndefined(); // logins are never exported
    expect((await api.get('/api/settings')).body.lastBackup).toBeTruthy();

    // change things after the backup
    await api.post('/api/customers', { name: 'Added after backup' });
    await api.post('/api/sales', { date: now(), method: 'cash', paid: 10000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] });

    const restored = await api.post('/api/backup/restore', backup);
    expect(restored.status).toBe(200);
    expect((await api.get('/api/customers')).body.map((c: { name: string }) => c.name)).toEqual(['Lakeside Lodge']);
    expect((await api.get('/api/sales')).body).toHaveLength(salesAtBackup);
    expect((await api.get('/api/items')).body[0].qty).toBe(90);
    // numbering carries on after a restore
    const next = await api.post('/api/sales', { date: now(), method: 'cash', paid: 10000, lines: [{ itemId: wine.id, qty: 1, price: 10000 }] });
    expect(next.body.invoice).toMatch(new RegExp(`-${String(salesAtBackup + 1).padStart(5, '0')}$`));
    // still signed in: users were not touched
    expect((await api.get('/api/auth/me')).status).toBe(200);
  });

  it('rejects files that are not backups and leaves data untouched', async () => {
    const before = (await api.get('/api/sales')).body.length;
    expect((await api.post('/api/backup/restore', { hello: 'world' })).status).toBe(400);
    expect((await api.post('/api/backup/restore', { app: 'vangy-wine', format: 1, tables: { users: [] } })).status).toBe(400);
    expect((await api.post('/api/backup/restore', { app: 'vangy-wine', format: 1, tables: { customers: [] } })).status).toBe(400);
    expect((await api.get('/api/sales')).body.length).toBe(before);
  });
});
