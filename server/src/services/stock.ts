// Stock engine. Every change of quantity goes through stockIn / stockOut inside a transaction,
// so items.qty, lots and the stock_movements ledger always agree.
//
// Valuation: weighted-average cost. Each receipt re-averages items.cost; issues are costed at the
// current average. Issues take stock from the lot that expires first (FEFO), then the oldest lot.
import type { Tx } from '../db';
import { badRequest, notFound } from '../lib/http';
import { EPS, round } from '../lib/util';

interface InArgs { itemId: number; qty: number; unitCost: number; type: string; ref: string; user: string; note?: string; lotNo?: string; expiry?: string | null; at?: Date }
interface OutArgs { itemId: number; qty: number; type: string; ref: string; user: string; note?: string; allowOversell?: boolean; at?: Date }

async function lockItem(trx: Tx, itemId: number) {
  const it = await trx('items').where({ id: itemId }).forUpdate().first();
  if (!it) throw notFound('Item');
  return it as { id: number; name: string; unit: string; qty: number; cost: number };
}

export async function stockIn(trx: Tx, a: InArgs) {
  if (!(a.qty > 0)) throw badRequest('Quantity must be more than zero.');
  if (a.unitCost < 0) throw badRequest('Cost cannot be negative.');
  const it = await lockItem(trx, a.itemId);
  const onHand = Math.max(Number(it.qty), 0);
  const cost = onHand + a.qty > 0 ? (onHand * Number(it.cost) + a.qty * a.unitCost) / (onHand + a.qty) : a.unitCost;
  const newQty = round(Number(it.qty) + a.qty);
  await trx('items').where({ id: it.id }).update({ qty: newQty, cost: round(cost, 4) });
  // If stock was oversold (negative), the shortfall is covered first and only the rest becomes a lot.
  const lotQty = round(Math.min(a.qty, Math.max(newQty, 0)));
  if (lotQty > EPS) {
    await trx('lots').insert({ item_id: it.id, lot_no: a.lotNo ?? a.ref, mfg: (a.at ?? new Date()).toISOString().slice(0, 10), expiry: a.expiry ?? null, qty: lotQty });
  }
  await trx('stock_movements').insert({ at: a.at ?? new Date(), item_id: it.id, type: a.type, qty: a.qty, unit_cost: round(a.unitCost, 4), ref: a.ref, note: a.note ?? null, user_name: a.user });
}

// Returns the weighted-average unit cost the stock was issued at.
export async function stockOut(trx: Tx, a: OutArgs) {
  if (!(a.qty > 0)) throw badRequest('Quantity must be more than zero.');
  const it = await lockItem(trx, a.itemId);
  const onHand = Number(it.qty);
  if (a.qty > onHand + EPS && !a.allowOversell) {
    throw badRequest(`Not enough stock for ${it.name}: ${round(onHand)} ${it.unit} available, ${a.qty} requested.`);
  }
  let left = a.qty;
  const lots = await trx('lots').where({ item_id: it.id }).andWhere('qty', '>', 0)
    .orderByRaw('expiry IS NULL, expiry, id').forUpdate();
  for (const lot of lots) {
    if (left <= EPS) break;
    const take = Math.min(Number(lot.qty), left);
    await trx('lots').where({ id: lot.id }).update({ qty: round(Number(lot.qty) - take) });
    left = round(left - take);
  }
  await trx('items').where({ id: it.id }).update({ qty: round(onHand - a.qty) });
  await trx('stock_movements').insert({ at: a.at ?? new Date(), item_id: it.id, type: a.type, qty: -a.qty, unit_cost: Number(it.cost), ref: a.ref, note: a.note ?? null, user_name: a.user });
  return Number(it.cost);
}
