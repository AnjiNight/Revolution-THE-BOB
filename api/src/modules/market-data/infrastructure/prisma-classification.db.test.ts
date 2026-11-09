import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaClassificationRepository } from './prisma-classification-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-021, CA05 e CA08). Rodam só com TEST_DATABASE_URL apontando
 * para um banco com as migrações aplicadas. ATENÇÃO: apagam a classificação da B3 desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('classificação setorial no PostgreSQL', () => {
  let prisma: PrismaClient;
  let repo: PrismaClassificationRepository;
  const at = new Date('2026-11-09T07:00:00Z');
  let stockId: string;
  let fiiId: string;
  let reviewedId: string;

  /** Ticker que não existe no banco ("Q" + 3 dígitos + o final da classe). */
  const ticker = (end: string) => `Q${randomUUID().replace(/\D/g, '').slice(0, 3)}${end}`;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    repo = new PrismaClassificationRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE classificacao_b3');
    const asset = (classe: 'acao' | 'fii', setor: string, reviewed: boolean) =>
      prisma.ativo.create({
        data: {
          ticker: ticker(classe === 'fii' ? '11' : '3'),
          nome: 'Teste',
          classe,
          setor,
          atualizadoEm: at,
          // Só o importado pode ficar a revisar (regra do banco, SPEC-040).
          origem: 'importacao',
          classificacaoConferidaEm: reviewed ? at : null,
        },
      });
    stockId = (await asset('acao', 'outros', false)).id;
    fiiId = (await asset('fii', 'logistica', false)).id;
    reviewedId = (await asset('acao', 'outros', true)).id;
    await prisma.informacaoFii.create({
      data: {
        ativoId: fiiId,
        tipoFundo: 'Fundo de Papel',
        segmento: 'Híbrido',
        coletadoEm: at,
      },
    });
  });

  it('guarda a classificação da B3 por empresa e lê de volta; guardar de novo substitui', async () => {
    const row = {
      code: 'ALPA',
      codeCvm: '10456',
      sector: 'Consumo Cíclico',
      subsector: 'Tecidos. Vestuário e Calçados',
      segment: 'Calçados',
      collectedAt: at,
    };
    await repo.saveB3Classification(row);
    await repo.saveB3Classification({ ...row, segment: 'Calçados e Acessórios' });
    expect(await repo.b3Classifications()).toEqual(
      new Map([['ALPA', { ...row, segment: 'Calçados e Acessórios' }]]),
    );
  });

  it('lista só os a revisar, com o tipo e o segmento do Investidor10 nos FIIs', async () => {
    const mine = (await repo.unreviewed()).filter((asset) =>
      [stockId, fiiId, reviewedId].includes(asset.id),
    );
    expect(mine.map(({ ticker: _ticker, ...asset }) => asset)).toEqual(
      expect.arrayContaining([
        {
          id: stockId,
          assetClass: 'stock',
          sector: 'outros',
          fundType: null,
          fundSegment: null,
        },
        {
          id: fiiId,
          assetClass: 'fii',
          sector: 'logistica',
          fundType: 'Fundo de Papel',
          fundSegment: 'Híbrido',
        },
      ]),
    );
    expect(mine).toHaveLength(2);
  });

  it('troca o setor só do que continua a revisar e com o setor de antes, com a auditoria (CA05)', async () => {
    const change = {
      assetId: stockId,
      ticker: 'ALPA4',
      from: 'outros' as const,
      to: 'consumo_ciclico' as const,
      source: 'b3' as const,
    };
    expect(await repo.suggest([change], at)).toBe(1);
    // De novo: o setor já não é o de antes.
    expect(await repo.suggest([change], at)).toBe(0);
    // Conferido pela equipe: nunca muda.
    expect(await repo.suggest([{ ...change, assetId: reviewedId }], at)).toBe(0);

    const stored = await prisma.ativo.findUniqueOrThrow({ where: { id: stockId } });
    expect(stored.setor).toBe('consumo_ciclico');
    expect(stored.classificacaoConferidaEm).toBeNull();
    const audit = await prisma.registroAuditoria.findMany({ where: { entidadeId: stockId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      acao: 'classificacao_sugerida',
      colaboradorId: null,
      entidade: 'ativo',
      detalhes: {
        before: { sector: 'outros' },
        after: { sector: 'consumo_ciclico', source: 'b3' },
      },
    });
  });
});
