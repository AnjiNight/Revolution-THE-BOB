import {
  AUTH_PATHS,
  NEWS_PATHS,
  newsSourcePath,
  type AuthSession,
  type NewsSourceCreated,
  type NewsSourcesStatus,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { FeedAddressError } from '../application/ports.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = new Date('2026-11-12T21:00:00Z');
const FEED = 'https://www.infomoney.com.br/feed/';
const RSS = `<rss version="2.0"><channel>
  <item><title>A</title><link>https://www.infomoney.com.br/a</link></item>
  <item><title>B</title><link>https://www.infomoney.com.br/b</link></item>
</channel></rss>`;

describe('rotas das fontes de notícias (SPEC-027 §5.1)', () => {
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
    t.feedFetcher.feeds.set(FEED, RSS);
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH',
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

  const newSource = (fields: Record<string, unknown> = {}) =>
    call('POST', NEWS_PATHS.sources, collaborator, {
      name: 'InfoMoney',
      url: FEED,
      category: 'mercado',
      reliability: 4,
      licenseChecked: true,
      ...fields,
    });

  it('lista: a fonte pai primeiro, a Agência Brasil e o interruptor (CA08)', async () => {
    const res = await call('GET', NEWS_PATHS.sources);
    expect(res.statusCode).toBe(200);
    const body = res.json<NewsSourcesStatus>();
    expect(body.parentEnabled).toBe(true);
    expect(body.archive).toBeNull();
    expect(body.sources.map((s) => [s.kind, s.name, s.active])).toEqual([
      ['parent', 'Investidor10', true],
      ['curated', 'Agência Brasil – Economia', true],
    ]);
  });

  it('usuário recebe 403 em todas as rotas; sem sessão, 401 (CA08)', async () => {
    expect((await call('GET', NEWS_PATHS.sources, user)).statusCode).toBe(403);
    expect((await call('POST', NEWS_PATHS.sources, user, {})).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: NEWS_PATHS.sources })).statusCode).toBe(401);
  });

  it('cadastro testa o feed, grava a fonte e a auditoria (CA04, CA08)', async () => {
    const res = await newSource({ name: '  Info   Money ' });
    expect(res.statusCode).toBe(201);
    const body = res.json<NewsSourceCreated>();
    expect(body.items).toBe(2);
    expect(body.source).toMatchObject({
      kind: 'curated',
      name: 'Info Money',
      url: FEED,
      category: 'mercado',
      reliability: 4,
      active: true,
    });
    expect(t.newsRepo.audit).toMatchObject([
      { action: 'news_source_created', entity: 'news_source', entityId: body.source.id },
    ]);
    // O mesmo endereço de novo: 409.
    expect((await newSource()).json()).toMatchObject({ error: 'source_exists' });
  });

  it('validação: https, licença, categoria e confiabilidade; feed que não é feed (CA05)', async () => {
    const fields = async (payload: Record<string, unknown>) =>
      (await newSource(payload)).json<{ fields?: Record<string, string> }>().fields;
    expect(await fields({ url: 'http://site.com/feed' })).toEqual({ url: 'not_https' });
    expect(await fields({ url: 'https://user:senha@site.com/feed' })).toEqual({
      url: 'invalid_url',
    });
    expect(await fields({ licenseChecked: false, reliability: 6, category: 'esportes' })).toEqual({
      licenseChecked: 'required',
      reliability: 'invalid_option',
      category: 'invalid_option',
    });
    t.feedFetcher.feeds.set('https://site.com/pagina', '<html><body>oi</body></html>');
    expect(await fields({ url: 'https://site.com/pagina' })).toEqual({ url: 'not_a_feed' });
    t.feedFetcher.feeds.set('https://interno.com/feed', new FeedAddressError('private_address'));
    expect(await fields({ url: 'https://interno.com/feed' })).toEqual({ url: 'private_address' });
  });

  it('editar e desativar a curada, com auditoria; a fonte pai não muda (CA08)', async () => {
    const { sources } = (await call('GET', NEWS_PATHS.sources)).json<NewsSourcesStatus>();
    const [parent, agency] = sources;
    const res = await call('PATCH', newsSourcePath(agency?.id ?? ''), collaborator, {
      active: false,
      reliability: 4,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ source: { active: false, reliability: 4 } });
    expect(t.newsRepo.audit.at(-1)).toMatchObject({
      action: 'news_source_updated',
      details: {
        before: { active: true, reliability: 5 },
        after: { active: false, reliability: 4 },
      },
    });

    const parentRes = await call('PATCH', newsSourcePath(parent?.id ?? ''), collaborator, {
      active: false,
    });
    expect(parentRes.statusCode).toBe(409);
    expect(parentRes.json()).toMatchObject({ error: 'parent_source' });
    const urlRes = await call('PATCH', newsSourcePath(agency?.id ?? ''), collaborator, {
      url: 'https://outro.com',
    });
    expect(urlRes.json()).toMatchObject({ fields: { url: 'immutable' } });
    expect(
      (
        await call('PATCH', newsSourcePath('00000000-0000-4000-8000-000000000000'), collaborator, {
          name: 'X',
        })
      ).statusCode,
    ).toBe(404);
  });
});
