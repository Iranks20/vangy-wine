import { Router } from 'express';
import { z } from 'zod';
import { badRequest, idParam, notFound, parse } from '../lib/http';
import { audit, nextNumber } from '../lib/util';
import { currentUser } from '../services/auth';
import { cancelPurchase, createPurchase, loadPurchases, payPurchase, receivePurchase, updatePurchase, voidPurchasePayment } from '../services/purchases';
import { loadItems, loadMovements } from '../services/repo';
import { stockIn, stockOut } from '../services/stock';
import type { Ctx } from './context';

const method = z.enum(['cash', 'mobile_money', 'bank'], { errorMap: () => ({ message: 'Choose cash, mobile money or bank.' }) });
const shillings = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number.` }).int(`${label} must be whole shillings.`).min(0, `${label} cannot be negative.`);

const LABEL = { increase: 'Adjustment (+)', decrease: 'Adjustment (−)', damage: 'Damaged', expired: 'Expired' } as const;

export function inventoryRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);

  r.get('/movements', async (req, res) => { res.json(await loadMovements(db(), Math.min(Number(req.query.limit) || 2000, 10000))); });

  // Manual adjustments always need a reason; they are logged with who made them.
  r.post('/stock/adjustments', async (req, res) => {
    const user = currentUser(req).name;
    const b = parse(z.object({
      itemId: z.coerce.number().int().positive('Choose an item.'),
      kind: z.enum(['increase', 'decrease', 'damage', 'expired']),
      qty: z.coerce.number().positive('Quantity must be more than zero.'),
      reason: z.string().trim().min(3, 'A reason is required for stock adjustments.').max(500),
    }), req.body);
    await db().transaction(async (trx) => {
      const it = await trx('items').where({ id: b.itemId }).first();
      if (!it) throw notFound('Item');
      const ref = await nextNumber(trx, 'ADJ', 4);
      if (b.kind === 'increase') await stockIn(trx, { itemId: it.id, qty: b.qty, unitCost: Number(it.cost), type: LABEL.increase, ref, user, note: b.reason });
      else await stockOut(trx, { itemId: it.id, qty: b.qty, type: LABEL[b.kind], ref, user, note: b.reason });
      await audit(trx, user, 'Stock adjustment', `${ref} — ${it.name} ${b.kind} ${b.qty}: ${b.reason}`);
    });
    res.status(201).json((await loadItems(db(), [b.itemId]))[0]);
  });

  // ---- purchases ----
  r.get('/purchases', async (_req, res) => { res.json(await loadPurchases(db())); });

  const orderSchema = z.object({
    supplierId: z.coerce.number().int().positive('Choose a supplier.'),
    supplierInvoice: z.string().trim().max(60).optional(),
    transport: shillings('Transport & other costs').default(0),
    date: z.string().optional(),
    lines: z.array(z.object({
      itemId: z.coerce.number().int().positive('Choose an item.'),
      qty: z.coerce.number().positive('Quantity must be more than zero.'),
      cost: shillings('Unit cost'),
    })).min(1, 'Add at least one item.').max(100),
  });
  r.post('/purchases', async (req, res) => {
    res.status(201).json(await createPurchase(db(), currentUser(req).name, parse(orderSchema, req.body)));
  });

  r.put('/purchases/:id', async (req, res) => {
    res.json(await updatePurchase(db(), currentUser(req).name, idParam(req), parse(orderSchema, req.body)));
  });

  r.post('/purchases/:id/payments/:paymentId/void', async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for voiding the payment.').max(500) }), req.body);
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw badRequest('Invalid payment.');
    res.json(await voidPurchasePayment(db(), currentUser(req).name, idParam(req), paymentId, b.reason));
  });

  r.post('/purchases/:id/receive', async (req, res) => {
    const b = parse(z.object({ qtys: z.array(z.coerce.number({ invalid_type_error: 'Received quantity must be a number.' })) }), req.body);
    res.json(await receivePurchase(db(), currentUser(req).name, idParam(req), b.qtys));
  });

  r.post('/purchases/:id/pay', async (req, res) => {
    const b = parse(z.object({ amount: shillings('Amount').refine((n) => n > 0, 'Enter an amount above zero.'), method }), req.body);
    res.json(await payPurchase(db(), currentUser(req).name, idParam(req), b.amount, b.method));
  });

  r.post('/purchases/:id/cancel', async (req, res) => {
    res.json(await cancelPurchase(db(), currentUser(req).name, idParam(req)));
  });

  return r;
}
