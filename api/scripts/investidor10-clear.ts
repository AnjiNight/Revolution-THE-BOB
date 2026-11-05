/**
 * Apaga tudo o que veio do Investidor10 (SPEC-041 §4.1): indicadores, informações dos FIIs,
 * proventos e o registro das visitas. Para quando a autorização acabar (depois da apresentação),
 * junto com INVESTIDOR10_ENABLED=false.
 *
 * Uso: npm run investidor10:apagar --workspace api
 */
import { existsSync } from 'node:fs';
import { PrismaFundamentalsRepository } from '../src/modules/market-data/infrastructure/prisma-fundamentals-repository.js';
import { createPrismaClient } from '../src/shared/infrastructure/database.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória.');

  const prisma = createPrismaClient(databaseUrl);
  try {
    const removed = await new PrismaFundamentalsRepository(prisma).clear();
    console.log(`Dados do Investidor10 apagados: ${removed} linhas.`);
    if (process.env.INVESTIDOR10_ENABLED === 'true') {
      console.log(
        'Atenção: INVESTIDOR10_ENABLED ainda está true; a próxima coleta busca tudo de novo.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
