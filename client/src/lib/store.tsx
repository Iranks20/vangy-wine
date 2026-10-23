// App data store. Records come from the Vangy Wine API; every change is sent to the server,
// which applies the business rules, and the affected records are then reloaded.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../../../shared/defaults';
import { api, newIdemKey, setUnauthorizedHandler, token } from './api';
import type {
  Account, Batch, CashEntry, Recipe, Customer, Db, Employee, Expense, Item, Method, Purchase, Sale, SaleLine, Settings, Supplier,
} from './types';

export * from '../../../shared/calc';

// ---------- store ----------
type NewSale = { salesperson: string; customerId?: number; customerName: string; customerPhone?: string; lines: Omit<SaleLine, 'cost' | 'name'>[]; paid: number; method: Method | 'credit'; delivery?: string; notes?: string; date: string };


// Records loaded from the API, by key. Keys not listed here still use local sample records (moved over phase by phase).
const API_RESOURCES = {
  settings: '/settings',
  audit: '/audit',
  items: '/items',
  customers: '/customers',
  suppliers: '/suppliers',
  employees: '/employees',
  sales: '/sales',
  movements: '/movements',
  purchases: '/purchases',
  recipes: '/recipes',
  batches: '/batches',
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

    addSale: async (input: NewSale & { idemKey?: string }) => {
      const sale = await api.post<Sale>('/sales', { ...input, idemKey: input.idemKey ?? newIdemKey() });
      await refresh('sales', 'items', 'movements', 'audit');
      return sale;
    },
    addPayment: async (saleId: number, amount: number, method: Method, ref?: string, idemKey?: string) => {
      const r = await api.post<{ receiptNo: string }>(`/sales/${saleId}/payments`, { amount, method, ref, idemKey: idemKey ?? newIdemKey() });
      await refresh('sales', 'audit');
      return r.receiptNo;
    },
    cancelSale: async (saleId: number, reason: string) => {
      await api.post(`/sales/${saleId}/cancel`, { reason });
      await refresh('sales', 'items', 'movements', 'audit');
    },
    updateSale: async (saleId: number, d: { salesperson?: string; delivery?: string; notes?: string }) => {
      await api.put(`/sales/${saleId}`, d);
      await refresh('sales', 'audit');
    },

    saveItem: async (item: Item) => {
      if (item.id) await api.put(`/items/${item.id}`, item);
      else await api.post('/items', item);
      await refresh('items', 'movements', 'audit');
    },
    deleteItem: async (id: number) => { await api.del(`/items/${id}`); await refresh('items', 'movements', 'audit'); },
    adjustStock: async (itemId: number, kind: 'increase' | 'decrease' | 'damage' | 'expired', qty: number, reason: string) => {
      await api.post('/stock/adjustments', { itemId, kind, qty, reason });
      await refresh('items', 'movements', 'audit');
    },

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

    addPurchase: async (p: Omit<Purchase, 'id' | 'po' | 'payments' | 'status'>) => {
      const created = await api.post<Purchase>('/purchases', p);
      await refresh('purchases', 'audit');
      return created.po;
    },
    receivePurchase: async (id: number, qtys: number[]) => {
      await api.post(`/purchases/${id}/receive`, { qtys });
      await refresh('purchases', 'items', 'movements', 'audit');
    },
    payPurchase: async (id: number, amount: number, method: Method) => {
      await api.post(`/purchases/${id}/pay`, { amount, method });
      await refresh('purchases', 'audit');
    },
    cancelPurchase: async (id: number) => {
      await api.post(`/purchases/${id}/cancel`);
      await refresh('purchases', 'audit');
    },

    saveRecipe: async (r: Recipe) => {
      if (r.id) await api.put(`/recipes/${r.id}`, r); else await api.post('/recipes', r);
      await refresh('recipes', 'audit');
    },
    deleteRecipe: async (id: number) => { await api.del(`/recipes/${id}`); await refresh('recipes', 'audit'); },
    addBatch: async (b: { responsible: string; expectedLitres: number; materials: { itemId: number; qty: number }[] }) => {
      const created = await api.post<Batch>('/batches', b);
      await refresh('batches', 'items', 'movements', 'audit');
      return created.batchNo;
    },
    addBatchMaterials: async (id: number, materials: { itemId: number; qty: number }[]) => {
      await api.post(`/batches/${id}/materials`, { materials });
      await refresh('batches', 'items', 'movements', 'audit');
    },
    addStage: async (id: number, stage: string, notes: string) => { await api.post(`/batches/${id}/stages`, { stage, notes }); await refresh('batches', 'audit'); },
    recordOutputs: async (id: number, outputs: Batch['outputs'], lossLitres: number) => {
      await api.post(`/batches/${id}/outputs`, { outputs, lossLitres });
      await refresh('batches', 'audit');
    },
    setQc: async (id: number, result: 'passed' | 'failed', notes: string) => { await api.post(`/batches/${id}/qc`, { result, notes }); await refresh('batches', 'audit'); },
    releaseBatch: async (id: number, expiry?: string) => {
      await api.post(`/batches/${id}/release`, { expiry });
      await refresh('batches', 'items', 'movements', 'audit');
    },
    rejectBatch: async (id: number, reason: string) => { await api.post(`/batches/${id}/reject`, { reason }); await refresh('batches', 'audit'); },

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
