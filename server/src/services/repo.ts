// Loaders: read rows from MySQL and return them in the shapes the web app uses (shared/types).
import type { Customer, Employee, Item, Movement, Supplier } from '../../../shared/types';
import type { Db, Tx } from '../db';
import { iso, opt } from '../lib/util';

type Conn = Db | Tx;

export async function loadItems(db: Conn, ids?: number[]): Promise<Item[]> {
  const q = db('items').orderBy('category').orderBy('name');
  if (ids) q.whereIn('id', ids);
  const rows = await q;
  const lq = db('lots').where('qty', '>', 0).orderByRaw('expiry IS NULL, expiry, id');
  if (ids) lq.whereIn('item_id', ids);
  const lots = await lq;
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, category: r.category, unit: r.unit,
    price: Number(r.price), cost: Number(r.cost), qty: Number(r.qty), min: Number(r.min_level), location: r.location,
    lots: lots.filter((l) => l.item_id === r.id).map((l) => ({ lotNo: l.lot_no, mfg: opt(l.mfg), expiry: opt(l.expiry), qty: Number(l.qty) })),
  }));
}

export async function loadMovements(db: Conn, limit = 2000): Promise<Movement[]> {
  const rows = await db('stock_movements').orderBy('at', 'desc').orderBy('id', 'desc').limit(limit);
  return rows.map((m) => ({ id: Number(m.id), date: iso(m.at)!, itemId: m.item_id, type: m.type, qty: Number(m.qty), ref: m.ref, note: opt(m.note), user: m.user_name }));
}

export async function loadCustomers(db: Conn): Promise<Customer[]> {
  const rows = await db('customers').orderBy('name');
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, type: c.type, location: c.location, terms: c.terms, notes: opt(c.notes), followUp: opt(c.follow_up) }));
}

export async function loadSuppliers(db: Conn): Promise<Supplier[]> {
  const rows = await db('suppliers').orderBy('name');
  return rows.map((s) => ({ id: s.id, name: s.name, contact: s.contact, phone: s.phone, email: s.email, supplies: s.supplies }));
}

export async function loadEmployees(db: Conn): Promise<Employee[]> {
  const rows = await db('employees').orderBy('name');
  return rows.map((e) => ({ id: e.id, name: e.name, phone: e.phone, position: e.position, active: !!e.active }));
}
