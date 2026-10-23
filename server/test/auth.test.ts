import { describe, expect, it } from 'vitest';
import { useApi } from './helpers';
import { TEST_ENV } from './env';

const api = useApi();

describe('health', () => {
  it('reports the database is reachable', async () => {
    const res = await api.anon().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('auth', () => {
  it('created the director login from the environment during migration', async () => {
    const u = await api.ctx.db('users').where({ username: TEST_ENV.ADMIN_USERNAME }).first();
    expect(u.name).toBe(TEST_ENV.ADMIN_NAME);
    expect(u.password_hash).not.toBe(TEST_ENV.ADMIN_PASSWORD); // stored hashed
  });

  it('rejects a wrong password and an empty form', async () => {
    const wrong = await api.anon().post('/api/auth/login').send({ username: TEST_ENV.ADMIN_USERNAME, password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('Wrong username or password.');
    const empty = await api.anon().post('/api/auth/login').send({ username: '', password: '' });
    expect(empty.status).toBe(400);
  });

  it('blocks protected routes without a valid token', async () => {
    expect((await api.anon().get('/api/settings')).status).toBe(401);
    expect((await api.anon().get('/api/settings').set('Authorization', 'Bearer forged.token.here')).status).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const res = await api.get('/api/auth/me');
    expect(res.body).toMatchObject({ username: TEST_ENV.ADMIN_USERNAME, name: TEST_ENV.ADMIN_NAME });
  });

  it('updates the profile and changes the password', async () => {
    const p = await api.put('/api/auth/profile', { name: 'Grace N.', username: TEST_ENV.ADMIN_USERNAME });
    expect(p.status).toBe(200);
    expect(p.body.name).toBe('Grace N.');

    expect((await api.put('/api/auth/password', { current: 'bad', next: 'Another-Pass-1' })).status).toBe(400);
    expect((await api.put('/api/auth/password', { current: TEST_ENV.ADMIN_PASSWORD, next: 'short' })).status).toBe(400);
    expect((await api.put('/api/auth/password', { current: TEST_ENV.ADMIN_PASSWORD, next: 'Another-Pass-1' })).status).toBe(200);
    const ok = await api.anon().post('/api/auth/login').send({ username: TEST_ENV.ADMIN_USERNAME, password: 'Another-Pass-1' });
    expect(ok.status).toBe(200);
    // put things back for the other test files
    await api.put('/api/auth/password', { current: 'Another-Pass-1', next: TEST_ENV.ADMIN_PASSWORD });
    await api.put('/api/auth/profile', { name: TEST_ENV.ADMIN_NAME, username: TEST_ENV.ADMIN_USERNAME });
  });
});

describe('settings', () => {
  it('starts with the business profile and saves changes', async () => {
    const s = (await api.get('/api/settings')).body;
    expect(s.businessName).toBe('Vangy Wine Company Limited');
    expect(s.currency).toBe('UGX');
    const res = await api.put('/api/settings', { ...s, phone: '+256 700 111 222', tin: '1000123456' });
    expect(res.status).toBe(200);
    expect(res.body.tin).toBe('1000123456');
  });

  it('validates input', async () => {
    const s = (await api.get('/api/settings')).body;
    const bad = await api.put('/api/settings', { ...s, invoicePrefix: 'x1', email: 'not-an-email' });
    expect(bad.status).toBe(400);
  });

  it('records changes in the audit trail', async () => {
    const res = await api.get('/api/audit');
    expect(res.body.some((a: { action: string }) => a.action === 'Settings updated')).toBe(true);
  });
});
