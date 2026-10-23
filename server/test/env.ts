// Environment for the test run. The database is separate from the real one.
export const TEST_ENV = {
  NODE_ENV: 'test',
  DB_NAME: 'vangy_wine_test',
  DATABASE_URL: '',
  MYSQL_URL: '',
  JWT_SECRET: 'test-secret-test-secret-test-secret',
  ADMIN_USERNAME: 'director',
  ADMIN_PASSWORD: 'Test-Pass-123',
  ADMIN_NAME: 'Test Director',
  TZ: 'Africa/Kampala',
};
