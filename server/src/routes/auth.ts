import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { HttpError, conflict, parse } from '../lib/http';
import { audit } from '../lib/util';
import { currentUser, hashPassword, login } from '../services/auth';
import type { Ctx } from './context';

export function authRoutes({ db, auth }: Ctx) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.env === 'test' ? 1000 : 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' } });

  r.post('/login', limiter, async (req, res) => {
    const body = parse(z.object({ username: z.string().trim().min(1, 'Enter your username.'), password: z.string().min(1, 'Enter your password.') }), req.body);
    const result = await login(db(), body.username, body.password);
    if (!result) throw new HttpError(401, 'Wrong username or password.');
    await audit(db(), result.user.name, 'Login', 'Signed in');
    res.json(result);
  });

  r.get('/me', auth, (req, res) => { res.json(currentUser(req)); });

  r.put('/profile', auth, async (req, res) => {
    const u = currentUser(req);
    const body = parse(z.object({ name: z.string().trim().min(1, 'Name is required.').max(120), username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(60) }), req.body);
    const taken = await db()('users').whereRaw('lower(username) = lower(?)', [body.username]).whereNot({ id: u.id }).first();
    if (taken) throw conflict('That username is already taken.');
    await db()('users').where({ id: u.id }).update(body);
    await audit(db(), body.name, 'Profile updated', `Name/username changed`);
    res.json({ id: u.id, ...body });
  });

  r.put('/password', auth, async (req, res) => {
    const u = currentUser(req);
    const body = parse(z.object({ current: z.string().min(1, 'Enter your current password.'), next: z.string().min(8, 'New password must be at least 8 characters.') }), req.body);
    const row = await db()('users').where({ id: u.id }).first();
    if (!(await bcrypt.compare(body.current, row.password_hash))) throw new HttpError(400, 'Your current password is wrong.');
    await db()('users').where({ id: u.id }).update({ password_hash: await hashPassword(body.next) });
    await audit(db(), u.name, 'Password changed', 'Login password changed');
    res.json({ ok: true });
  });

  return r;
}
