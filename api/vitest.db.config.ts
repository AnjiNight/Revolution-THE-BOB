import { defineProject } from 'vitest/config';

/**
 * Testes contra o PostgreSQL real (TEST_DATABASE_URL). Um arquivo por vez: eles limpam tabelas que
 * os outros usam (o histórico de cotações da SPEC-008 aponta para o catálogo de ativos).
 */
export default defineProject({
  test: {
    name: 'api-db',
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
