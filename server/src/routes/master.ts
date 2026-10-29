import { Router } from 'express';
import { z } from 'zod';
import { conflict, idParam, notFound, parse } from '../lib/http';
import { audit } from '../lib/util';
import { currentUser } from '../services/auth';
import { loadCustomers, loadEmployees, loadItems, loadSuppliers } from '../services/repo';
import { stockIn } from '../services/stock';
import type { Ctx } from './context';

const str = (max: number) => z.string().trim().max(max).default('');
const money = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number.` }).int(`${label} must be whole shillings.`).min(0, `${label} cannot be negative.`);
const quantity = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number.` }).min(0, `${label} cannot be negative.`);

const itemSchema = z.object({
  code: z.string().trim().min(1, 'Item code is required.').max(40),
  name: z.string().trim().min(1, 'Item name is required.').max(150),
  category: z.enum(['finished', 'raw', 'packaging', 'other'], { errorMap: () => ({ message: 'Choose a valid category.' }) }),
  unit: z.string().trim().min(1, 'Unit of measure is required.').max(30),
  price: money('Selling price').default(0),
  min: quantity('Minimum level').default(0),
  location: str(120),
});
const newItemSchema = itemSchema.extend({ qty: quantity('Opening stock').default(0), cost: quantity('Unit cost').default(0) });

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required.').max(150),
  phone: str(40),
  type: z.enum(['retail', 'wholesaler', 'bar', 'restaurant', 'hotel', 'event_planner', 'other']).default('retail'),
  location: str(150),
  terms: z.coerce.number().int().min(0, 'Payment terms cannot be negative.').max(365).default(0),
  notes: z.string().trim().max(2000).optional(),
  followUp: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Follow-up date is not valid.')]).optional(),
});

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required.').max(150),
  contact: str(120), phone: str(40),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]).default(''),
  supplies: str(255),
});

const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  phone: str(40), position: str(120), active: z.boolean().default(true),
});

export function masterRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);

  // ---- items ----
  r.get('/items', async (_req, res) => { res.json(await loadItems(db())); });

  r.post('/items', async (req, res) => {
    const user = currentUser(req).name;
    const b = parse(newItemSchema, req.body);
    const id = await db().transaction(async (trx) => {
      if (await trx('items').where({ code: b.code }).first()) throw conflict('That item code is already used.');
      const [{ id: itemId }] = await trx('items').insert({ code: b.code, name: b.name, category: b.category, unit: b.unit, price: b.price, min_level: b.min, location: b.location, cost: b.cost }).returning('id');
      if (b.qty > 0) await stockIn(trx, { itemId, qty: b.qty, unitCost: b.cost, type: 'Opening stock', ref: 'OPENING', user });
      await audit(trx, user, 'Item created', `${b.code} — ${b.name}`);
      return itemId;
    });
    res.status(201).json((await loadItems(db(), [id]))[0]);
  });

  r.put('/items/:id', async (req, res) => {
    const id = idParam(req);
    const user = currentUser(req).name;
    const b = parse(itemSchema, req.body);
    await db().transaction(async (trx) => {
      const cur = await trx('items').where({ id }).forUpdate().first();
      if (!cur) throw notFound('Item');
      if (await trx('items').where({ code: b.code }).whereNot({ id }).first()) throw conflict('That item code is already used.');
      await trx('items').where({ id }).update({ code: b.code, name: b.name, category: b.category, unit: b.unit, price: b.price, min_level: b.min, location: b.location });
      if (Number(cur.price) !== b.price) await audit(trx, user, 'Price changed', `${b.name}: ${Number(cur.price).toLocaleString()} → ${b.price.toLocaleString()}`);
      await audit(trx, user, 'Item updated', `${b.code} — ${b.name}`);
    });
    res.json((await loadItems(db(), [id]))[0]);
  });

  // Only items that were never traded can be deleted; their opening stock goes with them.
  r.delete('/items/:id', async (req, res) => {
    const id = idParam(req);
    await db().transaction(async (trx) => {
      const it = await trx('items').where({ id }).forUpdate().first();
      if (!it) throw notFound('Item');
      const used = await trx('stock_movements').where({ item_id: id }).whereNot({ type: 'Opening stock' }).first()
        || await trx('sale_lines').where({ item_id: id }).first() || await trx('purchase_lines').where({ item_id: id }).first()
        || await trx('recipe_lines').where({ item_id: id }).first() || await trx('batch_materials').where({ item_id: id }).first();
      if (used) throw conflict(`${it.name} has transactions and cannot be deleted.`);
      await trx('stock_movements').where({ item_id: id }).delete();
      await trx('lots').where({ item_id: id }).delete();
      await trx('items').where({ id }).delete();
      await audit(trx, currentUser(req).name, 'Item deleted', `${it.code} — ${it.name}`);
    });
    res.status(204).end();
  });

  // ---- customers, suppliers, employees ----
  crud(r, {
    path: '/customers', table: 'customers', label: 'Customer', schema: customerSchema, load: loadCustomers,
    toRow: (b) => ({ name: b.name, phone: b.phone, type: b.type, location: b.location, terms: b.terms, notes: b.notes || null, follow_up: b.followUp || null }),
    inUse: async (id) => !!(await db()('sales').where({ customer_id: id }).first()),
    inUseMsg: 'has invoices and cannot be deleted',
  });
  crud(r, {
    path: '/suppliers', table: 'suppliers', label: 'Supplier', schema: supplierSchema, load: loadSuppliers,
    toRow: (b) => b,
    inUse: async (id) => !!(await db()('purchases').where({ supplier_id: id }).first()),
    inUseMsg: 'has purchase orders and cannot be deleted',
  });
  crud(r, {
    path: '/employees', table: 'employees', label: 'Employee', schema: employeeSchema, load: loadEmployees,
    toRow: (b) => b,
    inUse: async () => false,
    inUseMsg: '',
  });

  function crud<S extends z.ZodTypeAny>(router: Router, o: {
    path: string; table: string; label: string; schema: S; inUseMsg: string;
    load: (d: ReturnType<typeof db>) => Promise<{ id: number; name: string }[]>;
    toRow: (b: z.infer<S>) => Record<string, unknown>;
    inUse: (id: number) => Promise<boolean>;
  }) {
    const one = async (id: number) => (await o.load(db())).find((x) => x.id === id);
    router.get(o.path, async (_req, res) => { res.json(await o.load(db())); });
    router.post(o.path, async (req, res) => {
      const b = parse(o.schema, req.body);
      const [{ id }] = await db()(o.table).insert(o.toRow(b)).returning('id');
      await audit(db(), currentUser(req).name, `${o.label} added`, b.name);
      res.status(201).json(await one(id));
    });
    router.put(`${o.path}/:id`, async (req, res) => {
      const id = idParam(req);
      const b = parse(o.schema, req.body);
      if (!(await db()(o.table).where({ id }).update(o.toRow(b)))) throw notFound(o.label);
      await audit(db(), currentUser(req).name, `${o.label} updated`, b.name);
      res.json(await one(id));
    });
    router.delete(`${o.path}/:id`, async (req, res) => {
      const id = idParam(req);
      const row = await db()(o.table).where({ id }).first();
      if (!row) throw notFound(o.label);
      if (await o.inUse(id)) throw conflict(`${row.name} ${o.inUseMsg}.`);
      await db()(o.table).where({ id }).delete();
      await audit(db(), currentUser(req).name, `${o.label} deleted`, row.name);
      res.status(204).end();
    });
  }

  return r;
}
