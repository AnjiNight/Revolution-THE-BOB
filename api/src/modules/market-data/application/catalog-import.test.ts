import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import {
  FakeListSource,
  FakeLogoSource,
  FakeTradeScanner,
  InMemoryB3Trades,
  InMemoryCalendarRepository,
  InMemoryCatalogImport,
  InMemoryLogoRepository,
  InMemoryTaskRuns,
  listed,
  svgLogo,
  type CatalogRow,
} from '../testing/fakes.js';
import {
  CatalogImport,
  cleanName,
  GENERIC_LOGO_REPEATS,
  IMPORT_RETRY_DELAY_MS,
  recentWindowStart,
} from './catalog-import.js';

/** Terça, 3/11/2026, às 08:30 de Brasília. O pregão anterior foi sexta, 30/10 (2/11, Finados). */
const NOW = new Date('2026-11-03T08:30:00-03:00');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('importação do catálogo (SPEC-040)', () => {
  let now: Date;
  let rows: CatalogRow[];
  let audit: InMemoryAuditTrail;
  let source: FakeListSource;
  let trades: InMemoryB3Trades;
  let scanner: FakeTradeScanner;
  let logos: InMemoryLogoRepository;
  let logoSource: FakeLogoSource;
  let runs: InMemoryTaskRuns;
  let calendars: InMemoryCalendarRepository;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let importer: CatalogImport;
  let ids: number;

  const byTicker = (ticker: string) => rows.find((row) => row.ticker === ticker);

  /** Ativo que já está no catálogo. */
  const existing = (ticker: string, fields: Partial<CatalogRow> = {}): CatalogRow => {
    const row: CatalogRow = {
      id: `id-${ticker}`,
      ticker,
      name: `${ticker} da equipe`,
      assetClass: /11$/.test(ticker) ? 'fii' : 'stock',
      sector: 'outros',
      createdAt: new Date('2026-01-05T12:00:00Z'),
      updatedAt: new Date('2026-01-05T12:00:00Z'),
      deactivatedAt: null,
      origin: 'team',
      classificationReviewedAt: new Date('2026-01-05T12:00:00Z'),
      autoDeactivated: false,
      ...fields,
    };
    rows.push(row);
    return row;
  };

  beforeEach(async () => {
    now = NOW;
    rows = [];
    audit = new InMemoryAuditTrail();
    source = new FakeListSource(false);
    trades = new InMemoryB3Trades();
    scanner = new FakeTradeScanner(trades);
    logos = new InMemoryLogoRepository();
    logoSource = new FakeLogoSource();
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    ids = 0;
    importer = new CatalogImport({
      source,
      trades,
      scanner,
      catalog: new InMemoryCatalogImport(rows, audit),
      logos,
      logoSource,
      runs,
      calendars,
      clock: () => now,
      sleep,
      newId: () => `novo-${++ids}`,
    });
    for (const year of [2025, 2026]) {
      await calendars.publish(
        {
          year,
          publishedAt: new Date(),
          publishedBy: 'colab',
          nonTradingDays: suggestNonTradingDays(year),
        },
        () => ({
          at: new Date(),
          collaboratorId: 'colab',
          action: 'calendar_published',
          entity: 'calendar_year',
          entityId: String(year),
          details: {},
        }),
      );
    }
    audit.entries.length = 0;
    // B3 em dia: o último pregão lido é o de sexta.
    trades.traded('ITUB4', '2026-10-30');
  });

  describe('quem entra (CA01, CA02)', () => {
    it('ações, units e FIIs da lista com negócio na B3 nos últimos 3 meses, a revisar', async () => {
      source.answers.set('stock', [
        listed('PETR4', {
          name: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
          subsector: 'Exploração. Refino e Distribuição',
        }),
        listed('TAEE11', { subType: 'unit', subsector: 'Energia Elétrica' }),
        listed('OLDD3', { subsector: 'Bancos' }), // último negócio em julho
        listed('NOVO3'), // nunca apareceu nos arquivos da B3
      ]);
      source.answers.set('fii', [listed('MXRF11', { subsector: 'Logística' })]);
      trades
        .traded('PETR4', '2026-10-30')
        .traded('TAEE11', '2026-10-29', 'stock')
        .traded('MXRF11', '2026-08-03')
        .traded('OLDD3', '2026-08-02');

      const result = await importer.run();

      expect(result).toMatchObject({
        status: 'sucesso',
        records: 3,
        errors: [],
        totals: { created: 3, notRecent: 2, b3Behind: false },
      });
      expect(rows.map((row) => [row.ticker, row.assetClass, row.sector])).toEqual([
        ['PETR4', 'stock', 'petroleo_gas_biocombustiveis'],
        ['TAEE11', 'stock', 'utilidade_publica'],
        // A brapi erra o MXRF11 (é de papel): por isso tudo nasce a revisar.
        ['MXRF11', 'fii', 'logistica'],
      ]);
      expect(byTicker('PETR4')).toMatchObject({
        name: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        origin: 'import',
        classificationReviewedAt: null,
        createdAt: NOW,
      });
      expect(audit.entries[0]).toMatchObject({
        collaboratorId: null,
        action: 'asset_imported',
        entity: 'asset',
        entityId: byTicker('PETR4')?.id,
        details: {
          after: {
            ticker: 'PETR4',
            name: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
            class: 'stock',
            sector: 'petroleo_gas_biocombustiveis',
          },
        },
      });
      expect(runs.runs[0]?.task).toBe('importacao_catalogo');
    });

    it('subsetor desconhecido ou ausente vira Outros', async () => {
      source.answers.set('stock', [listed('ABCD3', { subsector: 'Algo Novo' }), listed('EFGH3')]);
      trades.traded('ABCD3', '2026-10-30').traded('EFGH3', '2026-10-30');
      await importer.run();
      expect(rows.map((row) => row.sector)).toEqual(['outros', 'outros']);
    });

    it('fora do formato da B3 e classe diferente entre as fontes não entram; o motivo fica', async () => {
      source.answers.set('stock', [
        listed('PETR4F'), // fracionário
        listed('XPTO11', { subType: 'unit' }), // a B3 diz que é FII
      ]);
      trades.traded('XPTO11', '2026-10-30', 'fii');
      const result = await importer.run();
      expect(rows).toEqual([]);
      expect(result).toMatchObject({
        status: 'parcial',
        totals: { created: 0, outOfFormat: 1, mismatched: 1 },
        errors: [
          {
            message: 'XPTO11: a brapi diz ação e a B3 diz FII; não entrou no catálogo',
          },
        ],
      });
    });

    it('nome sem espaços repetidos e com no máximo 100 caracteres', () => {
      expect(cleanName('  MAXI   RENDA\tFII  ')).toBe('MAXI RENDA FII');
      expect(cleanName('X'.repeat(99) + ' Y')).toBe('X'.repeat(99));
      expect(cleanName('A'.repeat(150))).toHaveLength(100);
    });

    it('janela de 3 meses: mesmo dia, ou o último do mês que não tem o dia', () => {
      expect(recentWindowStart('2026-11-03')).toBe('2026-08-03');
      expect(recentWindowStart('2026-05-31')).toBe('2026-02-28');
      expect(recentWindowStart('2026-02-10')).toBe('2025-11-10');
    });
  });

  describe('nunca desfaz o colaborador (CA03)', () => {
    it('não muda ticker, nome, classe nem setor de quem já existe', async () => {
      existing('PETR4', { name: 'Petrobras PN', sector: 'petroleo_gas_biocombustiveis' });
      source.answers.set('stock', [
        listed('PETR4', { name: 'PETROLEO BRASILEIRO', subsector: 'Bancos' }),
      ]);
      trades.traded('PETR4', '2026-10-30');
      const before = structuredClone(rows);
      expect(await importer.run()).toMatchObject({ status: 'sucesso', records: 0 });
      expect(rows).toEqual(before);
      expect(audit.entries).toEqual([]);
    });

    it('já rodou hoje: não faz nada; depois de uma falha, roda de novo', async () => {
      source.answers.set('stock', { error: 'bad_response' });
      expect(await importer.run()).toMatchObject({ status: 'falha' });

      source.answers.set('stock', [listed('PETR4')]);
      trades.traded('PETR4', '2026-10-30');
      expect(await importer.run()).toMatchObject({ status: 'sucesso', records: 1 });

      now = new Date(NOW.getTime() + 60 * 60 * 1000);
      expect(await importer.run()).toBeNull();
      expect(rows).toHaveLength(1);
      expect(audit.entries).toHaveLength(1);
    });
  });

  describe('quem sai e quem volta (CA04, CA05)', () => {
    it('sem negócio há 3 meses: desativado pelo processador, com a auditoria', async () => {
      const old = existing('OLDD3');
      trades.traded('OLDD3', '2026-07-15');
      const result = await importer.run();
      expect(result).toMatchObject({ status: 'sucesso', totals: { deactivated: 1 } });
      expect(old).toMatchObject({ deactivatedAt: NOW, autoDeactivated: true });
      expect(audit.entries).toEqual([
        expect.objectContaining({
          collaboratorId: null,
          action: 'asset_auto_deactivated',
          entityId: old.id,
          details: {
            before: { active: true },
            after: { active: false, lastTradedOn: '2026-07-15' },
          },
        }),
      ]);
    });

    it('com a B3 atrasada, ninguém é desativado', async () => {
      const old = existing('OLDD3');
      trades.trades.clear();
      trades.traded('OLDD3', '2026-07-15').traded('ITUB4', '2026-10-28');
      const result = await importer.run();
      expect(result).toMatchObject({
        status: 'parcial',
        totals: { deactivated: 0, b3Behind: true },
      });
      expect(old.deactivatedAt).toBeNull();
    });

    it('nunca negociado: só sai depois de 3 meses no catálogo (o IPO que vai estrear)', async () => {
      const ipo = existing('IPOO3', { createdAt: new Date('2026-10-01T12:00:00Z') });
      const ghost = existing('GHST3', { createdAt: new Date('2026-07-01T12:00:00Z') });
      await importer.run();
      expect(ipo.deactivatedAt).toBeNull();
      expect(ghost).toMatchObject({ deactivatedAt: NOW, autoDeactivated: true });
    });

    it('só volta sozinho quem o processador desativou', async () => {
      const auto = existing('AUTO3', {
        deactivatedAt: new Date('2026-09-01T12:00:00Z'),
        autoDeactivated: true,
      });
      const manual = existing('MANU3', { deactivatedAt: new Date('2026-09-01T12:00:00Z') });
      trades.traded('AUTO3', '2026-10-30').traded('MANU3', '2026-10-30');
      const result = await importer.run();
      expect(result).toMatchObject({ totals: { reactivated: 1 } });
      expect(auto).toMatchObject({ deactivatedAt: null, autoDeactivated: false });
      expect(manual.deactivatedAt).not.toBeNull();
      expect(audit.entries).toEqual([
        expect.objectContaining({
          action: 'asset_auto_reactivated',
          entityId: auto.id,
          collaboratorId: null,
        }),
      ]);
    });
  });

  describe('negócios da B3 (primeira importação)', () => {
    it('sem negócios guardados, lê os arquivos anuais da janela', async () => {
      trades.trades.clear();
      scanner.found = [{ ticker: 'PETR4', assetClass: 'stock', lastTradingDay: '2026-10-30' }];
      source.answers.set('stock', [listed('PETR4')]);
      expect(await importer.run()).toMatchObject({ status: 'sucesso', records: 1 });
      expect(scanner.calls).toEqual([[2026]]);
    });

    it('em fevereiro, a janela pega o ano anterior também', async () => {
      now = new Date('2026-02-10T08:30:00-03:00');
      trades.trades.clear();
      await importer.run();
      expect(scanner.calls).toEqual([[2025, 2026]]);
    });

    it('negócios recentes guardados: não lê arquivo nenhum', async () => {
      await importer.run();
      expect(scanner.calls).toEqual([]);
    });

    it('arquivo que não baixou vira erro, e a B3 fica atrasada', async () => {
      trades.trades.clear();
      scanner.problems = ['arquivo anual de 2026: B3 respondeu 503'];
      const result = await importer.run();
      expect(result).toMatchObject({
        status: 'parcial',
        totals: { b3Behind: true },
        errors: [{ message: 'arquivo anual de 2026: B3 respondeu 503' }],
      });
    });
  });

  describe('lista da brapi', () => {
    it('erro de rede: uma nova tentativa depois de 10 segundos', async () => {
      source.queue('stock', { error: 'unavailable' });
      source.answers.set('stock', [listed('PETR4')]);
      trades.traded('PETR4', '2026-10-30');
      expect(await importer.run()).toMatchObject({ status: 'sucesso', records: 1 });
      expect(sleep).toHaveBeenCalledWith(IMPORT_RETRY_DELAY_MS);
    });

    it('uma das listas falha: nada muda no catálogo', async () => {
      const old = existing('OLDD3');
      trades.traded('OLDD3', '2026-07-15');
      source.answers.set('stock', [listed('PETR4')]);
      source.answers.set('fii', { error: 'rate_limited' });
      const result = await importer.run();
      expect(result).toMatchObject({ status: 'falha', records: 0 });
      expect(result?.errors[0]?.message).toContain('lista de FIIs da brapi');
      expect(rows).toEqual([old]);
      expect(old.deactivatedAt).toBeNull();
    });
  });

  describe('logos (CA07)', () => {
    beforeEach(() => {
      source.answers.set('stock', [
        listed('PETR4'),
        listed('SEML3', { logoUrl: 'https://icons.brapi.dev/icons/BRAPI.svg' }),
        listed('ERRO3', { logoUrl: 'https://icons.brapi.dev/icons/ERRO3.svg' }),
      ]);
      trades
        .traded('PETR4', '2026-10-30')
        .traded('SEML3', '2026-10-30')
        .traded('ERRO3', '2026-10-30');
      logoSource.failing.add('https://icons.brapi.dev/icons/ERRO3.svg');
    });

    it('baixa o logo dos ativos; o genérico vira "sem logo"; a falha não para nada', async () => {
      const result = await importer.run();
      const petr4 = byTicker('PETR4')?.id ?? '';
      expect(await logos.find(petr4)).toEqual(svgLogo('https://icons.brapi.dev/icons/PETR4.svg'));
      expect(logos.logos.get(byTicker('SEML3')?.id ?? '')).toMatchObject({ status: 'sem_logo' });
      expect(logos.logos.has(byTicker('ERRO3')?.id ?? '')).toBe(false);
      expect(logoSource.requests).not.toContain('https://icons.brapi.dev/icons/BRAPI.svg');
      expect(result).toMatchObject({
        status: 'parcial',
        records: 3,
        totals: { logosSaved: 1, logosMissing: 1, logoErrors: 1 },
        errors: [
          {
            assetId: byTicker('ERRO3')?.id,
            message: expect.stringContaining('ERRO3: logo respondeu 404') as string,
          },
        ],
      });
    });

    it(`a mesma imagem em ${GENERIC_LOGO_REPEATS} tickers é genérica`, async () => {
      const tickers = ['AAAA3', 'BBBB3', 'CCCC3', 'DDDD3', 'EEEE3'];
      source.answers.set(
        'stock',
        tickers.map((ticker) => listed(ticker)),
      );
      for (const ticker of tickers) {
        trades.traded(ticker, '2026-10-30');
        logoSource.images.set(`https://icons.brapi.dev/icons/${ticker}.svg`, svgLogo('igual'));
      }
      await importer.run();
      expect(await logos.withLogo()).toEqual(new Set());
      expect([...logos.logos.values()].every((logo) => logo.status === 'sem_logo')).toBe(true);
    });

    it('baixa de novo depois de 30 dias; antes disso, não', async () => {
      await importer.run();
      expect(logoSource.requests).toHaveLength(2);

      now = new Date(NOW.getTime() + 10 * DAY_MS);
      await importer.run();
      // Só o que falhou é tentado de novo.
      expect(logoSource.requests).toHaveLength(3);

      now = new Date(NOW.getTime() + 31 * DAY_MS);
      for (const ticker of ['PETR4', 'SEML3', 'ERRO3']) trades.traded(ticker, '2026-12-03');
      trades.traded('ITUB4', '2026-12-03');
      await importer.run();
      expect(logoSource.requests).toHaveLength(5);
    });

    it('ativo desativado não ganha logo', async () => {
      existing('DESA3', { deactivatedAt: new Date('2026-10-01T12:00:00Z') });
      source.answers.set('stock', [listed('DESA3')]);
      await importer.run();
      expect(logoSource.requests).toEqual([]);
    });
  });

  describe('situação para o colaborador (CA10)', () => {
    it('totais da última importação e o último negócio de cada ticker', async () => {
      existing('OLDD3');
      trades.traded('OLDD3', '2026-07-15').traded('PETR4', '2026-10-30');
      source.answers.set('stock', [listed('PETR4')]);
      await importer.run();
      expect(await importer.status()).toEqual({
        lastRunAt: NOW.toISOString(),
        lastStatus: 'sucesso',
        created: 1,
        deactivated: 1,
        reactivated: 0,
        b3Behind: false,
      });
      expect((await importer.lastTradingDays()).get('OLDD3')).toBe('2026-07-15');
    });

    it('antes da primeira importação', async () => {
      expect(await importer.status()).toEqual({
        lastRunAt: null,
        lastStatus: null,
        created: 0,
        deactivated: 0,
        reactivated: 0,
        b3Behind: false,
      });
    });
  });
});
