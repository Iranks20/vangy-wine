import { defineConfig } from 'tsup';

// Bundles the server (and the ../shared code it imports) into dist/index.js.
export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
});
