import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * A sessão sempre em UTC: com outro fuso no servidor (o PostgreSQL instalado no Windows vem com
 * America/Sao_Paulo), o adaptador lê os `timestamptz` com 3 horas a menos.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, options: '-c TimeZone=UTC' }),
  });
}

export type { PrismaClient };
