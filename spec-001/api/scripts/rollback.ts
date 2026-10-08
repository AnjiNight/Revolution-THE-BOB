/**
 * Desfaz a última migração aplicada (RNF17, SPEC-001 §4):
 * executa o down.sql dela e remove o registro de _prisma_migrations, na mesma transação.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { MIGRATIONS_DIR, dirPath } from './migrations.js';

async function rollback(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória.');

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY finished_at DESC, migration_name DESC
        LIMIT 1`,
    );
    const last = result.rows[0]?.migration_name;
    if (!last) {
      console.log('Nenhuma migração aplicada para desfazer.');
      return;
    }

    const downFile = join(dirPath(MIGRATIONS_DIR), last, 'down.sql');
    if (!existsSync(downFile)) throw new Error(`A migração ${last} não tem down.sql.`);

    await client.query('BEGIN');
    try {
      await client.query(readFileSync(downFile, 'utf8'));
      await client.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [last]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log(`Migração desfeita: ${last}`);
  } finally {
    await client.end();
  }
}

rollback().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
