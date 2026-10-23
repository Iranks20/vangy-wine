import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/env';

// Tests run one file at a time against vangy_wine_test, which is rebuilt on every run.
export default defineConfig({
  test: {
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: TEST_ENV,
  },
});
