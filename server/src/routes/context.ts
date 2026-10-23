import type { RequestHandler } from 'express';
import type { Db } from '../db';

// What every route module receives. `db` is a getter so a restore can swap connections safely.
export interface Ctx { db: () => Db; auth: RequestHandler }
