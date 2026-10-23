import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const badRequest = (m: string) => new HttpError(400, m);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found.`);
export const conflict = (m: string) => new HttpError(409, m);

// Validates input and turns schema problems into a readable 400 message.
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const field = issue.path.join('.');
  throw badRequest(issue.message.includes(' ') || !field ? issue.message : `${field}: ${issue.message}`);
}

export const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id.');
  return id;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input.' });
  const e = err as { type?: string; code?: string; status?: number; message?: string };
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'The upload is too large.' });
  if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That record already exists.' });
  if (e?.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'This record is used elsewhere and cannot be deleted.' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
