// App data store. Records come from the Vangy Wine API; every change is sent to the server,
// which applies the business rules, and the affected records are then reloaded.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../../../shared/defaults';
import { api, newIdemKey, setUnauthorizedHandler, token } from './api';
import type {
  Account, Batch, CashEntry, Recipe, Customer, Db, Employee, Expense, Item, Method, Purchase, Sale, SaleLine, Settings, Supplier,
} from './types';

export * from '../../../shared/calc';

const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  if (f.size > 4 * 1024 * 1024) return reject(new Error('The attachment is larger than 4 MB.'));
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(new Error('Could not read the file.'));
  r.readAsDataURL(f);
});

type NewSale = { salesperson: string; customerId?: number; customerName: string; customerPhone?: string; lines: Omit<SaleLine, 'cost' | 'name'>[]; paid: number; method: Method | 'credit'; delivery?: string; notes?: string; date: string };

// Every collection the app shows, and the API endpoint it is loaded from.
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
  expenses: '/expenses',
  cash: '/cash',
  reconciliations: '/reconciliations',
} satisfies Partial<Record<keyof Db, string>>;
export type ApiKey = keyof typeof API_RESOURCES;

const emptyDb = (): Db => ({
  account: { name: '', username: '' }, settings: DEFAULT_SETTINGS, items: [], movements: [], customers: [], suppliers: [],
  sales: [], purchases: [], batches: [], expenses: [], cash: [], employees: [], audit: [], recipes: [], reconciliations: [],
});

function useStoreState() {
  const [db, setDb] = useState<Db>(emptyDb);
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState<Set<ApiKey>>(() => new Set());

  const refresh = useCallback(async (...keys: ApiKey[]) => {
    const ks = keys.length ? keys : (Object.keys(API_RESOURCES) as ApiKey[]);
    const data = await Promise.all(ks.map((k) => api.get<unknown>(API_RESOURCES[k])));
    setDb((d) => ({ ...d, ...Object.fromEntries(ks.map((k, i) => [k, data[i]])) }));
    setLoaded((l) => new Set([...l, ...ks]));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { token.set(null); setUser(null); });
    if (!token.get()) { setReady(true); return; }
    api.get<Account>('/auth/me')
      .then(async (u) => { await refresh('settings'); setUser(u); })
      .catch(() => token.set(null))
      .finally(() => setReady(true));
  }, [refresh]);

  const actions = {
    login: async (username: string, password: string) => {
      const r = await api.post<{ token: string; user: Account }>('/auth/login', { username, password });
      token.set(r.token);
      await refresh('settings');
      setUser(r.user);
    },
    logout: () => { token.set(null); setUser(null); setDb(emptyDb()); setLoaded(new Set()); },
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
    voidPayment: async (saleId: number, paymentId: number, reason: string) => {
      await api.post(`/sales/${saleId}/payments/${paymentId}/void`, { reason });
      await refresh('sales', 'audit');
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
    updatePurchase: async (id: number, p: Omit<Purchase, 'id' | 'po' | 'payments' | 'status'>) => {
      await api.put(`/purchases/${id}`, p);
      await refresh('purchases', 'audit');
    },
    voidPurchasePayment: async (id: number, paymentId: number, reason: string) => {
      await api.post(`/purchases/${id}/payments/${paymentId}/void`, { reason });
      await refresh('purchases', 'audit');
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
    updateBatch: async (id: number, b: { expectedLitres: number; responsible: string }) => {
      await api.put(`/batches/${id}`, b);
      await refresh('batches', 'audit');
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

    addExpense: async (e: Omit<Expense, 'id' | 'ref' | 'status'>, file?: File | null) => {
      const attachment = file ? { filename: file.name, mime: file.type || 'application/octet-stream', data: await fileToBase64(file) } : undefined;
      await api.post('/expenses', { ...e, attachment });
      await refresh('expenses', 'audit');
    },
    updateExpense: async (id: number, e: Omit<Expense, 'id' | 'ref' | 'status'>, file?: File | null) => {
      const attachment = file ? { filename: file.name, mime: file.type || 'application/octet-stream', data: await fileToBase64(file) } : undefined;
      await api.put(`/expenses/${id}`, { ...e, attachment });
      await refresh('expenses', 'audit');
    },
    voidExpense: async (id: number, reason: string) => { await api.post(`/expenses/${id}/void`, { reason }); await refresh('expenses', 'audit'); },
    openAttachment: async (id: number) => {
      const blob = await api.blob(`/expenses/${id}/attachment`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    },
    addCash: async (c: Omit<CashEntry, 'id'>) => { await api.post('/cash', c); await refresh('cash', 'audit'); },
    voidCash: async (id: number, reason: string) => { await api.post(`/cash/${id}/void`, { reason }); await refresh('cash', 'audit'); },
    addTransfer: async (t: { amount: number; from: Method; to: Method; description: string }) => {
      await api.post('/cash/transfer', t);
      await refresh('cash', 'audit');
    },
    saveCount: async (method: Method, counted: number, notes?: string) => {
      await api.post('/reconciliations', { method, counted, notes });
      await refresh('reconciliations', 'audit');
    },

    deleteCount: async (id: number) => { await api.del(`/reconciliations/${id}`); await refresh('reconciliations', 'audit'); },
    updateSettings: async (s: Settings) => {
      await api.put('/settings', s);
      await refresh('settings', 'audit');
    },
    backupNow: async () => {
      const blob = await api.blob('/backup');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vangy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000); // revoking at once can cancel the download
      await refresh('settings', 'audit');
    },
    restore: async (backup: unknown) => {
      await api.post('/backup/restore', backup);
      await refresh();
    },
  };

  return { db, user, ready, loaded, refresh, ...actions };
}

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  const value = useMemo(() => store, [store.db, store.user, store.ready, store.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
