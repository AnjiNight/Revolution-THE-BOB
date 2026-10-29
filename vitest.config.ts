import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'api', 'api/vitest.db.config.ts', 'app'],
  },
});
