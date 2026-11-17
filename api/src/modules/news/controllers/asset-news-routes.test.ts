import { randomUUID } from 'node:crypto';
import {
  ASSET_NEWS_PATHS,
  assetPath,
  type AssetNewsDays,
  type AssetNewsPage,
  type AuthSession,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import type { LinkRelevance } from '../domain/asset-links.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

// Quinta, 12/11/2026, 18h de Brasília.
const NOW = new Date('2026-11-12T21:00:00Z');
const PETR4 = randomUUID();
const VALE3 = randomUUID();

describe('notícias do ativo na ficha (SPEC-029 §5.1)', () => {
  let t: TestApp;
  let user: AuthSession;

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
    user = await t.registerConfirmed();
    t.newsRepo.catalog.push(
      { assetId: PETR4, ticker: 'PETR4', name: 'PETROBRAS', active: true },
      { assetId: VALE3, ticker: 'VALE3', name: 'VALE', active: true },
    );
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (url: string, session: AuthSession | null = user) =>
    t.app.inject({
      method: 'GET',
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
    });

  /** Guarda uma notícia ligada à PETR4 com a relevância dada. */
  const news = async (title: string, publishedAt: string, relevance: LinkRelevance) => {
    const url = `https://investidor10.com.br/noticias/${encodeURIComponent(title)}/`;
    await t.newsRepo.saveNews(
      t.newsRepo.parent.id,
      [
        {
          url,
          title,
          summary: `Resumo de ${title}`,
          body: null,
          author: null,
          themes: [],
          companies: [],
          publishedAt: new Date(publishedAt),
          updatedAt: null,
        },
      ],
      NOW,
    );
    const id = t.newsRepo.news.find((n) => n.url === url)?.id as string;
    await t.newsRepo.saveLinks(id, [{ assetId: PETR4, relevance, origin: 'ticker_texto' }], 1);
    return id;
  };

  const list = (query = '') => `${assetPath(ASSET_NEWS_PATHS.list, PETR4)}${query}`;
  const days = (query = '') => `${assetPath(ASSET_NEWS_PATHS.days, PETR4)}${query}`;

  it('lista: principal e citado das mais novas, 10 por vez, e o total das listas (CA01)', async () => {
    for (let i = 1; i <= 12; i += 1) {
      await news(
        `Notícia ${i}`,
        `2026-11-${String(i).padStart(2, '0')}T15:00:00Z`,
        i % 2 ? 'principal' : 'citado',
      );
    }
    await news('Agenda de resultados', '2026-11-12T12:00:00Z', 'lista');

    const first = await get(list());
    expect(first.statusCode).toBe(200);
    const page = first.json<AssetNewsPage>();
    expect(page.total).toBe(12);
    expect(page.listTotal).toBe(1);
    expect(page.news).toHaveLength(10);
    expect(page.news[0]).toMatchObject({
      title: 'Notícia 12',
      summary: 'Resumo de Notícia 12',
      source: 'Investidor10',
      publishedAt: '2026-11-12T15:00:00.000Z',
      relevance: 'citado',
    });
    expect(page.news[1]?.relevance).toBe('principal');

    const second = (await get(list('?offset=10'))).json<AssetNewsPage>();
    expect(second.news.map((n) => n.title)).toEqual(['Notícia 2', 'Notícia 1']);

    const lists = (await get(list('?group=list'))).json<AssetNewsPage>();
    expect(lists).toMatchObject({ total: 1, listTotal: 1 });
    expect(lists.news.map((n) => n.title)).toEqual(['Agenda de resultados']);
  });

  it('painel do pregão: a notícia das 19h conta para o dia seguinte (CA02)', async () => {
    // Terça 10/11 às 19h (Brasília) → quarta; quarta 11/11 às 14h → quarta; quarta às 19h → quinta.
    await news('Terça à noite', '2026-11-10T22:00:00Z', 'principal');
    await news('Quarta à tarde', '2026-11-11T17:00:00Z', 'citado');
    await news('Quarta à noite', '2026-11-11T22:00:00Z', 'principal');
    // Lista no mesmo dia não entra no painel.
    await news('Lista de quarta', '2026-11-11T16:00:00Z', 'lista');

    const wednesday = (await get(list('?after=2026-11-10&until=2026-11-11'))).json<AssetNewsPage>();
    expect(wednesday.news.map((n) => n.title)).toEqual(['Quarta à tarde', 'Terça à noite']);
    expect(wednesday.total).toBe(2);
    expect(wednesday.listTotal).toBe(1);

    const thursday = (await get(list('?after=2026-11-11&until=2026-11-12'))).json<AssetNewsPage>();
    expect(thursday.news.map((n) => n.title)).toEqual(['Quarta à noite']);
  });

  it('marcadores: notícias principal e citado por dia de referência, no período (CA03)', async () => {
    await news('Quarta à tarde', '2026-11-11T17:00:00Z', 'principal');
    await news('Quarta à noite', '2026-11-11T22:00:00Z', 'citado');
    await news('Quinta cedo', '2026-11-12T12:00:00Z', 'principal');
    await news('Sábado', '2026-11-07T13:00:00Z', 'principal');
    await news('Lista', '2026-11-11T16:00:00Z', 'lista');
    await news('Antiga', '2025-06-01T15:00:00Z', 'principal');

    const year = (await get(days('?period=1y'))).json<AssetNewsDays>();
    expect(year).toEqual({
      period: '1y',
      days: [
        { day: '2026-11-07', count: 1 },
        { day: '2026-11-11', count: 1 },
        { day: '2026-11-12', count: 2 },
      ],
    });
    const all = (await get(days('?period=max'))).json<AssetNewsDays>();
    expect(all.days[0]).toEqual({ day: '2025-06-01', count: 1 });
    // Sem período: 1 ano.
    expect((await get(days())).json<AssetNewsDays>().period).toBe('1y');
  });

  it('ativo sem notícias: listas e marcadores vazios', async () => {
    expect((await get(assetPath(ASSET_NEWS_PATHS.list, VALE3))).json()).toEqual({
      total: 0,
      listTotal: 0,
      news: [],
    });
    expect((await get(assetPath(ASSET_NEWS_PATHS.days, VALE3))).json()).toEqual({
      period: '1y',
      days: [],
    });
  });

  it('erros: sem sessão, ativo que não existe e entrada inválida (CA05)', async () => {
    expect((await get(list(), null)).statusCode).toBe(401);
    expect((await get(days(), null)).statusCode).toBe(401);
    for (const id of ['nao-e-uuid', randomUUID()]) {
      const res = await get(assetPath(ASSET_NEWS_PATHS.list, id));
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'asset_not_found' });
      expect((await get(assetPath(ASSET_NEWS_PATHS.days, id))).statusCode).toBe(404);
    }
    const invalid = await get(list('?offset=3&after=2026-10-01&until=2026-11-12'));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: 'validation_error',
      fields: { offset: 'invalid_option', until: 'too_long' },
    });
    expect((await get(days('?period=2y'))).statusCode).toBe(400);
  });
});
