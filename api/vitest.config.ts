import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
