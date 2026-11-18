import { describe, expect, it } from 'vitest';
import { createPrismaClient } from './database.js';

/**
 * Contra PostgreSQL real, com TEST_DATABASE_URL. A URL vai sem a opção de fuso: a conexão tem que
 * ficar em UTC mesmo num servidor em America/Sao_Paulo (o PostgreSQL instalado no Windows).
 */
const url = process.env.TEST_DATABASE_URL?.replace(/[?&]options=[^&]*/, '');

describe.skipIf(!url)('conexão com o banco', () => {
  it('a sessão fica em UTC e os horários são lidos sem deslocamento', async () => {
    const prisma = createPrismaClient(url as string);
    try {
      const [setting] = await prisma.$queryRaw<Array<{ tz: string }>>`
        SELECT current_setting('TimeZone') AS tz`;
      expect(setting?.tz).toBe('UTC');
      const [row] = await prisma.$queryRaw<Array<{ at: Date }>>`
        SELECT timestamptz '2026-11-01 19:07:52-03' AS at`;
      expect(row?.at.toISOString()).toBe('2026-11-01T22:07:52.000Z');
    } finally {
      await prisma.$disconnect();
    }
  });
});
