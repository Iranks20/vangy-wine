// Environment for the test run. The database is separate from the real one.
export const TEST_ENV = {
  NODE_ENV: 'test',
  DB_NAME: 'vangy_wine_test',
  // Optional: a Postgres server URL to test against (e.g. Neon); the database name is replaced by DB_NAME.
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
  JWT_SECRET: 'test-secret-test-secret-test-secret',
  ADMIN_USERNAME: 'director',
  ADMIN_PASSWORD: 'Test-Pass-123',
  ADMIN_NAME: 'Test Director',
  TZ: 'Africa/Kampala',
};
