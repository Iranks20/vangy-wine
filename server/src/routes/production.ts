import { Router } from 'express';
import { z } from 'zod';
import { conflict, idParam, notFound, parse } from '../lib/http';
import { audit } from '../lib/util';
import { currentUser } from '../services/auth';
import { addMaterials, addStage, createBatch, loadBatches, loadRecipes, recordOutputs, rejectBatch, releaseBatch, saveRecipe, setQc } from '../services/production';
import type { Ctx } from './context';

const materials = z.array(z.object({
  itemId: z.coerce.number().int().positive('Choose an item.'),
  qty: z.coerce.number().positive('Quantities must be more than zero.'),
})).max(100);

const recipeSchema = z.object({
  name: z.string().trim().min(1, 'Recipe name is required.').max(150),
  baseLitres: z.coerce.number().positive('Base litres must be more than zero.'),
  lines: materials,
});

export function productionRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth);
  const user = (req: Parameters<typeof currentUser>[0]) => currentUser(req).name;

  // ---- recipes (bill of materials) ----
  r.get('/recipes', async (_req, res) => { res.json(await loadRecipes(db())); });
  r.post('/recipes', async (req, res) => {
    const id = await saveRecipe(db(), user(req), null, parse(recipeSchema, req.body));
    res.status(201).json((await loadRecipes(db())).find((x) => x.id === id));
  });
  r.put('/recipes/:id', async (req, res) => {
    const id = await saveRecipe(db(), user(req), idParam(req), parse(recipeSchema, req.body));
    res.json((await loadRecipes(db())).find((x) => x.id === id));
  });
  r.delete('/recipes/:id', async (req, res) => {
    const row = await db()('recipes').where({ id: idParam(req) }).first();
    if (!row) throw notFound('Recipe');
    await db()('recipes').where({ id: row.id }).delete();
    await audit(db(), user(req), 'Recipe deleted', row.name);
    res.status(204).end();
  });

  // ---- batches ----
  r.get('/batches', async (_req, res) => { res.json(await loadBatches(db())); });

  r.post('/batches', async (req, res) => {
    const b = parse(z.object({
      expectedLitres: z.coerce.number().positive('Expected output must be more than zero.').max(1_000_000),
      responsible: z.string().trim().max(120).optional(),
      materials,
    }), req.body);
    res.status(201).json(await createBatch(db(), user(req), b));
  });

  r.post('/batches/:id/materials', async (req, res) => {
    const b = parse(z.object({ materials: materials.min(1, 'Add at least one item.') }), req.body);
    res.json(await addMaterials(db(), user(req), idParam(req), b.materials));
  });

  r.post('/batches/:id/stages', async (req, res) => {
    const b = parse(z.object({
      stage: z.enum(['Preparation', 'Fermentation', 'Clarification', 'Aging'], { errorMap: () => ({ message: 'Choose a valid stage.' }) }),
      notes: z.string().trim().max(1000).default(''),
    }), req.body);
    res.json(await addStage(db(), user(req), idParam(req), b.stage, b.notes));
  });

  r.post('/batches/:id/outputs', async (req, res) => {
    const b = parse(z.object({
      outputs: z.array(z.object({
        itemId: z.coerce.number().int().positive(),
        good: z.coerce.number().min(0, 'Good units cannot be negative.'),
        rejected: z.coerce.number().min(0, 'Rejected units cannot be negative.').default(0),
      })).max(20),
      lossLitres: z.coerce.number().min(0, 'Losses cannot be negative.').default(0),
    }), req.body);
    res.json(await recordOutputs(db(), user(req), idParam(req), b.outputs, b.lossLitres));
  });

  r.post('/batches/:id/qc', async (req, res) => {
    const b = parse(z.object({ result: z.enum(['passed', 'failed']), notes: z.string().trim().max(1000).default('') }), req.body);
    res.json(await setQc(db(), user(req), idParam(req), b.result, b.notes));
  });

  r.post('/batches/:id/release', async (req, res) => {
    const b = parse(z.object({ expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date is not valid.').optional() }), req.body);
    if (b.expiry && b.expiry <= new Date().toISOString().slice(0, 10)) throw conflict('The expiry date must be in the future.');
    res.json(await releaseBatch(db(), user(req), idParam(req), b.expiry));
  });

  r.post('/batches/:id/reject', async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for rejecting the batch.').max(500) }), req.body);
    res.json(await rejectBatch(db(), user(req), idParam(req), b.reason));
  });

  return r;
}
