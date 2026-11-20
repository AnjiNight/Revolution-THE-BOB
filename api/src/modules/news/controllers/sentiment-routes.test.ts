import { randomUUID } from 'node:crypto';
import {
  AUTH_PATHS,
  SENTIMENT_PATHS,
  newsLabelPath,
  type AuthSession,
  type NewsSentiment,
  type NewsToLabel,
  type SentimentModelVersion,
  type SentimentSummary,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = new Date('2026-11-19T12:00:00Z');
const PETR4 = randomUUID();

describe('rotas do sentimento (SPEC-044 §5.1)', () => {
  let t: TestApp;
  let collaborator: AuthSession;
  let user: AuthSession;

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Nicoly', email: 'nicoly@equipe.com' },
      () => 'senha-do-colaborador',
    );
    collaborator = (
      await t.app.inject({
        method: 'POST',
        url: AUTH_PATHS.collaboratorLogin,
        payload: { email: 'nicoly@equipe.com', password: 'senha-do-colaborador' },
      })
    ).json<AuthSession>();
    user = await t.registerConfirmed();
    t.newsRepo.catalog.push({ assetId: PETR4, ticker: 'PETR4', name: 'PETROBRAS', active: true });
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    session: AuthSession = collaborator,
    payload?: Record<string, unknown>,
  ) =>
    t.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${session.accessToken}` },
      ...(payload ? { payload } : {}),
    });

  /** Guarda `n` notícias, uma por dia de novembro, e devolve os ids das mais antigas às mais novas. */
  const store = async (n: number) => {
    await t.newsRepo.saveNews(
      t.newsRepo.parent.id,
      Array.from({ length: n }, (_v, i) => ({
        url: `https://investidor10.com.br/noticias/r-${i}/`,
        title: `Notícia ${i + 1}`,
        summary: null,
        body: null,
        author: null,
        themes: [],
        companies: [],
        publishedAt: new Date(Date.UTC(2026, 9, 1 + i, 15)),
        updatedAt: null,
      })),
      NOW,
    );
    return t.newsRepo.news.map((item) => item.id);
  };

  it('só o colaborador (403 para o usuário, 401 sem sessão) (CA04)', async () => {
    const [id] = await store(1);
    for (const [method, url] of [
      ['GET', SENTIMENT_PATHS.summary],
      ['GET', SENTIMENT_PATHS.next],
      ['POST', SENTIMENT_PATHS.evaluate],
      ['DELETE', newsLabelPath(id as string)],
    ] as const) {
      expect((await call(method, url, user)).statusCode).toBe(403);
    }
    expect(
      (await call('PUT', newsLabelPath(id as string), user, { sentiment: 'neutral' })).statusCode,
    ).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: SENTIMENT_PATHS.summary })).statusCode).toBe(
      401,
    );
  });

  it('sem versão do modelo: resumo vazio, avaliação recusada', async () => {
    await store(2);
    const summary = (await call('GET', SENTIMENT_PATHS.summary)).json<SentimentSummary>();
    expect(summary).toMatchObject({
      current: null,
      total: 2,
      classified: 0,
      labels: { total: 0, tuning: 0, test: 0 },
      visible: false,
      hiddenReason: 'no_model',
      history: [],
      recentLabels: [],
    });
    const res = await call('POST', SENTIMENT_PATHS.evaluate);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'no_model' });
  });

  it('rotular: a próxima sem o modelo, pular, gravar, trocar e apagar (CA04)', async () => {
    const [first, second] = await store(2);
    await t.newsRepo.saveLinks(
      second as string,
      [{ assetId: PETR4, relevance: 'principal', origin: 'ticker_titulo' }],
      1,
    );

    const next = (await call('GET', SENTIMENT_PATHS.next)).json<{ news: NewsToLabel }>().news;
    expect(next).toEqual({
      id: second,
      title: 'Notícia 2',
      summary: null,
      url: 'https://investidor10.com.br/noticias/r-1/',
      source: 'Investidor10',
      publishedAt: '2026-10-02T15:00:00.000Z',
      principal: ['PETR4'],
    });
    // O que o modelo disse nunca vem junto.
    expect(Object.keys(next)).not.toContain('sentiment');
    const skipped = await call('GET', `${SENTIMENT_PATHS.next}?skip=${second}`);
    expect(skipped.json<{ news: NewsToLabel }>().news.id).toBe(first);

    expect(
      (await call('PUT', newsLabelPath(second as string), collaborator, { sentiment: 'positive' }))
        .statusCode,
    ).toBe(204);
    expect(
      (await call('PUT', newsLabelPath(second as string), collaborator, { sentiment: 'negative' }))
        .statusCode,
    ).toBe(204);
    const summary = (await call('GET', SENTIMENT_PATHS.summary)).json<SentimentSummary>();
    expect(summary.labels.total).toBe(1);
    expect(summary.recentLabels).toMatchObject([{ id: second, label: 'negative' }]);

    expect((await call('DELETE', newsLabelPath(second as string))).statusCode).toBe(204);
    expect((await call('DELETE', newsLabelPath(second as string))).statusCode).toBe(404);
    await call('PUT', newsLabelPath(first as string), collaborator, { sentiment: 'neutral' });
    await call('PUT', newsLabelPath(second as string), collaborator, { sentiment: 'neutral' });
    expect((await call('GET', SENTIMENT_PATHS.next)).json()).toEqual({ news: null });
  });

  it('entrada inválida e notícia que não existe', async () => {
    const [id] = await store(1);
    const invalid = await call('PUT', newsLabelPath(id as string), collaborator, {
      sentiment: 'otimo',
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ fields: { sentiment: 'invalid_option' } });
    for (const missing of ['nao-e-uuid', randomUUID()]) {
      const res = await call('PUT', newsLabelPath(missing), collaborator, { sentiment: 'neutral' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'news_not_found' });
    }
    expect((await call('GET', `${SENTIMENT_PATHS.next}?skip=abc`)).statusCode).toBe(400);
  });

  it('avaliação: as 40% mais novas, nota guardada na versão e a visibilidade (CA03, CA05)', async () => {
    const ids = await store(150);
    const version = await t.sentimentRepo.useVersion('lexico', 1, NOW);
    const labels: NewsSentiment[] = ['positive', 'neutral', 'negative'];
    // O modelo acerta as 90 mais antigas e, nas 60 mais novas, erra 1 em cada 3.
    await t.sentimentRepo.saveClassifications(
      version,
      ids.map((id, i) => ({
        newsId: id,
        sentiment: i >= 90 && i % 3 === 0 ? 'neutral' : (labels[i % 3] as NewsSentiment),
        score: 0,
      })),
      NOW,
    );

    // Com poucas de teste, não avalia.
    for (const [i, id] of ids.slice(0, 20).entries()) {
      await t.sentimentRepo.saveLabel(id, labels[i % 3] as NewsSentiment, NOW);
    }
    const few = await call('POST', SENTIMENT_PATHS.evaluate);
    expect(few.statusCode).toBe(409);
    expect(few.json()).toMatchObject({ error: 'not_enough_labels' });

    for (const [i, id] of ids.entries()) {
      await t.sentimentRepo.saveLabel(id, labels[i % 3] as NewsSentiment, NOW);
    }
    const evaluated = await call('POST', SENTIMENT_PATHS.evaluate);
    expect(evaluated.statusCode).toBe(200);
    const result = evaluated.json<{ version: SentimentModelVersion }>().version;
    expect(result.evaluation).toMatchObject({ testSize: 60, evaluatedAt: NOW.toISOString() });
    // Os positivos de teste (i % 3 === 0) viram neutro: 20 erros em 60.
    expect(result.evaluation?.accuracy).toBe(0.667);
    expect(result.evaluation?.matrix).toEqual([
      [0, 20, 0],
      [0, 20, 0],
      [0, 0, 20],
    ]);
    const summary = (await call('GET', SENTIMENT_PATHS.summary)).json<SentimentSummary>();
    expect(summary.labels).toEqual({ total: 150, tuning: 90, test: 60 });
    expect(summary.classified).toBe(150);
    // F1 macro: positivo 0, neutro 0,667, negativo 1 → 0,556, abaixo de 0,60.
    expect(summary.current?.evaluation?.macroF1).toBe(0.556);
    expect(summary).toMatchObject({ visible: false, hiddenReason: 'low_score' });
  });
});
