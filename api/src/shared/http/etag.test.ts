import {
  ASSET_NEWS_PATHS,
  ASSET_PATHS,
  assetPath,
  AUTH_PATHS,
  FUNDAMENTALS_PATHS,
  HEALTH_PATH,
  PORTFOLIO_PATHS,
  portfolioCashPath,
  portfolioPath,
  portfolioSubPath,
  PROFILE_PATHS,
  type AuthSession,
  type CatalogAsset,
} from '@simulador/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCollaborator } from '../../modules/identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../modules/market-data/domain/calendar-suggestion.js';
import { buildTestApp } from '../../testing/test-app.js';
import { etagOf, registerEtag } from './etag.js';

describe('ETag e 304 (SPEC-032)', () => {
  let app: FastifyInstance;
  let body: unknown;

  beforeEach(async () => {
    body = { portfolios: [{ id: 'a', name: 'Primeira' }] };
    app = Fastify();
    registerEtag(app);
    app.get('/api/leitura', () => body);
    app.get('/api/logo', (_request, reply) =>
      reply
        .header('content-type', 'image/png')
        .header('cache-control', 'private, max-age=86400')
        .send(Buffer.from([1, 2, 3])),
    );
    app.post('/api/leitura', () => body);
    app.get('/api/falta', (_request, reply) => reply.code(404).send({ error: 'not_found' }));
    app.get(HEALTH_PATH, () => ({ status: 'ok', timestamp: new Date().toISOString() }));
    app.get('/fora-da-api', () => body);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (url: string, ifNoneMatch?: string) =>
    app.inject({
      method: 'GET',
      url,
      ...(ifNoneMatch ? { headers: { 'if-none-match': ifNoneMatch } } : {}),
    });

  it('leitura com 200 leva o ETag do corpo e "private, no-cache"', async () => {
    const res = await get('/api/leitura');
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe(etagOf(res.body));
    expect(res.headers.etag).toMatch(/^W\/"[A-Za-z0-9_-]{43}"$/);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    // O mesmo corpo, o mesmo ETag.
    expect((await get('/api/leitura')).headers.etag).toBe(res.headers.etag);
  });

  it('If-None-Match igual: 304 sem corpo, sem tipo nem tamanho', async () => {
    const first = await get('/api/leitura');
    const etag = first.headers.etag as string;
    const again = await get('/api/leitura', etag);
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
    expect(again.headers.etag).toBe(etag);
    expect(again.headers['content-type']).toBeUndefined();
    expect(again.headers['content-length']).toBeUndefined();
    // Comparação fraca: sem o W/, numa lista ou com "*" também vale.
    expect((await get('/api/leitura', etag.slice(2))).statusCode).toBe(304);
    expect((await get('/api/leitura', `W/"outro", ${etag}`)).statusCode).toBe(304);
    expect((await get('/api/leitura', '*')).statusCode).toBe(304);
  });

  it('corpo diferente: ETag novo, e o ETag antigo recebe o corpo inteiro', async () => {
    const old = (await get('/api/leitura')).headers.etag as string;
    body = {
      portfolios: [
        { id: 'a', name: 'Primeira' },
        { id: 'b', name: 'Segunda' },
      ],
    };
    const res = await get('/api/leitura', old);
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).not.toBe(old);
    expect(res.json()).toEqual(body);
  });

  it('imagem também tem ETag, e a rota que já definiu o Cache-Control fica com o dela', async () => {
    const res = await get('/api/logo');
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe(etagOf(Buffer.from([1, 2, 3])));
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    const again = await get('/api/logo', res.headers.etag as string);
    expect(again.statusCode).toBe(304);
    expect(again.rawPayload.length).toBe(0);
  });

  it('escrita, erro, saúde e rota fora da API ficam como estão', async () => {
    const post = await app.inject({ method: 'POST', url: '/api/leitura' });
    expect(post.headers.etag).toBeUndefined();
    const missing = await get('/api/falta');
    expect(missing.statusCode).toBe(404);
    expect(missing.headers.etag).toBeUndefined();
    const health = await get(HEALTH_PATH);
    expect(health.headers.etag).toBeUndefined();
    expect(health.headers['cache-control']).toBeUndefined();
    expect((await get('/fora-da-api')).headers.etag).toBeUndefined();
  });
});

describe('ETag nas leituras que o app guarda (SPEC-032 CA02)', () => {
  type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
  let t: TestApp;
  let ana: AuthSession;
  let petr4: CatalogAsset;
  let historical: string;
  let now = new Date('2026-11-06T15:00:00Z');

  const call = (
    method: 'GET' | 'POST',
    url: string,
    session: AuthSession,
    extra: { payload?: Record<string, unknown>; ifNoneMatch?: string } = {},
  ) =>
    t.app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        ...(extra.ifNoneMatch ? { 'if-none-match': extra.ifNoneMatch } : {}),
      },
      ...(extra.payload ? { payload: extra.payload } : {}),
    });

  const etag = async (url: string) => {
    const res = await call('GET', url, ana);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
    return res.headers.etag as string;
  };

  beforeEach(async () => {
    now = new Date('2026-11-06T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    // A rentabilidade percorre todos os pregões desde o início: todos os anos publicados.
    for (let year = 2019; year <= 2026; year += 1) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Nicoly', email: 'nicoly@equipe.com' },
      () => 'senha-do-colaborador',
    );
    const collaborator = (
      await t.app.inject({
        method: 'POST',
        url: AUTH_PATHS.collaboratorLogin,
        payload: { email: 'nicoly@equipe.com', password: 'senha-do-colaborador' },
      })
    ).json<AuthSession>();
    petr4 = (
      await call('POST', ASSET_PATHS.catalog, collaborator, {
        payload: {
          ticker: 'PETR4',
          name: 'Petrobras PN',
          class: 'stock',
          sector: 'petroleo_gas_biocombustiveis',
        },
      })
    ).json<{ asset: CatalogAsset }>().asset;
    await t.logos.save(
      [
        {
          assetId: petr4.id,
          status: 'ok',
          image: { type: 'image/svg+xml', content: new TextEncoder().encode('<svg/>') },
          hash: 'h',
        },
      ],
      now,
    );
    t.fundamentalsRepo.assets.push({ id: petr4.id, ticker: 'PETR4', assetClass: 'stock' });
    t.newsRepo.catalog.push({ assetId: petr4.id, ticker: 'PETR4', name: 'PETR4', active: true });

    ana = await t.registerConfirmed();
    t.market.assets.set(petr4.id, {
      id: petr4.id,
      ticker: 'PETR4',
      name: 'PETR4',
      assetClass: 'stock',
      active: true,
    });
    t.market.dailyCloses.set(petr4.id, new Map([['2019-03-15', '25.30']]));
    t.market.closes.set(petr4.id, { date: '2026-11-05', close: '31.00' });
    historical = (
      await call('POST', PORTFOLIO_PATHS.list, ana, {
        payload: {
          name: 'E se em 2019',
          type: 'historical',
          startDate: '2019-01-02',
          initialAmount: '10000',
        },
      })
    ).json<{ portfolio: { id: string } }>().portfolio.id;
    now = new Date(now.getTime() + 1000);
    const bought = await call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, historical), ana, {
      payload: { type: 'buy', assetId: petr4.id, quantity: 100, date: '2019-03-15' },
    });
    expect(bought.statusCode, bought.body).toBe(201);
  });

  afterEach(async () => {
    await t.app.close();
  });

  const reads = () => [
    PORTFOLIO_PATHS.list,
    portfolioPath(historical),
    portfolioCashPath(historical),
    portfolioSubPath(PORTFOLIO_PATHS.positions, historical),
    `${portfolioSubPath(PORTFOLIO_PATHS.performance, historical)}?period=all`,
    `${PORTFOLIO_PATHS.comparison}?ids=${historical},${historical}`,
    assetPath(ASSET_PATHS.detail, petr4.id),
    `${assetPath(ASSET_PATHS.history, petr4.id)}?period=1y&adjusted=true`,
    assetPath(FUNDAMENTALS_PATHS.fundamentals, petr4.id),
    `${assetPath(FUNDAMENTALS_PATHS.dividends, petr4.id)}?period=12m`,
    assetPath(ASSET_PATHS.logo, petr4.id),
    // SPEC-029: as notícias da ficha também ficam na cópia local.
    assetPath(ASSET_NEWS_PATHS.list, petr4.id),
    `${assetPath(ASSET_NEWS_PATHS.days, petr4.id)}?period=1y`,
    PROFILE_PATHS.profile,
    PROFILE_PATHS.consents,
  ];

  it('cada leitura repetida sem mudança tem o mesmo ETag e responde 304 com ele', async () => {
    for (const url of reads()) {
      // A comparação com a mesma carteira duas vezes é recusada; ela entra no teste seguinte.
      if (url.startsWith(PORTFOLIO_PATHS.comparison)) continue;
      const first = await etag(url);
      expect(await etag(url), url).toBe(first);
      const again = await call('GET', url, ana, { ifNoneMatch: first });
      expect(again.statusCode, url).toBe(304);
      expect(again.body, url).toBe('');
    }
  });

  it('comparação: o mesmo ETag sem mudança', async () => {
    const other = (
      await call('POST', PORTFOLIO_PATHS.list, ana, {
        payload: { name: 'Outra', type: 'historical', startDate: '2019-01-02' },
      })
    ).json<{ portfolio: { id: string } }>().portfolio.id;
    const url = `${PORTFOLIO_PATHS.comparison}?ids=${historical},${other}`;
    const first = await etag(url);
    expect(await etag(url)).toBe(first);
    expect((await call('GET', url, ana, { ifNoneMatch: first })).statusCode).toBe(304);
  });

  it('um aporte muda o ETag do caixa, das posições e da rentabilidade, e não o da ficha', async () => {
    const cash = portfolioCashPath(historical);
    const positions = portfolioSubPath(PORTFOLIO_PATHS.positions, historical);
    const performance = `${portfolioSubPath(PORTFOLIO_PATHS.performance, historical)}?period=all`;
    const detail = assetPath(ASSET_PATHS.detail, petr4.id);
    const before = await Promise.all([cash, positions, performance, detail].map(etag));
    now = new Date(now.getTime() + 1000);
    const added = await call('POST', cash, ana, {
      payload: { type: 'deposit', amount: '500.00', date: '2019-03-15' },
    });
    expect(added.statusCode, added.body).toBe(201);
    const after = await Promise.all([cash, positions, performance, detail].map(etag));
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).not.toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    // O ETag antigo não serve mais: volta o corpo inteiro.
    const oldCashEtag = before[0] ?? '';
    expect(oldCashEtag).not.toBe('');
    expect((await call('GET', cash, ana, { ifNoneMatch: oldCashEtag })).statusCode).toBe(200);
  });
});
