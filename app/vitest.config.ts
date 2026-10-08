import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'app',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
