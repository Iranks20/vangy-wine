import type { Db, Tx } from '../db';

type Conn = Db | Tx;

// Document numbers like INV-2026-00001. Row-locked so two requests never get the same number.
export async function nextNumber(trx: Tx, prefix: string, pad: number) {
  const name = `${prefix}-${new Date().getFullYear()}`;
  await trx.raw('INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT (name) DO NOTHING', [name]);
  const row = await trx('counters').where({ name }).forUpdate().first();
  const value = Number(row.value) + 1;
  await trx('counters').where({ name }).update({ value });
  return `${name}-${String(value).padStart(pad, '0')}`;
}

export async function audit(conn: Conn, user: string, action: string, details: string) {
  await conn('audit_log').insert({ at: new Date(), user_name: user, action, details });
}

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);
export const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v);
export const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;
export const EPS = 1e-9;
