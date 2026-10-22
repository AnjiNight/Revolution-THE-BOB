import {
  ASSET_PATHS,
  assetPath,
  AUTH_PATHS,
  SECTOR_OPTIONS,
  type AssetSearchResult,
  type AuthSession,
  type CatalogAsset,
  type CatalogListResult,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

describe('rotas do catálogo de ativos (SPEC-006)', () => {
  let now: Date;
  let t: TestApp;
  let collaborator: AuthSession;
  let user: AuthSession;

  beforeEach(async () => {
    now = new Date('2026-10-22T15:00:00.000Z');
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
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH',
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

  const petr4 = {
    ticker: 'petr4',
    name: 'Petrobras PN',
    class: 'stock',
    sector: 'petroleo_gas_biocombustiveis',
  };
  const mxrf11 = { ticker: 'MXRF11', name: 'Maxi Renda FII', class: 'fii', sector: 'recebiveis' };

  const search = async (query = '') => {
    const res = await call('GET', `${ASSET_PATHS.search}${query}`, user);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<AssetSearchResult>();
  };

  describe('cadastro (CA01, CA02)', () => {
    it('cadastra ação e FII; o ticker vira maiúsculas', async () => {
      const stock = await create(petr4);
      expect(stock).toEqual({
        id: expect.any(String),
        ticker: 'PETR4',
        name: 'Petrobras PN',
        class: 'stock',
        sector: 'petroleo_gas_biocombustiveis',
        active: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        deactivatedAt: null,
      });
      const fii = await create(mxrf11);
      expect(fii).toMatchObject({ ticker: 'MXRF11', class: 'fii', sector: 'recebiveis' });
    });

    it('aponta o problema de cada campo', async () => {
      const res = await call('POST', ASSET_PATHS.catalog, collaborator, {
        ticker: 'PETR4F',
        name: 'P',
        class: 'etf',
        sector: 'bancos',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        error: 'validation_error',
        fields: {
          ticker: 'invalid_ticker',
          name: 'too_short',
          class: 'invalid_option',
          sector: 'invalid_option',
        },
      });
    });

    it('setor de outra classe dá wrong_class', async () => {
      const res = await call('POST', ASSET_PATHS.catalog, collaborator, {
        ...mxrf11,
        sector: 'financeiro',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ fields: { sector: 'wrong_class' } });
    });

    it('ticker repetido, inclusive de ativo desativado, dá ticker_in_use', async () => {
      const stock = await create(petr4);
      await call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), collaborator);
      const res = await call('POST', ASSET_PATHS.catalog, collaborator, {
        ...petr4,
        name: 'Outro nome',
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'ticker_in_use' });
      expect(t.assets.assets).toHaveLength(1);
    });
  });

  describe('edição (CA03)', () => {
    it('muda ticker, nome e setor', async () => {
      const stock = await create({ ...petr4, ticker: 'BRDT3', name: 'BR Distribuidora' });
      now = new Date('2026-10-23T10:00:00.000Z');
      const res = await call('PATCH', assetPath(ASSET_PATHS.asset, stock.id), collaborator, {
        ticker: 'vbbr3',
        name: 'Vibra Energia',
        sector: 'utilidade_publica',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ asset: CatalogAsset }>().asset).toMatchObject({
        id: stock.id,
        ticker: 'VBBR3',
        name: 'Vibra Energia',
        class: 'stock',
        sector: 'utilidade_publica',
        createdAt: '2026-10-22T15:00:00.000Z',
        updatedAt: '2026-10-23T10:00:00.000Z',
      });
    });

    it('não há como mudar a classe (RB22)', async () => {
      const stock = await create(petr4);
      const res = await call('PATCH', assetPath(ASSET_PATHS.asset, stock.id), collaborator, {
        class: 'fii',
        sector: 'logistica',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ fields: { class: 'immutable' } });
      expect(t.assets.assets[0]).toMatchObject({ assetClass: 'stock', sector: stock.sector });
    });

    it('setor de outra classe que a do ativo dá wrong_class', async () => {
      const fii = await create(mxrf11);
      const res = await call('PATCH', assetPath(ASSET_PATHS.asset, fii.id), collaborator, {
        sector: 'financeiro',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        error: 'validation_error',
        fields: { sector: 'wrong_class' },
      });
    });

    it('ticker de outro ativo dá ticker_in_use; edição vazia dá validation_error', async () => {
      await create(petr4);
      const fii = await create(mxrf11);
      const taken = await call('PATCH', assetPath(ASSET_PATHS.asset, fii.id), collaborator, {
        ticker: 'PETR4',
      });
      expect(taken.statusCode).toBe(409);
      const empty = await call('PATCH', assetPath(ASSET_PATHS.asset, fii.id), collaborator, {});
      expect(empty.statusCode).toBe(400);
    });

    it('ativo que não existe, ou id que não é UUID, dá 404', async () => {
      for (const id of ['0d9e1f7a-1111-4222-8333-444455556666', 'nao-e-uuid']) {
        const res = await call('PATCH', assetPath(ASSET_PATHS.asset, id), collaborator, {
          name: 'Qualquer',
        });
        expect(res.statusCode, id).toBe(404);
        expect(res.json()).toMatchObject({ error: 'asset_not_found' });
      }
    });
  });

  describe('desativar e reativar (CA04, CA08)', () => {
    it('desativado some da busca do usuário e volta ao reativar; o colaborador sempre vê', async () => {
      const stock = await create(petr4);
      await create(mxrf11);

      const off = await call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), collaborator);
      expect(off.json<{ asset: CatalogAsset }>().asset).toMatchObject({
        active: false,
        deactivatedAt: now.toISOString(),
      });
      expect((await search()).assets.map((a) => a.ticker)).toEqual(['MXRF11']);
      expect((await search('?q=PETR4')).assets).toEqual([]);

      const list = await call('GET', `${ASSET_PATHS.catalog}?status=inactive`, collaborator);
      expect(list.json<CatalogListResult>()).toMatchObject({
        assets: [{ ticker: 'PETR4', active: false }],
        activeCount: 1,
      });

      const on = await call('POST', assetPath(ASSET_PATHS.reactivate, stock.id), collaborator);
      expect(on.json<{ asset: CatalogAsset }>().asset).toMatchObject({
        active: true,
        deactivatedAt: null,
      });
      expect((await search()).assets.map((a) => a.ticker)).toEqual(['MXRF11', 'PETR4']);
    });

    it('repetir não muda nada e não grava auditoria', async () => {
      const stock = await create(petr4);
      await call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), collaborator);
      const again = await call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), collaborator);
      expect(again.statusCode).toBe(200);
      const reactivated = await call(
        'POST',
        assetPath(ASSET_PATHS.reactivate, stock.id),
        collaborator,
      );
      expect(reactivated.statusCode).toBe(200);
      await call('POST', assetPath(ASSET_PATHS.reactivate, stock.id), collaborator);
      // Edição com os mesmos valores também não grava.
      await call('PATCH', assetPath(ASSET_PATHS.asset, stock.id), collaborator, {
        name: 'Petrobras PN',
      });
      expect(t.audit.forEntity('asset', stock.id).map((e) => e.action)).toEqual([
        'asset_created',
        'asset_deactivated',
        'asset_reactivated',
      ]);
    });
  });

  describe('busca (CA05)', () => {
    beforeEach(async () => {
      await create(petr4);
      await create({ ...petr4, ticker: 'PETR3', name: 'Petrobras ON' });
      await create({
        ticker: 'ITUB4',
        name: 'Itaú Unibanco PN',
        class: 'stock',
        sector: 'financeiro',
      });
      await create(mxrf11);
      await create({ ticker: 'HGLG11', name: 'CSHG Logística', class: 'fii', sector: 'logistica' });
    });

    it('por ticker e por nome, sem acentos, na ordem do §4', async () => {
      expect((await search('?q=petr4')).assets.map((a) => a.ticker)).toEqual(['PETR4']);
      expect((await search('?q=PETR')).assets.map((a) => a.ticker)).toEqual(['PETR3', 'PETR4']);
      expect((await search('?q=itau')).assets.map((a) => a.ticker)).toEqual(['ITUB4']);
      expect((await search('?q=logistica')).assets.map((a) => a.ticker)).toEqual(['HGLG11']);
    });

    it('filtra por classe e por setor ou segmento', async () => {
      expect((await search('?class=fii')).assets.map((a) => a.ticker)).toEqual([
        'HGLG11',
        'MXRF11',
      ]);
      expect((await search('?class=stock&sector=financeiro')).assets.map((a) => a.ticker)).toEqual([
        'ITUB4',
      ]);
      expect((await search('?sector=logistica')).assets.map((a) => a.ticker)).toEqual(['HGLG11']);
    });

    it('devolve só o que o usuário pode ver', async () => {
      const result = await search('?q=MXRF11');
      expect(result).toEqual({
        assets: [
          {
            id: expect.any(String),
            ticker: 'MXRF11',
            name: 'Maxi Renda FII',
            class: 'fii',
            sector: 'recebiveis',
          },
        ],
        hasMore: false,
      });
    });

    it('filtro inválido dá validation_error', async () => {
      const res = await call('GET', `${ASSET_PATHS.search}?class=fii&sector=financeiro`, user);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ fields: { sector: 'wrong_class' } });
    });

    it('no máximo 50 resultados, avisando que há mais', async () => {
      for (let i = 0; i < 50; i += 1) {
        await create({
          ticker: `TST${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`,
          name: `Ativo de teste ${i}`,
          class: 'stock',
          sector: 'outros',
        });
      }
      const result = await search();
      expect(result.assets).toHaveLength(50);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('lista do colaborador', () => {
    it('inclui desativados, filtra a situação e conta os ativos', async () => {
      const stock = await create(petr4);
      await create(mxrf11);
      await call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), collaborator);

      const all = await call('GET', ASSET_PATHS.catalog, collaborator);
      expect(all.json<CatalogListResult>()).toMatchObject({
        assets: [
          { ticker: 'MXRF11', active: true },
          { ticker: 'PETR4', active: false },
        ],
        activeCount: 1,
      });
      const active = await call('GET', `${ASSET_PATHS.catalog}?status=active&q=mxrf`, collaborator);
      expect(active.json<CatalogListResult>().assets.map((a) => a.ticker)).toEqual(['MXRF11']);
    });
  });

  it('lista fixa de setores e segmentos para qualquer pessoa conectada', async () => {
    const res = await call('GET', ASSET_PATHS.sectors, user);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sectors: SECTOR_OPTIONS });
  });

  describe('acesso (CA06)', () => {
    it('usuário recebe 403 em todas as rotas do colaborador, antes de qualquer validação', async () => {
      const stock = await create(petr4);
      const attempts = [
        call('GET', ASSET_PATHS.catalog, user),
        call('POST', ASSET_PATHS.catalog, user, { ...mxrf11 }),
        call('POST', ASSET_PATHS.catalog, user, { ticker: 'x' }),
        call('PATCH', assetPath(ASSET_PATHS.asset, stock.id), user, { name: 'Invasão' }),
        call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), user),
        call('POST', assetPath(ASSET_PATHS.reactivate, stock.id), user),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({ error: 'forbidden' });
      }
      expect(t.assets.assets).toHaveLength(1);
      expect(t.assets.assets[0]).toMatchObject({ name: 'Petrobras PN', deactivatedAt: null });
    });

    it('sem sessão, 401 em todas as rotas', async () => {
      for (const [method, url] of [
        ['GET', ASSET_PATHS.search],
        ['GET', ASSET_PATHS.sectors],
        ['GET', ASSET_PATHS.catalog],
        ['POST', ASSET_PATHS.catalog],
      ] as const) {
        const res = await call(method, url, null, method === 'POST' ? {} : undefined);
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    });
  });

  describe('auditoria (CA07)', () => {
    it('cada ação grava quando, o id do colaborador e o antes e depois, sem dado pessoal', async () => {
      const stock = await create(petr4);
      now = new Date('2026-10-23T09:00:00.000Z');
      await call('PATCH', assetPath(ASSET_PATHS.asset, stock.id), collaborator, {
        name: 'Petróleo Brasileiro PN',
      });
      await call('POST', assetPath(ASSET_PATHS.deactivate, stock.id), collaborator);
      await call('POST', assetPath(ASSET_PATHS.reactivate, stock.id), collaborator);

      const entries = t.audit.forEntity('asset', stock.id);
      expect(entries).toEqual([
        expect.objectContaining({
          at: new Date('2026-10-22T15:00:00.000Z'),
          collaboratorId: collaborator.user.id,
          action: 'asset_created',
          details: {
            after: {
              ticker: 'PETR4',
              name: 'Petrobras PN',
              class: 'stock',
              sector: 'petroleo_gas_biocombustiveis',
            },
          },
        }),
        expect.objectContaining({
          at: now,
          action: 'asset_updated',
          details: { before: { name: 'Petrobras PN' }, after: { name: 'Petróleo Brasileiro PN' } },
        }),
        expect.objectContaining({
          action: 'asset_deactivated',
          details: { before: { active: true }, after: { active: false } },
        }),
        expect.objectContaining({
          action: 'asset_reactivated',
          details: { before: { active: false }, after: { active: true } },
        }),
      ]);
      const text = JSON.stringify(t.audit.entries);
      expect(text).not.toContain('nicoly');
      expect(text).not.toContain('Nicoly');
    });

    it('cadastro e edição recusados não gravam auditoria', async () => {
      await create(petr4);
      await call('POST', ASSET_PATHS.catalog, collaborator, { ...petr4, name: 'Duplicado' });
      await call('POST', ASSET_PATHS.catalog, collaborator, { ...mxrf11, sector: 'financeiro' });
      expect(t.audit.entries.map((e) => e.action)).toEqual(['asset_created']);
    });
  });
});
