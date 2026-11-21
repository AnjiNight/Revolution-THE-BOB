import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { AssetCatalogService } from '../../asset-catalog/application/asset-catalog-service.js';
import { PrismaAssetRepository } from '../../asset-catalog/infrastructure/prisma-asset-repository.js';
import { PrismaAuditTrail } from '../../audit/infrastructure/prisma-audit.js';
import { CatalogImport } from '../application/catalog-import.js';
import { HistoryIngestion } from '../application/history-ingestion.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import type { CotahistLineFields } from '../testing/cotahist-fixtures.js';
import {
  FakeCotahistSource,
  FakeListSource,
  FakeLogoSource,
  listed,
  svgLogo,
} from '../testing/fakes.js';
import { PrismaB3TradeRepository } from './prisma-b3-trade-repository.js';
import { PrismaCalendarRepository } from './prisma-calendar-repository.js';
import { PrismaCatalogImportRepository } from './prisma-catalog-import-repository.js';
import { PrismaLogoRepository } from './prisma-logo-repository.js';
import { PrismaQuoteRepository, PrismaTaskRunRepository } from './prisma-quote-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-040: CA01, CA03, CA04, CA05, CA07, CA10, CA12). Rodam só com
 * TEST_DATABASE_URL apontando para um banco com as migrações aplicadas. ATENÇÃO: apagam o catálogo,
 * os negócios da B3, os logos, o calendário e as execuções desse banco. O registro de auditoria
 * não é apagado (só aceita inclusões): os testes leem pelos ids dos ativos criados aqui.
 */
const url = process.env.TEST_DATABASE_URL;

/** Terça, 3/11/2026, 08:30 em Brasília. */
const NOW = new Date('2026-11-03T08:30:00-03:00');

describe.skipIf(!url)('catálogo completo da B3 no PostgreSQL (SPEC-040)', () => {
  let prisma: PrismaClient;
  let imports: PrismaCatalogImportRepository;
  let trades: PrismaB3TradeRepository;
  let logos: PrismaLogoRepository;
  let assets: PrismaAssetRepository;
  let runs: PrismaTaskRunRepository;
  let calendars: PrismaCalendarRepository;
  let auditTrail: PrismaAuditTrail;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    imports = new PrismaCatalogImportRepository(prisma);
    trades = new PrismaB3TradeRepository(prisma);
    logos = new PrismaLogoRepository(prisma);
    assets = new PrismaAssetRepository(prisma);
    runs = new PrismaTaskRunRepository(prisma);
    calendars = new PrismaCalendarRepository(prisma);
    auditTrail = new PrismaAuditTrail(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE ativo, negociacao_b3, logo_ativo, execucao_tarefa, ano_calendario CASCADE',
    );
  });

  /** Ativo cadastrado pela equipe, direto no banco. */
  const teamAsset = async (ticker: string, fields: Record<string, unknown> = {}) => {
    const row = await prisma.ativo.create({
      data: {
        ticker,
        nome: `${ticker} da equipe`,
        classe: /11$/.test(ticker) ? 'fii' : 'acao',
        setor: 'outros',
        atualizadoEm: NOW,
        criadoEm: new Date('2026-01-05T12:00:00Z'),
        ...fields,
      },
    });
    return row.id;
  };

  describe('restrições do banco (CA12)', () => {
    it('ativo da equipe nasce conferido; só o importado fica a revisar', async () => {
      const id = await teamAsset('PETR4');
      expect(
        (await prisma.ativo.findUniqueOrThrow({ where: { id } })).classificacaoConferidaEm,
      ).not.toBeNull();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO ativo (ticker, nome, classe, setor, atualizado_em, classificacao_conferida_em)
           VALUES ('VALE3', 'Vale', 'acao', 'outros', now(), NULL)`,
        ),
      ).rejects.toThrow(/ativo_classificacao_equipe_chk/);
      await prisma.$executeRawUnsafe(
        `INSERT INTO ativo (ticker, nome, classe, setor, atualizado_em, origem, classificacao_conferida_em)
         VALUES ('VALE3', 'Vale', 'acao', 'outros', now(), 'importacao', NULL)`,
      );
    });

    it('desativado automaticamente só se estiver desativado', async () => {
      const id = await teamAsset('PETR4');
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE ativo SET desativado_automaticamente = true WHERE id = '${id}'`,
        ),
      ).rejects.toThrow(/ativo_desativado_automaticamente_chk/);
    });

    it('negócio da B3: ticker no formato e nunca em fim de semana', async () => {
      await expect(
        trades.record(
          [{ ticker: 'PETR4F', assetClass: 'stock', lastTradingDay: '2026-10-30' }],
          NOW,
        ),
      ).rejects.toThrow(/negociacao_b3_ticker_formato_chk/);
      await expect(
        trades.record(
          [{ ticker: 'PETR4', assetClass: 'stock', lastTradingDay: '2026-10-31' }],
          NOW,
        ),
      ).rejects.toThrow(/negociacao_b3_dia_util_chk/);
    });

    it('logo: imagem aceita, com conteúdo de até 100 KB; "sem logo" sem conteúdo', async () => {
      const id = await teamAsset('PETR4');
      const insert = (situacao: string, tipo: string | null, bytes: number | null) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO logo_ativo (ativo_id, situacao, tipo, conteudo, resumo, baixado_em)
           VALUES ('${id}', '${situacao}', ${tipo ? `'${tipo}'` : 'NULL'},
                   ${bytes === null ? 'NULL' : `decode(repeat('ab', ${bytes}), 'hex')`},
                   ${situacao === 'ok' ? "'abc'" : 'NULL'}, now())`,
        );
      await expect(insert('ok', 'image/svg+xml', null)).rejects.toThrow(/logo_ativo_conteudo_chk/);
      await expect(insert('ok', 'text/html', 10)).rejects.toThrow(/logo_ativo_conteudo_chk/);
      await expect(insert('ok', 'image/png', 102_401)).rejects.toThrow(/logo_ativo_conteudo_chk/);
      await expect(insert('sem_logo', null, 10)).rejects.toThrow(/logo_ativo_conteudo_chk/);
      await insert('ok', 'image/png', 102_400);
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM ativo WHERE id = '${id}'`),
      ).rejects.toThrow(/logo_ativo_ativo_id_fkey/);
    });

    it('auditoria sem colaborador só nas ações do processador, e continua só aceitando inclusão', async () => {
      const id = randomUUID();
      const insert = (acao: string) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO registro_auditoria (ocorrido_em, colaborador_id, acao, entidade, entidade_id, detalhes)
           VALUES (now(), NULL, '${acao}', 'ativo', '${id}', '{}')`,
        );
      await expect(insert('ativo_editado')).rejects.toThrow(/registro_auditoria_colaborador_chk/);
      await expect(insert('classificacao_conferida')).rejects.toThrow(
        /registro_auditoria_colaborador_chk/,
      );
      await insert('ativo_importado');
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE registro_auditoria SET detalhes = '{"x":1}' WHERE entidade_id = '${id}'`,
        ),
      ).rejects.toThrow(/só aceita inclusões/);
    });
  });

  describe('repositórios', () => {
    it('negócios: a data só avança, e a classe segue o negócio mais recente', async () => {
      await trades.record(
        [
          { ticker: 'PETR4', assetClass: 'stock', lastTradingDay: '2026-10-29' },
          { ticker: 'XPTO11', assetClass: 'stock', lastTradingDay: '2026-10-28' },
        ],
        NOW,
      );
      await trades.record(
        [
          { ticker: 'PETR4', assetClass: 'stock', lastTradingDay: '2026-01-02' }, // arquivo antigo
          { ticker: 'XPTO11', assetClass: 'fii', lastTradingDay: '2026-10-30' },
        ],
        NOW,
      );
      expect(await trades.all()).toEqual(
        new Map([
          // SPEC-042: sem ISIN nos negócios gravados, a coluna fica vazia.
          [
            'PETR4',
            { ticker: 'PETR4', assetClass: 'stock', lastTradingDay: '2026-10-29', isin: null },
          ],
          [
            'XPTO11',
            { ticker: 'XPTO11', assetClass: 'fii', lastTradingDay: '2026-10-30', isin: null },
          ],
        ]),
      );
    });

    it('negócios: grava em lotes, com mais de mil tickers de uma vez', async () => {
      const letter = (n: number) => String.fromCharCode(65 + (n % 26));
      const many = Array.from({ length: 1_500 }, (_, i) => ({
        ticker: `A${letter(Math.floor(i / 676))}${letter(Math.floor(i / 26))}${letter(i)}3`,
        assetClass: 'stock' as const,
        lastTradingDay: '2026-10-30',
      }));
      await trades.record(many, NOW);
      expect((await trades.all()).size).toBe(1_500);
    });

    it('importação: cria a revisar, com a auditoria sem colaborador; ticker existente é pulado', async () => {
      await teamAsset('PETR4');
      const created = await imports.createImported(
        [
          {
            id: randomUUID(),
            ticker: 'PETR4',
            name: 'Outro',
            assetClass: 'stock',
            sector: 'financeiro',
          },
          {
            id: randomUUID(),
            ticker: 'MXRF11',
            name: 'Maxi Renda',
            assetClass: 'fii',
            sector: 'logistica',
          },
        ],
        NOW,
      );
      expect(created.map((asset) => asset.ticker)).toEqual(['MXRF11']);
      const mxrf = await assets.findById(created[0]?.id ?? '');
      expect(mxrf).toMatchObject({
        name: 'Maxi Renda',
        sector: 'logistica',
        origin: 'import',
        classificationReviewedAt: null,
        autoDeactivated: false,
        createdAt: NOW,
      });
      expect(await auditTrail.forEntity('asset', created[0]?.id ?? '')).toEqual([
        expect.objectContaining({
          collaboratorId: null,
          action: 'asset_imported',
          details: {
            after: { ticker: 'MXRF11', name: 'Maxi Renda', class: 'fii', sector: 'logistica' },
          },
        }),
      ]);
      expect(await assets.countPendingReview()).toBe(1);
      expect(
        (await assets.list({ status: 'all', pendingReview: true })).map((a) => a.ticker),
      ).toEqual(['MXRF11']);
    });

    it('desativação automática só de quem está ativo; reativação só de quem o processador desativou', async () => {
      const active = await teamAsset('OLDD3');
      const manual = await teamAsset('MANU3', { desativadoEm: new Date('2026-09-01T12:00:00Z') });
      expect(
        await imports.autoDeactivate(
          [
            { id: active, lastTradedOn: '2026-07-15' },
            { id: manual, lastTradedOn: null },
          ],
          NOW,
        ),
      ).toBe(1);
      expect(await assets.findById(active)).toMatchObject({
        deactivatedAt: NOW,
        autoDeactivated: true,
      });
      expect(
        await imports.autoReactivate(
          [
            { id: active, lastTradedOn: '2026-10-30' },
            { id: manual, lastTradedOn: '2026-10-30' },
          ],
          NOW,
        ),
      ).toBe(1);
      expect(await assets.findById(active)).toMatchObject({
        deactivatedAt: null,
        autoDeactivated: false,
      });
      expect((await assets.findById(manual))?.deactivatedAt).not.toBeNull();
      expect((await auditTrail.forEntity('asset', active)).map((entry) => entry.action)).toEqual([
        'asset_auto_deactivated',
        'asset_auto_reactivated',
      ]);
      expect((await auditTrail.forEntity('asset', active))[0]?.details).toEqual({
        before: { active: true },
        after: { active: false, lastTradedOn: '2026-07-15' },
      });
    });

    it('logos: grava, troca, entrega os bytes e diz quem tem', async () => {
      const petr = await teamAsset('PETR4');
      const vale = await teamAsset('VALE3');
      const image = svgLogo('PETR4');
      await logos.save(
        [
          { assetId: petr, status: 'ok', image, hash: 'h1' },
          { assetId: vale, status: 'sem_logo' },
        ],
        NOW,
      );
      expect(await logos.find(petr)).toEqual(image);
      expect(await logos.find(vale)).toBeNull();
      expect(await logos.withLogo()).toEqual(new Set([petr]));
      const later = new Date(NOW.getTime() + 1000);
      await logos.save([{ assetId: petr, status: 'sem_logo' }], later);
      expect(await logos.find(petr)).toBeNull();
      expect((await logos.downloadedAt()).get(petr)).toEqual(later);
    });

    it('execução guarda os totais; volume do último pregão vem só da B3', async () => {
      const id = await runs.start('importacao_catalogo', NOW);
      await runs.finish(
        id,
        {
          status: 'sucesso',
          records: 1,
          affectedAssets: 1,
          periodStart: null,
          periodEnd: null,
          errors: [],
          totals: { created: 1, b3Behind: false, missingTickers: ['X'] },
        },
        NOW,
      );
      expect((await runs.lastRun('importacao_catalogo'))?.totals).toEqual({
        created: 1,
        b3Behind: false,
        missingTickers: ['X'],
      });

      const petr = await teamAsset('PETR4');
      const quotes = new PrismaQuoteRepository(prisma);
      const day = (date: string, volume: string) => ({
        assetId: petr,
        date,
        open: '10',
        high: '10',
        low: '10',
        close: '10',
        average: '10',
        trades: 1,
        volume,
      });
      await quotes.save([day('2026-10-29', '100.00'), day('2026-10-30', '250.50')], 'b3_cotahist');
      expect(await quotes.lastVolumes()).toEqual(new Map([[petr, '250.50']]));
    });
  });

  it('importação de ponta a ponta: do arquivo da B3 e da lista da brapi até a tela do colaborador', async () => {
    await calendars.publish(
      {
        year: 2026,
        publishedAt: NOW,
        publishedBy: randomUUID(),
        nonTradingDays: suggestNonTradingDays(2026),
      },
      () => ({
        at: NOW,
        collaboratorId: randomUUID(),
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: '2026',
        details: {},
      }),
    );
    const oldId = await teamAsset('OLDD3');
    // Arquivo anual de 2026 da B3 (lido pela SPEC-008): quem negociou e quando.
    const line = (ticker: string, date: string, codbdi = '02'): CotahistLineFields => ({
      ticker,
      date: date.replaceAll('-', ''),
      codbdi,
      open: 1000,
      high: 1010,
      low: 990,
      average: 1000,
      close: 1000,
    });
    const b3 = new FakeCotahistSource();
    b3.annualFiles.set(2026, [
      line('PETR4', '2026-10-30'),
      line('MXRF11', '2026-10-30', '12'),
      line('OLDD3', '2026-07-15'),
    ]);
    const clock = () => NOW;
    const history = new HistoryIngestion({
      source: b3,
      quotes: new PrismaQuoteRepository(prisma),
      runs,
      calendars,
      trades,
      clock,
      sleep: () => Promise.resolve(),
    });
    const brapi = new FakeListSource(false);
    brapi.answers.set('stock', [
      listed('PETR4', { subsector: 'Exploração, Refino e Distribuição' }),
    ]);
    brapi.answers.set('fii', [
      listed('MXRF11', {
        subsector: 'Logística',
        logoUrl: 'https://icons.brapi.dev/icons/BRAPI.svg',
      }),
    ]);
    const logoSource = new FakeLogoSource();
    const importer = new CatalogImport({
      source: brapi,
      trades,
      scanner: history,
      catalog: imports,
      logos,
      logoSource,
      runs,
      calendars,
      clock,
      sleep: () => Promise.resolve(),
    });

    expect(await importer.run()).toMatchObject({
      status: 'sucesso',
      records: 3,
      totals: { created: 2, deactivated: 1, logosSaved: 1, logosMissing: 1, b3Behind: false },
    });
    expect(b3.requests).toEqual(['A2026*']);
    expect(await importer.run()).toBeNull(); // já rodou hoje

    const catalog = new AssetCatalogService({ assets, logos, imports: importer, clock });
    const list = await catalog.catalog({ q: '', status: 'all' });
    expect(list).toMatchObject({ activeCount: 2, pendingReviewCount: 2, hasMore: false });
    expect(list.catalogImport).toMatchObject({ lastStatus: 'sucesso', created: 2, deactivated: 1 });
    expect(
      list.assets.map((a) => [a.ticker, a.sector, a.hasLogo, a.active, a.lastTradedOn]),
    ).toEqual([
      ['MXRF11', 'logistica', false, true, '2026-10-30'],
      ['OLDD3', 'outros', false, false, '2026-07-15'],
      ['PETR4', 'petroleo_gas_biocombustiveis', true, true, '2026-10-30'],
    ]);
    expect((await assets.findById(oldId))?.autoDeactivated).toBe(true);
    const run = await prisma.execucaoTarefa.findFirstOrThrow({
      where: { tarefa: 'importacao_catalogo' },
    });
    expect(run).toMatchObject({ situacao: 'sucesso', registros: 3 });
  });
});
