import { randomUUID } from 'node:crypto';
import {
  ASSET_SCENARIO_PATH,
  assetPath,
  type AssetScenarios,
  type AuthSession,
  type NewsSentiment,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import type { LinkRelevance } from '../domain/asset-links.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

// Sexta, 27/11/2026, 10h de Brasília.
const NOW = new Date('2026-11-27T13:00:00Z');
const PETR4 = randomUUID();

/** 45 pregões seguidos (dias úteis) até 26/11/2026, do mais antigo para o mais novo. */
function sessions(): string[] {
  const days: string[] = [];
  const day = new Date('2026-11-26T12:00:00Z');
  while (days.length < 45) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6)
      days.unshift(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return days;
}

describe('cenários por sentimento na ficha (SPEC-031 §5.1)', () => {
  let t: TestApp;
  let user: AuthSession;
  let version: number;
  const days = sessions();

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
    user = await t.registerConfirmed();
    t.newsRepo.catalog.push({ assetId: PETR4, ticker: 'PETR4', name: 'PETROBRAS', active: true });
    // O preço sobe 2% a cada pregão (todo pregão é "alta" no pregão).
    let close = 30;
    await t.quotes.save(
      days.map((date) => {
        close *= 1.02;
        const text = close.toFixed(2);
        return {
          assetId: PETR4,
          date,
          open: text,
          high: text,
          low: text,
          close: text,
          average: text,
          trades: 100,
          volume: '1000.00',
        };
      }),
      'b3_cotahist',
    );
    version = await t.sentimentRepo.useVersion('lexico', 1, NOW);
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
  const scenarios = async () => {
    const res = await get(assetPath(ASSET_SCENARIO_PATH, PETR4));
    expect(res.statusCode, res.body).toBe(200);
    return res.json<AssetScenarios>();
  };

  /** Uma notícia às 10h de Brasília no dia, ligada à PETR4 e classificada com a pontuação. */
  const news = async (
    date: string,
    score: number,
    options: { relevance?: LinkRelevance; sourceId?: string } = {},
  ) => {
    const url = `https://noticias.exemplo/${randomUUID()}`;
    await t.newsRepo.saveNews(
      options.sourceId ?? t.newsRepo.parent.id,
      [
        {
          url,
          title: `Notícia de ${date}`,
          summary: null,
          body: null,
          author: null,
          themes: [],
          companies: [],
          publishedAt: new Date(`${date}T10:00:00-03:00`),
          updatedAt: null,
        },
      ],
      NOW,
    );
    const id = t.newsRepo.news.find((n) => n.url === url)?.id as string;
    await t.newsRepo.saveLinks(
      id,
      [{ assetId: PETR4, relevance: options.relevance ?? 'principal', origin: 'ticker_titulo' }],
      1,
    );
    const sentiment: NewsSentiment =
      score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
    await t.sentimentRepo.saveClassifications(version, [{ newsId: id, sentiment, score }], NOW);
    return id;
  };

  const passEvaluation = () =>
    t.sentimentRepo.saveEvaluation(version, {
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

  it('sem o sentimento validado, nenhum número (CA05); 401 e 404', async () => {
    await news(days[5] as string, -0.5);
    expect(await scenarios()).toEqual({
      visible: false,
      model: null,
      today: null,
      period: null,
      bands: null,
      base: null,
      newsSessions: 0,
      minOccurrences: 30,
    });
    expect((await get(assetPath(ASSET_SCENARIO_PATH, PETR4), null)).statusCode).toBe(401);
    expect((await get(assetPath(ASSET_SCENARIO_PATH, randomUUID()))).statusCode).toBe(404);
  });

  it('conta as faixas e a taxa-base no período, com "dados insuficientes" abaixo de 30 (CA02, CA03)', async () => {
    await passEvaluation();
    // O período começa na primeira notícia oficial classificada (days[2]).
    for (const date of days.slice(2, 35)) await news(date, -0.5);
    const body = await scenarios();
    expect(body.visible).toBe(true);
    expect(body.model).toEqual({ name: 'lexico', number: 1 });
    expect(body.period).toEqual({ from: days[2], to: days[44], sessions: 43 });
    expect(body.newsSessions).toBe(33);
    // No pregão: 33 pregões negativos, todos subiram 2% (> 1%).
    expect(body.bands?.negative[0]).toEqual({
      horizon: 0,
      occurrences: 33,
      insufficient: false,
      down: 0,
      flat: 0,
      up: 1,
    });
    // 20 pregões depois só existe até o pregão 24: dos negativos (2 a 34), 23 contam: insuficiente.
    expect(body.bands?.negative[2]).toMatchObject({
      occurrences: 23,
      insufficient: true,
      up: null,
    });
    expect(body.bands?.positive[0]).toMatchObject({ occurrences: 0, insufficient: true });
    expect(body.base?.[0]).toMatchObject({ occurrences: 43, up: 1 });
  });

  it('só notícias oficiais, principal ou citado, da versão em uso (CA04)', async () => {
    await passEvaluation();
    await news(days[10] as string, -0.5);
    await news(days[11] as string, -0.5, { relevance: 'citado' });
    await news(days[12] as string, -0.5, { relevance: 'lista' });
    const own = await t.newsRepo.addOwnSource(
      'ana',
      { url: 'https://blog.exemplo/feed', title: 'Blog', name: null },
      10,
      NOW,
    );
    await news(days[13] as string, -0.5, { sourceId: own.source.id });
    expect((await scenarios()).newsSessions).toBe(2);
  });

  it('o pregão de hoje e o registro, uma vez por dia (CA06)', async () => {
    await passEvaluation();
    await news(days[3] as string, 0.6);
    // Hoje (27/11), depois do último fechamento (26/11): duas notícias, média −0,4.
    await news('2026-11-27', -0.6);
    await news('2026-11-27', -0.2);
    const body = await scenarios();
    expect(body.today?.band).toBe('negative');
    expect(body.today?.news).toBe(2);
    expect(body.today?.score).toBeCloseTo(-0.4);
    await scenarios();
    expect(t.newsRepo.scenarioRecords).toHaveLength(3);
    expect(t.newsRepo.scenarioRecords[0]).toMatchObject({
      assetId: PETR4,
      day: '2026-11-27',
      band: 'negative',
      horizon: 0,
      modelVersionId: version,
      occurrences: 0,
      down: null,
    });
  });
});
