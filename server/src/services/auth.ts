import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import type { Db } from '../db';
import { HttpError } from '../lib/http';

export interface AuthUser { id: number; name: string; username: string }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

const TOKEN_TTL = '12h';

export const hashPassword = (p: string) => bcrypt.hash(p, 10);

export async function ensureAdmin(db: Db) {
  if (!config.admin) return false;
  const exists = await db('users').where({ username: config.admin.username }).first();
  if (exists) return false;
  await db('users').insert({ username: config.admin.username, name: config.admin.name, password_hash: await hashPassword(config.admin.password) });
  return true;
}

export async function login(db: Db, username: string, password: string) {
  const u = await db('users').where({ username: username.trim() }).first();
  // Compare even when the user is missing so response time does not reveal valid usernames.
  const ok = await bcrypt.compare(password, u?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!u || !ok) return null;
  await db('users').where({ id: u.id }).update({ last_login_at: new Date() });
  const user: AuthUser = { id: u.id, name: u.name, username: u.username };
  return { user, token: jwt.sign({ sub: u.id }, config.jwtSecret, { expiresIn: TOKEN_TTL }) };
}

export function requireAuth(db: () => Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please sign in.');
    let sub: number;
    try {
      sub = Number((jwt.verify(token, config.jwtSecret) as { sub: number | string }).sub);
    } catch {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    const u = await db()('users').where({ id: sub }).first();
    if (!u) throw new HttpError(401, 'Please sign in.');
    req.user = { id: u.id, name: u.name, username: u.username };
    next();
  };
}

export const currentUser = (req: Request) => {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  return req.user;
};
