import {
  assetPath,
  AUTH_PATHS,
  FUNDAMENTALS_PATHS,
  type AssetDividends,
  type AssetFundamentals,
  type AuthSession,
} from '@simulador/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = new Date('2026-11-04T15:00:00Z');
const PETR4 = {
  id: '11111111-1111-4111-8111-111111111111',
  ticker: 'PETR4',
  assetClass: 'stock' as const,
};
const MXRF11 = {
  id: '22222222-2222-4222-8222-222222222222',
  ticker: 'MXRF11',
  assetClass: 'fii' as const,
};

describe('rotas dos indicadores e proventos (SPECs 041 e 042)', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  const setup = async (investidor10 = true) => {
    t = await buildTestApp({ clock: () => NOW, investidor10 });
    t.fundamentalsRepo.assets.push(PETR4, MXRF11);
    await t.fundamentalsRepo.save(
      {
        assetId: PETR4.id,
        current: new Map([
          ['p_vp', '1.26'],
          ['p_l', '4.55'],
        ]),
        history: new Map([
          [
            'p_l',
            new Map([
              ['2025', '3.6'],
              ['2024', '12.74'],
            ]),
          ],
        ]),
        fund: null,
        dividends: [
          { kind: 'jcp', exDate: '2026-08-21', paymentDate: '2026-12-21', value: '0.20250435' },
          {
            kind: 'dividendo',
            exDate: '2026-08-21',
            paymentDate: '2026-12-21',
            value: '0.47156696',
          },
          { kind: 'dividendo', exDate: '2024-01-10', paymentDate: '2024-02-10', value: '1.5' },
        ],
      },
      new Date('2026-11-01T06:00:00Z'),
    );
    return t.registerConfirmed();
  };

  const get = (url: string, session: AuthSession | null) =>
    t.app.inject({
      method: 'GET',
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
    });

  it('indicadores na ordem do cadastro, com o histórico e a fonte (CA06)', async () => {
    const user = await setup();
    const res = await get(assetPath(FUNDAMENTALS_PATHS.fundamentals, PETR4.id), user);
    expect(res.statusCode).toBe(200);
    expect(res.json<AssetFundamentals>()).toEqual({
      source: 'investidor10',
      status: 'collected',
      collectedAt: '2026-11-01T06:00:00.000Z',
      current: [
        { code: 'p_l', value: '4.55' },
        { code: 'p_vp', value: '1.26' },
      ],
      history: { years: ['2025', '2024'], rows: [{ code: 'p_l', values: ['3.6', '12.74'] }] },
      fund: null,
    });
  });

  it('ativo ainda não coletado e ativo inexistente', async () => {
    const user = await setup();
    const fii = await get(assetPath(FUNDAMENTALS_PATHS.fundamentals, MXRF11.id), user);
    expect(fii.json()).toMatchObject({ status: 'not_collected', current: [], collectedAt: null });
    const missing = await get(
      assetPath(FUNDAMENTALS_PATHS.fundamentals, '33333333-3333-4333-8333-333333333333'),
      user,
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'asset_not_found' });
    expect((await get(assetPath(FUNDAMENTALS_PATHS.fundamentals, 'petr4'), user)).statusCode).toBe(
      404,
    );
  });

  it('proventos do período, do mais recente ao mais antigo, com o total de 12 meses', async () => {
    const user = await setup();
    const year = await get(`${assetPath(FUNDAMENTALS_PATHS.dividends, PETR4.id)}?period=12m`, user);
    expect(year.json<AssetDividends>()).toMatchObject({
      source: 'investidor10',
      period: '12m',
      total12m: '0.67407131',
      items: [{ exDate: '2026-08-21' }, { exDate: '2026-08-21' }],
    });
    const all = await get(`${assetPath(FUNDAMENTALS_PATHS.dividends, PETR4.id)}?period=all`, user);
    expect(all.json<AssetDividends>().items).toHaveLength(3);
    expect(all.json<AssetDividends>().total12m).toBe('0.67407131');
    const invalid = await get(
      `${assetPath(FUNDAMENTALS_PATHS.dividends, PETR4.id)}?period=2y`,
      user,
    );
    expect(invalid.statusCode).toBe(400);
  });

  it('interruptor desligado: as rotas respondem source_disabled (CA04)', async () => {
    const user = await setup(false);
    const res = await get(assetPath(FUNDAMENTALS_PATHS.fundamentals, PETR4.id), user);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'source_disabled' });
    const dividends = await get(assetPath(FUNDAMENTALS_PATHS.dividends, PETR4.id), user);
    expect(dividends.json()).toMatchObject({ error: 'source_disabled' });
  });

  it('situação da coleta só para o colaborador; sem sessão, 401', async () => {
    const user = await setup();
    expect((await get(FUNDAMENTALS_PATHS.collection, user)).statusCode).toBe(403);
    expect((await get(assetPath(FUNDAMENTALS_PATHS.fundamentals, PETR4.id), null)).statusCode).toBe(
      401,
    );

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
    const status = await get(FUNDAMENTALS_PATHS.collection, login.json<AuthSession>());
    expect(status.json()).toEqual({
      enabled: true,
      lastRun: null,
      collected: 1,
      noPage: 0,
      errors: 0,
      activeAssets: 2,
    });
  });
});
