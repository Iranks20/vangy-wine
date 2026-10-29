import 'dotenv/config';
import { z } from 'zod';

process.env.TZ ||= 'Africa/Kampala'; // business dates and numbering follow Uganda time

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('vangy_wine'),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:4173'),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('Director'),
});

const env = schema.parse(process.env);

if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
}

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL || undefined,
  db: { host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME },
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  corsOrigins: env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  admin: env.ADMIN_USERNAME && env.ADMIN_PASSWORD ? { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD, name: env.ADMIN_NAME } : null,
};
