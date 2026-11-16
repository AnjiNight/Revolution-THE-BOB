import {
  PORTFOLIO_PATHS,
  portfolioSubPath,
  type AuthSession,
  type PortfolioComparison,
  type PortfolioPerformance,
  type PortfolioPositions,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '55555555-5555-4555-8555-555555555555';
const OTHER = '99999999-9999-4999-8999-999999999999';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília: o Ibovespa de hoje ainda não saiu. */
let now = new Date('2026-11-06T15:00:00Z');

describe('comparação de carteiras (SPEC-022)', () => {
  let t: TestApp;
  let ana: AuthSession;
  /** A: histórica desde 03/11, R$ 10.000,00, 100 PETR4 em 04/11. */
  let a: string;
  /** B: histórica desde 04/11, R$ 5.000,00, 100 MXRF11 em 05/11. */
  let b: string;

  beforeEach(async () => {
    now = new Date('2026-11-06T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    await t.calendar.publish(2026, { nonTradingDays: suggestNonTradingDays(2026) }, 'colab');
    ana = await t.registerConfirmed();
    t.market.assets.set(PETR4, {
      id: PETR4,
      ticker: 'PETR4',
      name: 'Petrobras PN',
      assetClass: 'stock',
      active: true,
      sector: 'petroleo_gas_biocombustiveis',
    });
    t.market.assets.set(MXRF11, {
      id: MXRF11,
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      assetClass: 'fii',
      active: true,
      sector: 'hibrido',
    });
    t.market.dailyCloses.set(
      PETR4,
      new Map([
        ['2026-11-04', '25.00'],
        ['2026-11-05', '26.00'],
      ]),
    );
    t.market.dailyCloses.set(MXRF11, new Map([['2026-11-05', '10.00']]));
    const quote = (price: string) => ({
      price,
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free' as const,
      source: 'brapi' as const,
    });
    t.market.quotes.set(PETR4, quote('26.50'));
    t.market.quotes.set(MXRF11, quote('10.50'));
    for (const day of ['2026-11-03', '2026-11-04', '2026-11-05']) t.market.cdi.set(day, '0.050000');
    t.market.indexes.set(
      'IBOV',
      new Map([
        ['2026-10-30', '149000.00'],
        ['2026-11-03', '150000.00'],
        ['2026-11-04', '151500.00'],
        ['2026-11-05', '153000.00'],
      ]),
    );
    t.market.indexes.set(
      'IFIX',
      new Map([
        ['2026-11-03', '3500.00'],
        ['2026-11-04', '3510.00'],
        ['2026-11-05', '3535.00'],
      ]),
    );
    a = await newPortfolio({
      name: 'Petróleo',
      type: 'historical',
      startDate: '2026-11-03',
      initialAmount: '10000',
    });
    await trade(a, { type: 'buy', assetId: PETR4, quantity: 100, date: '2026-11-04' });
    b = await newPortfolio({
      name: 'FIIs',
      type: 'historical',
      startDate: '2026-11-04',
      initialAmount: '5000',
    });
    await trade(b, { type: 'buy', assetId: MXRF11, quantity: 100, date: '2026-11-05' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await t.app.close();
  });

  const call = (url: string, session = ana, method: 'GET' | 'POST' = 'GET', payload?: object) =>
    t.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${session.accessToken}` },
      ...(payload ? { payload } : {}),
    });

  async function newPortfolio(payload: Record<string, unknown>, session = ana) {
    const response = await call(PORTFOLIO_PATHS.list, session, 'POST', payload);
    return response.json<{ portfolio: { id: string } }>().portfolio.id;
  }

  function trade(id: string, payload: Record<string, unknown>) {
    now = new Date(now.getTime() + 1000);
    return call(portfolioSubPath(PORTFOLIO_PATHS.trades, id), ana, 'POST', payload);
  }

  const compare = (query: string) => call(`${PORTFOLIO_PATHS.comparison}?${query}`);
  const comparison = async (query: string) => {
    const response = await compare(query);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PortfolioComparison>();
  };

  it('"Em comum": desde o início da mais nova; cada uma com os números da tela dela (CA02, CA03)', async () => {
    const body = await comparison(`ids=${b},${a}`);
    expect(body).toMatchObject({ from: '2026-11-04', to: '2026-11-06', weekly: false });
    // Na ordem pedida.
    expect(body.portfolios.map((item) => [item.id, item.name, item.type])).toEqual([
      [b, 'FIIs', 'historical'],
      [a, 'Petróleo', 'historical'],
    ]);
    // A já tinha patrimônio em 03/11: as referências contam desde o fechamento dele.
    expect(body.baseDate).toBe('2026-11-03');

    for (const item of body.portfolios) {
      const own = (
        await call(
          `${portfolioSubPath(PORTFOLIO_PATHS.performance, item.id)}?from=2026-11-04&to=2026-11-06`,
        )
      ).json<PortfolioPerformance>();
      expect(item.performance).toEqual({
        from: own.from,
        startValue: own.startValue,
        endValue: own.endValue,
        netFlows: own.netFlows,
        result: own.result,
        return: own.return,
        cdiShare: own.cdiShare,
        empty: false,
        warnings: own.warnings,
        series: own.series.map((point) => ({ date: point.date, return: point.return })),
      });
      const positions = (
        await call(portfolioSubPath(PORTFOLIO_PATHS.positions, item.id))
      ).json<PortfolioPositions>();
      expect(item.allocation).toEqual(positions.allocation);
    }
    // A: 10.000 → 10.150 (PETR4 a R$ 26,50); B: 5.000 → 5.050 (MXRF11 a R$ 10,50).
    expect(
      body.portfolios.map((item) => [item.performance.return, item.performance.result]),
    ).toEqual([
      ['1.00', '50.00'],
      ['1.50', '150.00'],
    ]);
  });

  it('referências uma vez, do mesmo dia-base; IFIX porque B teve FII (CA02)', async () => {
    const body = await comparison(`ids=${a},${b}`);
    expect(body.benchmarks).toEqual([
      { code: 'cdi', return: '0.15', until: '2026-11-06', source: 'bcb' },
      { code: 'ibov', return: '2.00', until: '2026-11-05', source: 'b3' },
      { code: 'ifix', return: '1.00', until: '2026-11-05', source: 'b3' },
    ]);
    expect(body.benchmarkSeries).toEqual([
      { date: '2026-11-04', benchmarks: { cdi: '0.05', ibov: '1.00', ifix: '0.29' } },
      { date: '2026-11-05', benchmarks: { cdi: '0.10', ibov: '2.00', ifix: '1.00' } },
      { date: '2026-11-06', benchmarks: { cdi: '0.15', ibov: null, ifix: null } },
    ]);
  });

  it('sem FII em nenhuma carteira, sem IFIX; "% do CDI" pela regra da SPEC-020 (CA02)', async () => {
    // C: comprou PETR4 caro e está no negativo; sem "% do CDI".
    const c = await newPortfolio({
      name: 'Caro',
      type: 'historical',
      startDate: '2026-11-05',
      initialAmount: '3000',
    });
    await trade(c, { type: 'buy', assetId: PETR4, quantity: 100, date: '2026-11-05' });
    t.market.quotes.set(PETR4, {
      price: '25.00',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    const body = await comparison(`ids=${a},${c}&period=all`);
    expect(body.benchmarks.map((benchmark) => benchmark.code)).toEqual(['cdi', 'ibov']);
    const [first, second] = body.portfolios;
    // A: 10.000 → 10.000 (PETR4 de volta a R$ 25,00): 0%, sem "% do CDI".
    expect(first?.performance).toMatchObject({ return: '0.00', cdiShare: null });
    // C: 3.000 → 2.900.
    expect(second?.performance).toMatchObject({ return: '-3.33', cdiShare: null });

    t.market.quotes.set(PETR4, {
      price: '26.50',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    const up = await comparison(`ids=${a},${c}&period=all`);
    // A: 1,50% ÷ CDI 0,15% desde 03/11. C: 3.000 → 3.050, 1,67% ÷ CDI 0,05% desde 05/11 (o
    // dia-base dela, não o da comparação).
    expect(up.portfolios.map((item) => item.performance.cdiShare)).toEqual(['1000', '3340']);
  });

  it('"Desde o início": começa na mais antiga; a outra conta desde o próprio início (CA04)', async () => {
    const body = await comparison(`ids=${a},${b}&period=all`);
    expect(body.from).toBe('2026-11-03');
    expect(body.baseDate).toBe('2026-11-03');
    const [first, second] = body.portfolios;
    expect(first?.performance.from).toBe('2026-11-03');
    expect(second?.performance.from).toBe('2026-11-04');
    expect(second?.performance.series.map((point) => point.date)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(body.benchmarkSeries.map((point) => point.date)).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
  });

  it('carteira sem lançamento: "Sem lançamentos no período", sem linha; a outra normal (CA04)', async () => {
    const empty = await newPortfolio({ name: 'Nova', type: 'live' });
    const body = await comparison(`ids=${a},${empty}`);
    // "Em comum" com uma carteira de hoje: só hoje.
    expect(body).toMatchObject({ from: '2026-11-06', to: '2026-11-06' });
    const [first, second] = body.portfolios;
    // A: 10.100 (05/11) → 10.150.
    expect(first?.performance).toMatchObject({ empty: false, from: '2026-11-06', return: '0.50' });
    expect(second?.performance).toEqual({
      from: '2026-11-06',
      startValue: '0.00',
      endValue: '0.00',
      netFlows: '0.00',
      result: '0.00',
      return: '0.00',
      cdiShare: null,
      empty: true,
      warnings: [],
      series: [],
    });
    expect(second?.allocation.classes).toEqual([]);
  });

  it('períodos da SPEC-019 e duas datas; data final depois de hoje é after_today (CA02)', async () => {
    expect((await comparison(`ids=${a},${b}&period=1m`)).from).toBe('2026-10-06');
    expect((await comparison(`ids=${a},${b}&period=ytd`)).from).toBe('2026-01-01');
    const custom = await comparison(`ids=${a},${b}&from=2026-11-04&to=2026-11-05`);
    expect(custom.portfolios.map((item) => item.performance.return)).toEqual(['1.00', '0.00']);
    const after = await compare(`ids=${a},${b}&from=2026-11-04&to=2026-11-09`);
    expect(after.statusCode).toBe(400);
    expect(after.json()).toMatchObject({ fields: { to: 'after_today' } });
  });

  it('seleção inválida: 400 invalid_selection (CA02)', async () => {
    for (const ids of [a, `${a},${a}`, `${a},x`, `${a},${b},${OTHER},${PETR4},${MXRF11}`]) {
      const response = await compare(`ids=${ids}`);
      expect(response.statusCode, ids).toBe(400);
      expect(response.json()).toMatchObject({ fields: { ids: 'invalid_selection' } });
    }
  });

  it('carteira de outro usuário ou que não existe: 404 sem dizer qual (CA02)', async () => {
    const bia = await t.registerConfirmed({ name: 'Bia Lima', email: 'bia@exemplo.com' });
    const hers = await newPortfolio({ name: 'Da Bia', type: 'live' }, bia);
    for (const ids of [`${a},${hers}`, `${OTHER},${a}`]) {
      const response = await compare(`ids=${ids}`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'portfolio_not_found' });
      expect(response.body).not.toContain(hers);
      expect(response.body).not.toContain('Da Bia');
    }
  });

  it('o fechamento de um ativo em mais de uma carteira e o calendário são lidos uma vez (CA05)', async () => {
    const c = await newPortfolio({
      name: 'Mais petróleo',
      type: 'historical',
      startDate: '2026-11-05',
      initialAmount: '3000',
    });
    await trade(c, { type: 'buy', assetId: PETR4, quantity: 100, date: '2026-11-05' });
    const closes = vi.spyOn(t.market, 'closesFrom');
    const quotes = vi.spyOn(t.market, 'latestQuote');
    const calendar = vi.spyOn(t.calendar, 'tradingCalendar');
    const body = await comparison(`ids=${a},${b},${c}&period=all`);
    expect(closes.mock.calls.filter(([asset]) => asset === PETR4)).toEqual([[PETR4, '2026-11-04']]);
    expect(closes.mock.calls.filter(([asset]) => asset === MXRF11)).toHaveLength(1);
    expect(quotes.mock.calls.filter(([asset]) => asset === PETR4)).toHaveLength(1);
    expect(calendar).toHaveBeenCalledTimes(1);
    // C só recebe os fechamentos desde a compra dela: sem o de 04/11, como na tela dela (CA03).
    const own = (
      await call(`${portfolioSubPath(PORTFOLIO_PATHS.performance, c)}?period=all`)
    ).json<PortfolioPerformance>();
    expect(body.portfolios[2]?.performance.return).toBe(own.return);
  });
});
