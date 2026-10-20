// Demo data store. Stands in for the future backend API: every action applies the
// same business rules the server will (stock checks, balances, audit trail).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildDemoDb, INVOICE_DEFAULTS } from './mock';
import type {
  Account, Batch, CashEntry, Customer, Db, Employee, Expense, Item, Method, Purchase, Sale, SaleLine, Settings, Supplier,
} from './types';

const KEY = 'vangy-data';

// ---------- derived figures ----------
export const lineTotal = (l: SaleLine) => l.qty * l.price - l.discount;
export const saleTotal = (s: Sale) => s.lines.reduce((t, l) => t + lineTotal(l), 0);
export const salePaid = (s: Sale) => s.payments.reduce((t, p) => t + p.amount, 0);
export const saleBalance = (s: Sale) => (s.status === 'cancelled' ? 0 : saleTotal(s) - salePaid(s));
export const saleCost = (s: Sale) => s.lines.reduce((t, l) => t + l.qty * l.cost, 0);
export const saleStatus = (s: Sale) =>
  s.status === 'cancelled' ? 'Cancelled' : saleBalance(s) <= 0 ? 'Paid' : salePaid(s) > 0 ? 'Partial' : 'Credit';

export const purchaseTotal = (p: Purchase) => p.lines.reduce((t, l) => t + l.qty * l.cost, 0) + p.transport;
export const purchaseBilled = (p: Purchase) =>
  p.status === 'cancelled' ? 0 :
  p.lines.reduce((t, l) => t + l.received * l.cost, 0) + (p.lines.some((l) => l.received > 0) ? p.transport : 0);
export const purchasePaid = (p: Purchase) => p.payments.reduce((t, x) => t + x.amount, 0);
export const purchaseBalance = (p: Purchase) => purchaseBilled(p) - purchasePaid(p);

export const batchCost = (b: Batch) => b.materials.reduce((t, m) => t + m.qty * m.cost, 0);
export const batchGoodUnits = (b: Batch) => b.outputs.reduce((t, o) => t + o.good, 0);

export interface CashLine { id: string; date: string; direction: 'in' | 'out'; amount: number; method: Method; description: string; category: string; ref: string }

export function cashbook(db: Db): CashLine[] {
  const out: CashLine[] = [];
  db.sales.forEach((s) => {
    s.payments.forEach((p) => out.push({ id: `s${s.id}-${p.id}`, date: p.date, direction: 'in', amount: p.amount, method: p.method, description: `Receipt from ${s.customerName}`, category: 'Customer receipt', ref: s.invoice }));
    if (s.status === 'cancelled' && salePaid(s) > 0)
      out.push({ id: `r${s.id}`, date: s.date, direction: 'out', amount: salePaid(s), method: s.payments[0].method, description: `Refund — ${s.invoice} cancelled`, category: 'Refund', ref: s.invoice });
  });
  db.purchases.forEach((p) => p.payments.forEach((x) => out.push({ id: `p${p.id}-${x.id}`, date: x.date, direction: 'out', amount: x.amount, method: x.method, description: `Payment to ${db.suppliers.find((s) => s.id === p.supplierId)?.name}`, category: 'Supplier payment', ref: p.po })));
  db.expenses.filter((e) => e.status === 'active').forEach((e) => out.push({ id: `e${e.id}`, date: e.date, direction: 'out', amount: e.amount, method: e.method, description: e.description, category: `Expense — ${e.category}`, ref: e.ref }));
  db.cash.forEach((c) => out.push({ id: `c${c.id}`, date: c.date, direction: c.direction, amount: c.amount, method: c.method, description: c.description, category: c.category, ref: `CB-${c.id}` }));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- store ----------
type NewSale = { salesperson: string; customerId?: number; customerName: string; customerPhone?: string; lines: Omit<SaleLine, 'cost' | 'name'>[]; paid: number; method: Method | 'credit'; delivery?: string; notes?: string; date: string };

// Brings data saved by an older version up to the current shape.
function upgrade(d: Db): Db {
  d.settings = { ...INVOICE_DEFAULTS, ...d.settings };
  const pays = d.sales.flatMap((s) => s.payments);
  let n = pays.reduce((m, p) => Math.max(m, Number(p.receiptNo?.split('-')[2] ?? 0)), 0);
  [...pays].sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => { if (!p.receiptNo) p.receiptNo = `RCT-${p.date.slice(0, 4)}-${String(++n).padStart(5, '0')}`; });
  return d;
}

const nextReceiptNo = (d: Db) => {
  const n = d.sales.flatMap((s) => s.payments).reduce((m, p) => Math.max(m, Number(p.receiptNo?.split('-')[2] ?? 0)), 0);
  return `RCT-${new Date().getFullYear()}-${String(n + 1).padStart(5, '0')}`;
};

function load(): Db {
  try { const raw = localStorage.getItem(KEY); if (raw) return upgrade(JSON.parse(raw)); } catch { /* fall through */ }
  return buildDemoDb();
}

function useStoreState() {
  const [db, setDb] = useState<Db>(load);
  const [loggedIn, setLoggedIn] = useState(() => {
    try { return sessionStorage.getItem('vangy-auth') === '1'; } catch { return false; }
  });

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }, [db]);
  useEffect(() => { try { loggedIn ? sessionStorage.setItem('vangy-auth', '1') : sessionStorage.removeItem('vangy-auth'); } catch { /* ignore */ } }, [loggedIn]);

  const user = loggedIn ? db.account : null;
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
    login: (username: string, password: string) => {
      if (!username.trim() || !password) return false;
      setLoggedIn(true);
      mutate((d) => { d.audit.unshift({ id: nextId(d.audit), date: now(), user: d.account.name, action: 'Login', details: 'Signed in' }); });
      return true;
    },
    logout: () => setLoggedIn(false),
    updateAccount: (a: Account) => mutate((d) => {
      if (!a.name.trim()) throw new Error('Name is required.');
      d.account = a;
      audit(d, 'Profile updated', 'Account name changed');
    }),

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

    saveItem: (item: Item) => mutate((d) => {
      if (d.items.some((i) => i.code.toLowerCase() === item.code.toLowerCase() && i.id !== item.id)) throw new Error('That item code is already used.');
      const idx = d.items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        if (d.items[idx].price !== item.price) audit(d, 'Price changed', `${item.name}: ${d.items[idx].price.toLocaleString()} → ${item.price.toLocaleString()}`);
        d.items[idx] = { ...d.items[idx], ...item, qty: d.items[idx].qty, lots: d.items[idx].lots };
      } else {
        const id = nextId(d.items);
        const opening = item.qty;
        d.items.push({ ...item, id, qty: 0, lots: [] });
        if (opening > 0) stockIn(d, id, opening, item.cost, 'Opening stock', 'OPENING');
        audit(d, 'Item created', item.name);
      }
    }),
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

    saveCustomer: (c: Customer) => mutate((d) => {
      const idx = d.customers.findIndex((x) => x.id === c.id);
      if (idx >= 0) d.customers[idx] = c; else d.customers.push({ ...c, id: nextId(d.customers) });
      audit(d, idx >= 0 ? 'Customer updated' : 'Customer added', c.name);
    }),
    saveSupplier: (s: Supplier) => mutate((d) => {
      const idx = d.suppliers.findIndex((x) => x.id === s.id);
      if (idx >= 0) d.suppliers[idx] = s; else d.suppliers.push({ ...s, id: nextId(d.suppliers) });
      audit(d, idx >= 0 ? 'Supplier updated' : 'Supplier added', s.name);
    }),
    saveEmployee: (e: Employee) => mutate((d) => {
      const idx = d.employees.findIndex((x) => x.id === e.id);
      if (idx >= 0) d.employees[idx] = e; else d.employees.push({ ...e, id: nextId(d.employees) });
      audit(d, idx >= 0 ? 'Employee updated' : 'Employee added', `${e.name} (${e.position})`);
    }),

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
    addCash: (c: Omit<CashEntry, 'id'>) => mutate((d) => {
      if (c.amount <= 0) throw new Error('Amount must be more than zero.');
      d.cash.push({ ...c, id: nextId(d.cash) });
      audit(d, 'Cashbook entry', `${c.category} — ${c.description}`);
    }),

    updateSettings: (s: Settings) => mutate((d) => { d.settings = s; audit(d, 'Settings updated', 'Business settings saved'); }),
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
      if (!data?.settings || !data?.account || !Array.isArray(data.items) || !Array.isArray(data.sales)) throw new Error('This file is not a valid Vangy backup.');
      setDb(upgrade(data));
    },
  };

  return { db, user, ...actions };
}

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  const value = useMemo(() => store, [store.db, store.user]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
