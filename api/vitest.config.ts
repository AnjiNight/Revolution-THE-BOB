import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Os testes contra o PostgreSQL ficam no projeto "api-db" (vitest.db.config.ts).
    exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
    environment: 'node',
  },
});
