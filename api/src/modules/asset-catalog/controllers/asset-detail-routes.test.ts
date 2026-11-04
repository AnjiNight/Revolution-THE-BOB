import {
  ASSET_PATHS,
  assetPath,
  AUTH_PATHS,
  type AssetDetail,
  type AuthSession,
  type CatalogAsset,
  type PriceHistory,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';
import { listed } from '../../market-data/testing/fakes.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

describe('ficha do ativo (SPEC-010)', () => {
  // Terça, 03/11/2026, 12h em Brasília: pregão aberto; o último fechamento guardado é 30/10.
  const now = new Date('2026-11-03T15:00:00.000Z');
  let t: TestApp;
  let collaborator: AuthSession;
  let user: AuthSession;
  let petr4: CatalogAsset;

  const call = (
    method: 'GET' | 'POST',
    url: string,
    session: AuthSession | null,
    payload?: unknown,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });

  const create = async (fields: Record<string, unknown>) => {
    const res = await call('POST', ASSET_PATHS.catalog, collaborator, fields);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ asset: CatalogAsset }>().asset;
  };

  /** Fechamentos guardados, como os arquivos da B3 trazem (SPEC-008). */
  const closes = (
    assetId: string,
    days: Array<[string, string]>,
    source: 'b3_cotahist' | 'brapi' = 'b3_cotahist',
  ) =>
    t.quotes.save(
      days.map(([date, close]) => ({
        assetId,
        date,
        open: close,
        high: close,
        low: close,
        close,
        average: close,
        trades: 100,
        volume: '1000.00',
      })),
      source,
    );

  const detail = async (id: string, session: AuthSession = user) => {
    const res = await call('GET', assetPath(ASSET_PATHS.detail, id), session);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<AssetDetail>();
  };

  const history = async (id: string, query = '') => {
    const res = await call('GET', `${assetPath(ASSET_PATHS.history, id)}${query}`, user);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PriceHistory>();
  };

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => now });
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Nicoly', email: 'nicoly@equipe.com' },
      () => 'senha-do-colaborador',
    );
    const login = await t.app.inject({
      method: 'POST',
      url: AUTH_PATHS.collaboratorLogin,
      payload: { email: 'nicoly@equipe.com', password: 'senha-do-colaborador' },
    });
    collaborator = login.json<AuthSession>();
    user = await t.registerConfirmed();
    await t.calendar.publish(
      2026,
      { nonTradingDays: suggestNonTradingDays(2026) },
      collaborator.user.id,
    );
    petr4 = await create({
      ticker: 'PETR4',
      name: 'Petrobras PN',
      class: 'stock',
      sector: 'petroleo_gas_biocombustiveis',
    });
    await closes(petr4.id, [
      ['2025-10-29', '33.00'],
      ['2025-10-30', '33.40'],
      ['2026-04-30', '38.00'],
      ['2026-10-29', '52.20'],
      ['2026-10-30', '52.71'],
    ]);
  });

  afterEach(async () => {
    await t.app.close();
  });

  describe('GET /api/assets/:id', () => {
    it('dados do ativo, último pregão da B3 com a variação e a situação do histórico (CA03)', async () => {
      const body = await detail(petr4.id);
      expect(body).toEqual({
        id: petr4.id,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        class: 'stock',
        sector: 'petroleo_gas_biocombustiveis',
        quote: null,
        hasLogo: false,
        active: true,
        deactivatedAt: null,
        lastSession: {
          date: '2026-10-30',
          open: '52.71',
          high: '52.71',
          low: '52.71',
          close: '52.71',
          previousClose: '52.20',
          change: '0.98',
          trades: 100,
          volume: '1000.00',
        },
        history: { status: 'loaded', from: '2025-10-29', to: '2026-10-30' },
      });
    });

    it('com a coleta do pregão, traz a cotação de hoje sobre o fechamento guardado (CA02)', async () => {
      t.quoteSource.answers.set('stock', [listed('PETR4', { price: '53.10', change: '0.74' })]);
      await t.intraday.collect();
      expect((await detail(petr4.id)).quote).toEqual({
        price: '53.10',
        change: '0.74',
        at: now.toISOString(),
        source: 'brapi',
      });
    });

    it('o fechamento provisório que não veio da B3 não entra no último pregão', async () => {
      await closes(petr4.id, [['2026-11-03', '60.00']], 'brapi');
      expect((await detail(petr4.id)).lastSession?.date).toBe('2026-10-30');
    });

    it('primeiro pregão do ativo: sem fechamento anterior nem variação', async () => {
      const fii = await create({
        ticker: 'MXRF11',
        name: 'Maxi Renda',
        class: 'fii',
        sector: 'recebiveis',
      });
      await closes(fii.id, [['2026-10-30', '8.88']]);
      expect((await detail(fii.id)).lastSession).toMatchObject({
        previousClose: null,
        change: null,
      });
    });

    it('ativo desativado abre, com a data da desativação (CA10)', async () => {
      const res = await call('POST', assetPath(ASSET_PATHS.deactivate, petr4.id), collaborator);
      expect(res.statusCode).toBe(200);
      const body = await detail(petr4.id);
      expect(body.active).toBe(false);
      expect(body.deactivatedAt).toBe(now.toISOString());
    });

    it('histórico ainda carregando e não encontrado (CA08)', async () => {
      const fii = await create({
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        class: 'fii',
        sector: 'logistica',
      });
      expect((await detail(fii.id)).history).toEqual({ status: 'pending', from: null, to: null });
      await t.quotes.markYearsLoaded([{ assetId: fii.id, year: 2026, records: 0 }]);
      expect((await detail(fii.id)).history).toEqual({ status: 'not_found', from: null, to: null });
      expect((await detail(fii.id)).lastSession).toBeNull();
    });

    it('o colaborador também abre a ficha', async () => {
      expect((await detail(petr4.id, collaborator)).ticker).toBe('PETR4');
    });

    it('ativo inexistente: 404; sem login: 401 (CA10, CA12)', async () => {
      const missing = await call(
        'GET',
        assetPath(ASSET_PATHS.detail, '5e0d6b52-8a1f-4c9e-9f27-3a8f2b1c4d5e'),
        user,
      );
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ error: 'asset_not_found' });
      expect((await call('GET', assetPath(ASSET_PATHS.detail, 'petr4'), user)).statusCode).toBe(
        404,
      );
      expect((await call('GET', assetPath(ASSET_PATHS.detail, petr4.id), null)).statusCode).toBe(
        401,
      );
    });
  });

  describe('GET /api/assets/:id/history', () => {
    it('sem período, 1 ano até o último fechamento, com o resumo (CA04, CA05)', async () => {
      expect(await history(petr4.id)).toEqual({
        period: '1y',
        from: '2025-10-30',
        to: '2026-10-30',
        shorterThanPeriod: false,
        points: [
          { date: '2025-10-30', close: '33.40' },
          { date: '2026-04-30', close: '38.00' },
          { date: '2026-10-29', close: '52.20' },
          { date: '2026-10-30', close: '52.71' },
        ],
        summary: {
          change: '57.81',
          min: { date: '2025-10-30', price: '33.40' },
          max: { date: '2026-10-30', price: '52.71' },
        },
        jumps: [],
      });
    });

    it('1 mês e Tudo', async () => {
      const month = await history(petr4.id, '?period=1m');
      expect(month.points.map((point) => point.date)).toEqual(['2026-10-29', '2026-10-30']);
      const all = await history(petr4.id, '?period=max');
      expect(all).toMatchObject({ from: '2025-10-29', to: '2026-10-30', shorterThanPeriod: false });
      expect(all.points).toHaveLength(5);
    });

    it('ativo com menos histórico que o período: "Histórico desde…"', async () => {
      const fiveYears = await history(petr4.id, '?period=5y');
      expect(fiveYears).toMatchObject({ from: '2025-10-29', shorterThanPeriod: true });
    });

    it('salto no período: marcado, e a variação do período não é calculada (CA06)', async () => {
      // Como um desdobramento de 1 para 2: 104,40 em 28/10 e 52,20 em 29/10.
      await closes(petr4.id, [['2026-10-28', '104.40']]);
      const body = await history(petr4.id, '?period=1m');
      expect(body.jumps).toEqual([{ date: '2026-10-29', change: '-50.00' }]);
      expect(body.summary?.change).toBeNull();
    });

    it('sem histórico carregado: série vazia (CA08)', async () => {
      const fii = await create({
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        class: 'fii',
        sector: 'logistica',
      });
      expect(await history(fii.id)).toEqual({
        period: '1y',
        from: null,
        to: null,
        shorterThanPeriod: false,
        points: [],
        summary: null,
        jumps: [],
      });
    });

    it('período inválido: 400; ativo inexistente: 404; sem login: 401 (CA12)', async () => {
      const invalid = await call(
        'GET',
        `${assetPath(ASSET_PATHS.history, petr4.id)}?period=2y`,
        user,
      );
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({
        error: 'validation_error',
        fields: { period: 'invalid_option' },
      });
      const missing = '5e0d6b52-8a1f-4c9e-9f27-3a8f2b1c4d5e';
      expect((await call('GET', assetPath(ASSET_PATHS.history, missing), user)).statusCode).toBe(
        404,
      );
      expect((await call('GET', assetPath(ASSET_PATHS.history, petr4.id), null)).statusCode).toBe(
        401,
      );
    });
  });
});
