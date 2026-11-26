import { randomUUID } from 'node:crypto';
import {
  ASSET_NEWS_PATHS,
  AUTH_PATHS,
  MY_NEWS_PATHS,
  NEWS_PATHS,
  assetPath,
  myNewsSourcePath,
  myNewsSourceRetryPath,
  type AssetNewsPage,
  type AuthSession,
  type MyNewsSources,
  type NewsFeedPage,
  type NewsSourcesStatus,
  type OwnFeedCreated,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { FeedAddressError, NewsSourceError, FEED_TOO_LARGE } from '../application/ports.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

// Quinta, 26/11/2026, 18h de Brasília.
const NOW = new Date('2026-11-26T21:00:00Z');
const PETR4 = randomUUID();
const ITUB4 = randomUUID();
const FEED = 'https://www.exemplo.com.br/feed';
const rss = (title: string, items: Array<[string, string]>) => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>${title}</title>
${items.map(([t, link]) => `<item><title>${t}</title><link>${link}</link><pubDate>Wed, 25 Nov 2026 13:00:00 GMT</pubDate></item>`).join('\n')}
</channel></rss>`;

describe('fontes do usuário e tela Notícias (SPEC-030 §5.2)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let bruno: AuthSession;

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
    ana = await t.registerConfirmed({ email: 'ana@exemplo.com' });
    bruno = await t.registerConfirmed({ name: 'Bruno', email: 'bruno@exemplo.com' });
    t.newsRepo.catalog.push(
      { assetId: PETR4, ticker: 'PETR4', name: 'PETROBRAS', active: true },
      { assetId: ITUB4, ticker: 'ITUB4', name: 'ITAU UNIBANCO', active: true },
    );
    t.newsRepo.sectors.set(PETR4, { class: 'stock', code: 'petroleo_gas_biocombustiveis' });
    t.newsRepo.sectors.set(ITUB4, { class: 'stock', code: 'financeiro' });
    t.feedFetcher.feeds.set(FEED, rss('Blog de FIIs', [['Notícia do blog', `${FEED}/1`]]));
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    session: AuthSession | null = ana,
    payload?: Record<string, unknown>,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload ? { payload } : {}),
    });

  /** Guarda uma notícia na fonte, ligada aos ativos como principal. */
  const news = async (
    sourceId: string,
    title: string,
    publishedAt: string,
    assets: string[] = [],
  ): Promise<string> => {
    const url = `https://noticias.exemplo/${encodeURIComponent(title)}`;
    await t.newsRepo.saveNews(
      sourceId,
      [
        {
          url,
          title,
          summary: null,
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
    const id = t.newsRepo.news.find((n) => n.url === url && n.sourceId === sourceId)?.id as string;
    await t.newsRepo.saveLinks(
      id,
      assets.map((assetId) => ({ assetId, relevance: 'principal', origin: 'ticker_titulo' })),
      1,
    );
    return id;
  };

  const sources = async (session = ana) =>
    (await call('GET', MY_NEWS_PATHS.sources, session)).json<MyNewsSources>();
  const feed = async (query = '', session = ana) =>
    (await call('GET', `${MY_NEWS_PATHS.feed}${query}`, session)).json<NewsFeedPage>();
  const addFeed = (payload: Record<string, unknown>, session = ana) =>
    call('POST', MY_NEWS_PATHS.sources, session, payload);

  it('sem escolhas: a pai sempre ligada e as curadas ligadas e Média (CA01)', async () => {
    const res = await call('GET', MY_NEWS_PATHS.sources);
    expect(res.statusCode).toBe(200);
    expect(res.json<MyNewsSources>()).toEqual({
      sources: [
        expect.objectContaining({
          kind: 'parent',
          name: 'Investidor10',
          active: true,
          priority: null,
          weight: 4,
          status: null,
        }),
        expect.objectContaining({
          kind: 'curated',
          name: 'Agência Brasil – Economia',
          active: true,
          priority: 'medium',
          weight: 2,
          category: 'economia',
        }),
      ],
      ownLimit: 10,
      ownCount: 0,
    });
    expect((await call('GET', MY_NEWS_PATHS.sources, null)).statusCode).toBe(401);
  });

  it('desligar uma curada vale só para quem desligou; desligada pelo colaborador some para todos (CA02)', async () => {
    const agency = t.newsRepo.agency.id;
    await news(t.newsRepo.parent.id, 'Da pai', '2026-11-25T13:00:00Z', [PETR4]);
    await news(agency, 'Da Agência', '2026-11-25T14:00:00Z', [PETR4]);

    const off = await call('PATCH', myNewsSourcePath(agency), ana, { active: false });
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({ source: { active: false, priority: 'medium' } });
    expect((await feed()).news.map((n) => n.title)).toEqual(['Da pai']);
    // No mesmo dia, a pai (peso 4) vem antes da Agência (Média, 2).
    expect((await feed('', bruno)).news.map((n) => n.title)).toEqual(['Da pai', 'Da Agência']);
    const ficha = await call('GET', assetPath(ASSET_NEWS_PATHS.list, PETR4));
    expect(ficha.json<AssetNewsPage>().news.map((n) => n.title)).toEqual(['Da pai']);

    t.newsRepo.agency.active = false;
    expect((await feed('', bruno)).news.map((n) => n.title)).toEqual(['Da pai']);
    // A curada desligada pelo colaborador nem aparece na Minhas fontes.
    expect((await sources(bruno)).sources.map((s) => s.kind)).toEqual(['parent']);
  });

  it('a fonte pai não muda: 409 parent_source; nome só no feed próprio (CA03)', async () => {
    const parent = t.newsRepo.parent.id;
    for (const payload of [{ active: false }, { priority: 'low' }]) {
      const res = await call('PATCH', myNewsSourcePath(parent), ana, payload);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'parent_source' });
    }
    expect((await call('DELETE', myNewsSourcePath(parent))).json()).toMatchObject({
      error: 'not_own_source',
    });
    const renamed = await call('PATCH', myNewsSourcePath(t.newsRepo.agency.id), ana, {
      name: 'Outro nome',
    });
    expect(renamed.statusCode).toBe(400);
    expect(renamed.json()).toMatchObject({ fields: { name: 'immutable' } });
    expect(
      (await call('PATCH', myNewsSourcePath(randomUUID()), ana, { active: true })).statusCode,
    ).toBe(404);
  });

  it('adiciona o feed lendo na hora; o título do feed vira o nome (CA04, CA06)', async () => {
    const res = await addFeed({ url: FEED });
    expect(res.statusCode).toBe(201);
    const created = res.json<OwnFeedCreated>();
    expect(created).toMatchObject({
      items: 1,
      source: { kind: 'own', name: 'Blog de FIIs', active: true, priority: 'medium', news: 1 },
    });
    expect(created.source.status).toBe('ok');

    // Só a Ana vê, com "Sua fonte".
    const page = await feed();
    expect(page.news).toEqual([
      expect.objectContaining({
        title: 'Notícia do blog',
        source: 'Blog de FIIs',
        ownSource: true,
      }),
    ]);
    expect((await feed('', bruno)).news).toEqual([]);
    expect((await sources()).ownCount).toBe(1);
  });

  it('recusa endereço ruim com o motivo (CA04)', async () => {
    const cases: Array<[string, Error | string, string]> = [
      ['https://interno.exemplo/feed', new FeedAddressError('private_address'), 'private_address'],
      ['https://pagina.exemplo/', '<html><body>Não é feed</body></html>', 'not_a_feed'],
      ['https://grande.exemplo/feed', new NewsSourceError('invalid', FEED_TOO_LARGE), 'too_large'],
      [
        'https://fora.exemplo/feed',
        new NewsSourceError('retryable', 'feed respondeu 503'),
        'unreachable',
      ],
      ['https://vazio.exemplo/feed', rss('Vazio', []), 'not_a_feed'],
    ];
    for (const [url, answer, reason] of cases) {
      t.feedFetcher.feeds.set(url, answer);
      const res = await addFeed({ url });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'validation_error', fields: { url: reason } });
    }
    const http = await addFeed({ url: 'http://exemplo.com/feed' });
    expect(http.json()).toMatchObject({ fields: { url: 'not_https' } });
    expect((await sources()).ownCount).toBe(0);
  });

  it('o endereço de uma fonte do app, o repetido e o 11º são recusados (CA04)', async () => {
    const inApp = await addFeed({ url: t.newsRepo.agency.url });
    expect(inApp.statusCode).toBe(409);
    expect(inApp.json()).toMatchObject({
      error: 'already_in_app',
      details: { sourceId: t.newsRepo.agency.id },
    });

    expect((await addFeed({ url: FEED })).statusCode).toBe(201);
    expect((await addFeed({ url: FEED })).json()).toMatchObject({ error: 'already_added' });

    for (let i = 2; i <= 10; i += 1) {
      const url = `https://feed${i}.exemplo/rss`;
      t.feedFetcher.feeds.set(url, rss(`Feed ${i}`, [[`Item ${i}`, `${url}/1`]]));
      expect((await addFeed({ url })).statusCode).toBe(201);
    }
    t.feedFetcher.feeds.set('https://feed11.exemplo/rss', rss('Feed 11', [['x', 'https://x.y/1']]));
    const eleventh = await addFeed({ url: 'https://feed11.exemplo/rss' });
    expect(eleventh.statusCode).toBe(409);
    expect(eleventh.json()).toMatchObject({ error: 'source_limit_reached' });
  });

  it('o mesmo endereço é uma fonte só; ao sair o último, ela e as notícias somem (CA05)', async () => {
    await addFeed({ url: FEED, name: 'Blog FII' });
    await addFeed({ url: FEED, name: 'Fundos' }, bruno);
    const own = t.newsRepo.list.filter((s) => s.kind === 'user');
    expect(own).toHaveLength(1);
    const id = own[0]?.id as string;
    expect((await feed()).news[0]?.source).toBe('Blog FII');
    expect((await feed('', bruno)).news[0]?.source).toBe('Fundos');

    expect((await call('DELETE', myNewsSourcePath(id))).statusCode).toBe(204);
    expect((await feed()).news).toEqual([]);
    expect(t.newsRepo.list.some((s) => s.id === id)).toBe(true);

    expect((await call('DELETE', myNewsSourcePath(id), bruno)).statusCode).toBe(204);
    expect(t.newsRepo.list.some((s) => s.id === id)).toBe(false);
    expect(t.newsRepo.news.some((n) => n.sourceId === id)).toBe(false);
    // De novo: a fonte não é mais da Ana.
    expect((await call('DELETE', myNewsSourcePath(id))).statusCode).toBe(404);
  });

  it('ordem por dia e, no mesmo dia, pelo peso; filtros por ativo, setor, fonte e período (CA08)', async () => {
    await addFeed({ url: FEED });
    const own = t.newsRepo.list.find((s) => s.kind === 'user')?.id as string;
    const agency = t.newsRepo.agency.id;
    const parent = t.newsRepo.parent.id;
    await news(agency, 'Agência cedo', '2026-11-26T12:00:00Z', [ITUB4]);
    await news(own, 'Própria tarde', '2026-11-26T18:00:00Z', [PETR4]);
    await news(parent, 'Pai de manhã', '2026-11-26T11:00:00Z', [PETR4]);
    await news(parent, 'Pai ontem', '2026-11-25T20:00:00Z');
    await news(parent, 'Pai de setembro', '2026-09-01T12:00:00Z');

    await call('PATCH', myNewsSourcePath(own), ana, { priority: 'high' });
    await call('PATCH', myNewsSourcePath(agency), ana, { priority: 'low' });
    expect((await feed()).news.map((n) => n.title)).toEqual([
      'Pai de manhã', // 4
      'Própria tarde', // alta, 3
      'Agência cedo', // baixa, 1
      'Pai ontem',
      'Notícia do blog',
    ]);
    expect((await feed('?period=12m')).total).toBe(6);
    expect((await feed(`?asset=${PETR4}`)).news.map((n) => n.title)).toEqual([
      'Pai de manhã',
      'Própria tarde',
    ]);
    const banks = await feed('?sector=stock:financeiro');
    expect(banks.news.map((n) => n.title)).toEqual(['Agência cedo']);
    expect(banks.news[0]?.assets).toEqual([{ id: ITUB4, ticker: 'ITUB4' }]);
    expect((await feed(`?source=${own}`)).total).toBe(2);
    expect((await call('GET', `${MY_NEWS_PATHS.feed}?asset=${randomUUID()}`)).statusCode).toBe(404);
    expect((await call('GET', `${MY_NEWS_PATHS.feed}?sector=stock:inexistente`)).statusCode).toBe(
      400,
    );
    expect((await call('GET', `${MY_NEWS_PATHS.feed}?offset=5`)).statusCode).toBe(400);
  });

  it('o tom ponderado só com o sentimento visível e 10 classificadas (CA09)', async () => {
    const agency = t.newsRepo.agency.id;
    const parent = t.newsRepo.parent.id;
    const ids: Array<[string, 'positive' | 'negative']> = [];
    for (let i = 0; i < 6; i += 1) {
      ids.push([await news(parent, `Pai ${i}`, '2026-11-25T13:00:00Z'), 'positive']);
    }
    for (let i = 0; i < 4; i += 1) {
      ids.push([await news(agency, `Agência ${i}`, '2026-11-25T14:00:00Z'), 'negative']);
    }
    expect(await feed()).toMatchObject({ tone: null, toneHidden: 'no_model' });

    const v = await t.sentimentRepo.useVersion('lexico', 1, NOW);
    await t.sentimentRepo.saveClassifications(
      v,
      ids.map(([newsId, sentiment]) => ({ newsId, sentiment, score: 0.5 })),
      NOW,
    );
    await t.sentimentRepo.saveEvaluation(v, {
      evaluatedAt: NOW,
      testSize: 60,
      accuracy: 0.8,
      macroF1: 0.7,
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    });
    // 6 da pai (peso 4) positivas e 4 da Agência (Média, 2) negativas: 24 / 32 e 8 / 32.
    const page = await feed();
    expect(page.toneHidden).toBeNull();
    expect(page.tone).toEqual({
      shares: { positive: 0.75, neutral: 0, negative: 0.25 },
      classified: 10,
    });
    // O filtro de sentimento filtra a lista, não o tom.
    const negatives = await feed('?sentiment=negative');
    expect(negatives.total).toBe(4);
    expect(negatives.tone?.shares.positive).toBe(0.75);

    await call('PATCH', myNewsSourcePath(agency), ana, { active: false });
    expect(await feed()).toMatchObject({ tone: null, toneHidden: 'few_news' });
  });

  it('feed parado: "Tentar de novo" lê na hora (CA10)', async () => {
    await addFeed({ url: FEED });
    const id = t.newsRepo.list.find((s) => s.kind === 'user')?.id as string;
    expect((await call('POST', myNewsSourceRetryPath(id))).json()).toMatchObject({
      error: 'not_stopped',
    });
    await t.newsRepo.setStopped(id, NOW);
    expect((await sources()).sources.find((s) => s.id === id)?.status).toBe('stopped');

    t.feedFetcher.feeds.set(FEED, new NewsSourceError('retryable', 'feed respondeu 503'));
    const still = await call('POST', myNewsSourceRetryPath(id));
    expect(still.json()).toMatchObject({ fields: { url: 'unreachable' } });

    t.feedFetcher.feeds.set(FEED, rss('Blog de FIIs', [['Voltou', `${FEED}/2`]]));
    const back = await call('POST', myNewsSourceRetryPath(id));
    expect(back.statusCode).toBe(200);
    expect(back.json<OwnFeedCreated>().source.status).toBe('ok');
    expect(t.newsRepo.list.find((s) => s.id === id)?.stoppedAt).toBeNull();
  });

  it('o colaborador vê só os totais e usa a tela na Visão do usuário (CA12, CA14)', async () => {
    await addFeed({ url: FEED });
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
    const status = (await call('GET', NEWS_PATHS.sources, collaborator)).json<NewsSourcesStatus>();
    expect(status.userSources).toEqual({ total: 1, failing: 0, stopped: 0 });
    expect(status.sources.map((s) => s.url)).not.toContain(FEED);
    const latest = (await call('GET', NEWS_PATHS.latest, collaborator)).json<{ total: number }>();
    expect(latest.total).toBe(0);

    expect((await call('GET', MY_NEWS_PATHS.sources, collaborator)).statusCode).toBe(200);
    expect((await feed('', collaborator)).news).toEqual([]);
  });

  it('as notícias dos feeds dos usuários ficam fora da amostra para rotular (CA07)', async () => {
    await addFeed({ url: FEED });
    const own = t.newsRepo.news[0]?.id as string;
    expect(await t.sentimentRepo.nextToLabel([])).toBeNull();
    await expect(t.sentimentRepo.saveLabel(own, 'positive', NOW)).rejects.toThrow();
    expect(await t.sentimentRepo.classifiedCounts(null)).toEqual({ total: 0, classified: 0 });
  });
});
