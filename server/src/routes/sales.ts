import { Router } from 'express';
import { z } from 'zod';
import { badRequest, idParam, parse } from '../lib/http';
import { currentUser } from '../services/auth';
import { addPayment, cancelSale, createSale, loadSales, updateSaleDetails, voidPayment } from '../services/sales';
import type { Ctx } from './context';

const method = z.enum(['cash', 'mobile_money', 'bank'], { errorMap: () => ({ message: 'Choose cash, mobile money or bank.' }) });
const shillings = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number.` }).int(`${label} must be whole shillings.`).min(0, `${label} cannot be negative.`);
const idem = z.string().trim().min(8).max(64).optional();

const newSale = z.object({
  date: z.string().min(1, 'Sale date is required.'),
  customerId: z.coerce.number().int().positive().nullish(),
  customerName: z.string().trim().max(150).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  salesperson: z.string().trim().max(120).optional(),
  lines: z.array(z.object({
    itemId: z.coerce.number().int().positive('Choose a product.'),
    qty: z.coerce.number().positive('Quantity must be more than zero.').max(1_000_000),
    price: shillings('Unit price'),
    discount: shillings('Discount').default(0),
  })).min(1, 'Add at least one product.').max(100),
  paid: shillings('Amount paid').default(0),
  method: z.union([method, z.literal('credit')]),
  paymentRef: z.string().trim().max(80).optional(),
  delivery: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  idemKey: idem,
});

export function salesRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);

  r.get('/', async (_req, res) => { res.json(await loadSales(db())); });

  r.get('/:id', async (req, res) => {
    const [s] = await loadSales(db(), [idParam(req)]);
    if (!s) return res.status(404).json({ error: 'Sale not found.' });
    res.json(s);
  });

  r.post('/', async (req, res) => {
    const { sale, duplicate } = await createSale(db(), currentUser(req).name, parse(newSale, req.body));
    res.status(duplicate ? 200 : 201).json(sale);
  });

  r.post('/:id/payments', async (req, res) => {
    const b = parse(z.object({ amount: shillings('Amount').refine((n) => n > 0, 'Enter an amount above zero.'), method, ref: z.string().trim().max(80).optional(), idemKey: idem }), req.body);
    const receiptNo = await addPayment(db(), currentUser(req).name, idParam(req), b);
    res.status(201).json({ receiptNo });
  });

  r.post('/:id/payments/:paymentId/void', async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for voiding the receipt.').max(500) }), req.body);
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw badRequest('Invalid receipt.');
    await voidPayment(db(), currentUser(req).name, idParam(req), paymentId, b.reason);
    res.json((await loadSales(db(), [idParam(req)]))[0]);
  });

  r.post('/:id/cancel', async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for cancelling.').max(500) }), req.body);
    await cancelSale(db(), currentUser(req).name, idParam(req), b.reason);
    res.json((await loadSales(db(), [idParam(req)]))[0]);
  });

  r.put('/:id', async (req, res) => {
    const b = parse(z.object({ salesperson: z.string().max(120).optional(), delivery: z.string().max(1000).optional(), notes: z.string().max(2000).optional(), customerPhone: z.string().max(40).optional() }), req.body);
    await updateSaleDetails(db(), currentUser(req).name, idParam(req), b);
    res.json((await loadSales(db(), [idParam(req)]))[0]);
  });

  return r;
}
