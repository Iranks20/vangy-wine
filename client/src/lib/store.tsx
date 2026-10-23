// App data store. Records come from the Vangy Wine API; every change is sent to the server,
// which applies the business rules, and the affected records are then reloaded.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../../../shared/defaults';
import { api, setUnauthorizedHandler, token } from './api';
import type {
  Account, Batch, CashEntry, Customer, Db, Employee, Expense, Item, Method, Purchase, Sale, SaleLine, Settings, Supplier,
} from './types';
import { batchCost, batchGoodUnits, purchasePaid, purchaseTotal, saleBalance, saleTotal } from '../../../shared/calc';

export * from '../../../shared/calc';

// ---------- store ----------
type NewSale = { salesperson: string; customerId?: number; customerName: string; customerPhone?: string; lines: Omit<SaleLine, 'cost' | 'name'>[]; paid: number; method: Method | 'credit'; delivery?: string; notes?: string; date: string };

const nextReceiptNo = (d: Db) => {
  const n = d.sales.flatMap((s) => s.payments).reduce((m, p) => Math.max(m, Number(p.receiptNo?.split('-')[2] ?? 0)), 0);
  return `RCT-${new Date().getFullYear()}-${String(n + 1).padStart(5, '0')}`;
};

// Records loaded from the API, by key. Keys not listed here still use local sample records (moved over phase by phase).
const API_RESOURCES = {
  settings: '/settings',
  audit: '/audit',
  items: '/items',
  customers: '/customers',
  suppliers: '/suppliers',
  employees: '/employees',
} satisfies Partial<Record<keyof Db, string>>;
type ApiKey = keyof typeof API_RESOURCES;

const emptyDb = (): Db => ({
  account: { name: '', username: '' }, settings: DEFAULT_SETTINGS, items: [], movements: [], customers: [], suppliers: [],
  sales: [], purchases: [], batches: [], expenses: [], cash: [], employees: [], audit: [], recipes: [], reconciliations: [],
});

function useStoreState() {
  const [db, setDb] = useState<Db>(emptyDb);
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (...keys: ApiKey[]) => {
    const ks = keys.length ? keys : (Object.keys(API_RESOURCES) as ApiKey[]);
    const data = await Promise.all(ks.map((k) => api.get<unknown>(API_RESOURCES[k])));
    setDb((d) => ({ ...d, ...Object.fromEntries(ks.map((k, i) => [k, data[i]])) }));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { token.set(null); setUser(null); });
    if (!token.get()) { setReady(true); return; }
    api.get<Account>('/auth/me')
      .then(async (u) => { setUser(u); await refresh(); })
      .catch(() => token.set(null))
      .finally(() => setReady(true));
  }, [refresh]);

  const now = () => new Date().toISOString();
  const nextId = (arr: { id: number }[]) => arr.reduce((m, x) => Math.max(m, x.id), 0) + 1;

  // Apply a mutation on a deep copy so a thrown validation error leaves state untouched.
  function mutate<T>(fn: (d: Db) => T): T {
    const draft: Db = structuredClone(db);
    const result = fn(draft);
    setDb(draft);
    return result;
  }
  const audit = (d: Db, action: string, details: string) =>
    d.audit.unshift({ id: nextId(d.audit), date: now(), user: user?.name ?? 'System', action, details });

  const stockOut = (d: Db, itemId: number, qty: number, type: string, ref: string, note?: string) => {
    const it = d.items.find((i) => i.id === itemId)!;
    if (qty > it.qty && !d.settings.allowOversell) throw new Error(`Not enough stock for ${it.name}: ${it.qty} ${it.unit} available, ${qty} requested.`);
    let left = qty;
    it.lots.sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999'));
    for (const l of it.lots) { const take = Math.min(l.qty, left); l.qty -= take; left -= take; if (!left) break; }
    it.lots = it.lots.filter((l) => l.qty > 0);
    it.qty -= qty;
    d.movements.unshift({ id: nextId(d.movements), date: now(), itemId, type, qty: -qty, ref, note, user: user?.name ?? '' });
  };
  const stockIn = (d: Db, itemId: number, qty: number, unitCost: number, type: string, ref: string, lot?: { lotNo: string; expiry?: string }) => {
    const it = d.items.find((i) => i.id === itemId)!;
    if (it.qty + qty > 0) it.cost = Math.round(((Math.max(it.qty, 0) * it.cost) + qty * unitCost) / (Math.max(it.qty, 0) + qty)); // weighted average
    it.qty += qty;
    if (lot) it.lots.push({ lotNo: lot.lotNo, mfg: now().slice(0, 10), expiry: lot.expiry, qty });
    d.movements.unshift({ id: nextId(d.movements), date: now(), itemId, type, qty, ref, user: user?.name ?? '' });
  };

  const actions = {
    login: async (username: string, password: string) => {
      const r = await api.post<{ token: string; user: Account }>('/auth/login', { username, password });
      token.set(r.token);
      await refresh();
      setUser(r.user);
    },
    logout: () => { token.set(null); setUser(null); setDb(emptyDb()); },
    updateAccount: async (a: Account) => {
      setUser(await api.put<Account>('/auth/profile', a));
      await refresh('audit');
    },
    changePassword: async (current: string, next: string) => {
      await api.put('/auth/password', { current, next });
      await refresh('audit');
    },

    addSale: (input: NewSale) => mutate((d) => {
      if (!input.lines.length) throw new Error('Add at least one product.');
      const id = nextId(d.sales);
      const invoice = `${d.settings.invoicePrefix}-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
      const lines: SaleLine[] = input.lines.map((l) => {
        const it = d.items.find((i) => i.id === l.itemId)!;
        if (l.qty <= 0) throw new Error('Quantity must be more than zero.');
        if (l.discount > l.qty * l.price) throw new Error('Discount cannot be more than the line value.');
        stockOut(d, it.id, l.qty, 'Sale', invoice);
        return { ...l, name: it.name, cost: it.cost };
      });
      const sale: Sale = {
        id, invoice, date: input.date, customerId: input.customerId, customerName: input.customerName || 'Walk-in customer',
        customerPhone: input.customerPhone, lines, payments: [], salesperson: input.salesperson || (user?.name ?? ''),
        delivery: input.delivery, notes: input.notes, status: 'completed',
      };
      const total = saleTotal(sale);
      if (input.paid > total) throw new Error('Amount paid cannot be more than the total.');
      if (input.paid < total && !input.customerId) throw new Error('Credit or part-payment needs a registered customer, so the debt can be tracked.');
      if (input.paid > 0) sale.payments.push({ id: Date.now(), date: input.date, amount: input.paid, method: input.method === 'credit' ? 'cash' : input.method, receiptNo: nextReceiptNo(d) });
      const cust = d.customers.find((c) => c.id === input.customerId);
      const due = new Date(input.date); due.setDate(due.getDate() + (cust?.terms ?? 0));
      sale.dueDate = due.toISOString().slice(0, 10);
      d.sales.push(sale);
      audit(d, 'Sale recorded', `${invoice} — ${sale.customerName}`);
      return sale;
    }),
    addPayment: (saleId: number, amount: number, method: Method, ref?: string) => mutate((d) => {
      const s = d.sales.find((x) => x.id === saleId)!;
      if (amount <= 0) throw new Error('Enter an amount above zero.');
      if (amount > saleBalance(s)) throw new Error('Payment is more than the balance owed.');
      const receiptNo = nextReceiptNo(d);
      s.payments.push({ id: Date.now(), date: now(), amount, method, ref, receiptNo });
      audit(d, 'Payment received', `${receiptNo} for ${s.invoice} — ${amount.toLocaleString()} via ${method}`);
      return receiptNo;
    }),
    cancelSale: (saleId: number, reason: string) => mutate((d) => {
      const s = d.sales.find((x) => x.id === saleId)!;
      s.status = 'cancelled';
      s.notes = [s.notes, `Cancelled: ${reason}`].filter(Boolean).join(' | ');
      s.lines.forEach((l) => stockIn(d, l.itemId, l.qty, l.cost, 'Sale cancelled — restocked', s.invoice));
      audit(d, 'Sale cancelled', `${s.invoice} — ${reason}`);
    }),

    saveItem: async (item: Item) => {
      if (item.id) await api.put(`/items/${item.id}`, item);
      else await api.post('/items', item);
      await refresh('items', 'audit');
    },
    deleteItem: async (id: number) => { await api.del(`/items/${id}`); await refresh('items', 'audit'); },
    adjustStock: (itemId: number, kind: 'increase' | 'decrease' | 'damage' | 'expired', qty: number, reason: string) => mutate((d) => {
      if (qty <= 0) throw new Error('Quantity must be more than zero.');
      if (!reason.trim()) throw new Error('A reason is required for stock adjustments.');
      const it = d.items.find((i) => i.id === itemId)!;
      const ref = `ADJ-${new Date().getFullYear()}-${String(d.movements.length).padStart(4, '0')}`;
      const label = { increase: 'Adjustment (+)', decrease: 'Adjustment (−)', damage: 'Damaged', expired: 'Expired' }[kind];
      if (kind === 'increase') stockIn(d, itemId, qty, it.cost, label, ref);
      else stockOut(d, itemId, qty, label, ref, reason);
      audit(d, 'Stock adjustment', `${ref} — ${it.name} ${kind} ${qty}: ${reason}`);
    }),

    saveCustomer: async (c: Customer) => {
      if (c.id) await api.put(`/customers/${c.id}`, c); else await api.post('/customers', c);
      await refresh('customers', 'audit');
    },
    deleteCustomer: async (id: number) => { await api.del(`/customers/${id}`); await refresh('customers', 'audit'); },
    saveSupplier: async (s: Supplier) => {
      if (s.id) await api.put(`/suppliers/${s.id}`, s); else await api.post('/suppliers', s);
      await refresh('suppliers', 'audit');
    },
    deleteSupplier: async (id: number) => { await api.del(`/suppliers/${id}`); await refresh('suppliers', 'audit'); },
    saveEmployee: async (e: Employee) => {
      if (e.id) await api.put(`/employees/${e.id}`, e); else await api.post('/employees', e);
      await refresh('employees', 'audit');
    },
    deleteEmployee: async (id: number) => { await api.del(`/employees/${id}`); await refresh('employees', 'audit'); },

    addPurchase: (p: Omit<Purchase, 'id' | 'po' | 'payments' | 'status'>) => mutate((d) => {
      if (!p.lines.length) throw new Error('Add at least one item.');
      const id = nextId(d.purchases);
      const po = `PO-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
      d.purchases.push({ ...p, id, po, payments: [], status: 'ordered' });
      audit(d, 'Purchase order created', po);
      return po;
    }),
    receivePurchase: (id: number, qtys: number[]) => mutate((d) => {
      const p = d.purchases.find((x) => x.id === id)!;
      const goods = p.lines.reduce((t, l) => t + l.qty * l.cost, 0) || 1;
      let any = false;
      p.lines.forEach((l, i) => {
        const q = qtys[i] || 0;
        if (q < 0) throw new Error('Received quantity cannot be negative.');
        if (q > l.qty - l.received) throw new Error('Cannot receive more than was ordered.');
        if (!q) return;
        any = true;
        const landed = l.cost + (p.transport * (l.qty * l.cost / goods)) / l.qty; // transport shared by value
        l.received += q;
        stockIn(d, l.itemId, q, landed, 'Purchase received', p.po);
      });
      if (!any) throw new Error('Enter at least one received quantity.');
      p.status = p.lines.every((l) => l.received >= l.qty) ? 'received' : 'partial';
      audit(d, 'Goods received', p.po);
    }),
    payPurchase: (id: number, amount: number, method: Method) => mutate((d) => {
      const p = d.purchases.find((x) => x.id === id)!;
      if (amount <= 0) throw new Error('Enter an amount above zero.');
      if (amount > purchaseTotal(p) - purchasePaid(p)) throw new Error('Payment is more than the order value outstanding.');
      p.payments.push({ id: Date.now(), date: now(), amount, method });
      audit(d, 'Supplier payment', `${p.po} — ${amount.toLocaleString()}`);
    }),
    cancelPurchase: (id: number) => mutate((d) => {
      const p = d.purchases.find((x) => x.id === id)!;
      if (p.lines.some((l) => l.received > 0) || p.payments.length) throw new Error('Only orders with nothing received or paid can be cancelled.');
      p.status = 'cancelled';
      audit(d, 'Purchase cancelled', p.po);
    }),

    addBatch: (b: { startDate: string; responsible: string; expectedLitres: number; materials: { itemId: number; qty: number }[] }) => mutate((d) => {
      const id = nextId(d.batches);
      const batchNo = `B-${new Date().getFullYear()}-${String(id).padStart(3, '0')}`;
      const materials = b.materials.map((m) => {
        const it = d.items.find((i) => i.id === m.itemId)!;
        stockOut(d, m.itemId, m.qty, 'Used in production', batchNo);
        return { ...m, cost: it.cost };
      });
      d.batches.push({ id, batchNo, startDate: b.startDate, responsible: b.responsible, expectedLitres: b.expectedLitres, stage: 'Preparation', stages: [{ stage: 'Preparation', date: now(), notes: 'Batch started' }], materials, outputs: [], lossLitres: 0, qc: 'pending', status: 'in_progress' });
      audit(d, 'Batch created', batchNo);
      return batchNo;
    }),
    addStage: (id: number, stage: string, notes: string) => mutate((d) => {
      const b = d.batches.find((x) => x.id === id)!;
      b.stage = stage; b.stages.push({ stage, date: now(), notes });
    }),
    recordOutputs: (id: number, outputs: Batch['outputs'], lossLitres: number) => mutate((d) => {
      const b = d.batches.find((x) => x.id === id)!;
      b.outputs = outputs.filter((o) => o.good > 0 || o.rejected > 0);
      b.lossLitres = lossLitres; b.bottlingDate = now().slice(0, 10);
      b.stage = 'Bottling'; b.stages.push({ stage: 'Bottling', date: now(), notes: `${batchGoodUnits(b)} good units recorded` });
    }),
    setQc: (id: number, result: 'passed' | 'failed', notes: string) => mutate((d) => {
      const b = d.batches.find((x) => x.id === id)!;
      b.qc = result; b.qcNotes = notes; b.stage = 'Quality check';
      b.stages.push({ stage: 'Quality check', date: now(), notes: `${result.toUpperCase()} — ${notes}` });
      audit(d, 'Quality check', `${b.batchNo} ${result}`);
    }),
    releaseBatch: (id: number) => mutate((d) => {
      const b = d.batches.find((x) => x.id === id)!;
      if (b.qc !== 'passed') throw new Error('A batch can only be released after it passes quality check.');
      const units = batchGoodUnits(b);
      if (!units) throw new Error('Record the bottled output first.');
      const unitCost = batchCost(b) / units;
      const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
      b.outputs.forEach((o) => o.good && stockIn(d, o.itemId, o.good, unitCost, 'Production output', b.batchNo, { lotNo: b.batchNo, expiry: exp.toISOString().slice(0, 10) }));
      b.status = 'released'; b.stage = 'Released';
      b.stages.push({ stage: 'Released', date: now(), notes: 'Moved to saleable stock' });
      audit(d, 'Batch released', `${b.batchNo} — ${units} units to stock`);
    }),
    rejectBatch: (id: number, reason: string) => mutate((d) => {
      const b = d.batches.find((x) => x.id === id)!;
      b.status = 'rejected'; b.stage = 'Rejected'; b.stages.push({ stage: 'Rejected', date: now(), notes: reason });
      audit(d, 'Batch rejected', `${b.batchNo} — ${reason}`);
    }),

    addExpense: (e: Omit<Expense, 'id' | 'ref' | 'status'>) => mutate((d) => {
      if (e.amount <= 0) throw new Error('Amount must be more than zero.');
      const id = nextId(d.expenses);
      const ref = `EXP-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
      d.expenses.push({ ...e, id, ref, status: 'active' });
      audit(d, 'Expense recorded', `${ref} — ${e.description}`);
    }),
    voidExpense: (id: number, reason: string) => mutate((d) => {
      const e = d.expenses.find((x) => x.id === id)!;
      e.status = 'voided';
      audit(d, 'Expense voided', `${e.ref} — ${reason}`);
    }),
    addTransfer: (t: { date: string; amount: number; from: Method; to: Method; description: string }) => mutate((d) => {
      if (t.amount <= 0) throw new Error('Amount must be more than zero.');
      d.cash.push({ id: nextId(d.cash), date: t.date, direction: 'out', amount: t.amount, method: t.from, description: t.description, category: 'Transfer' });
      d.cash.push({ id: nextId(d.cash), date: t.date, direction: 'in', amount: t.amount, method: t.to, description: t.description, category: 'Transfer' });
    }),
    addCash: (c: Omit<CashEntry, 'id'>) => mutate((d) => {
      if (c.amount <= 0) throw new Error('Amount must be more than zero.');
      d.cash.push({ ...c, id: nextId(d.cash) });
      audit(d, 'Cashbook entry', `${c.category} — ${c.description}`);
    }),

    updateSettings: async (s: Settings) => {
      await api.put('/settings', s);
      await refresh('settings', 'audit');
    },
    backupNow: () => mutate((d) => {
      d.settings.lastBackup = now();
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vangy-backup-${now().slice(0, 10)}.json`;
      a.click();
      audit(d, 'Backup', 'Manual backup downloaded');
    }),
    restore: (data: Db) => {
      if (!data?.settings || !Array.isArray(data.items) || !Array.isArray(data.sales)) throw new Error('This file is not a valid Vangy backup.');
      setDb(data);
    },
  };

  return { db, user, ready, refresh, ...actions };
}

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  const value = useMemo(() => store, [store.db, store.user, store.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
