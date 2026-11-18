import type { DayChange } from '@simulador/shared';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import en from './i18n/locales/en.json';
import ptBR from './i18n/locales/pt-BR.json';
import {
  brasiliaClock,
  DEFAULT_VARIATION_SETTINGS,
  inCheckWindow,
  parseSent,
  parseSettings,
  pendingMoves,
  serializeSent,
  variationNotices,
} from './variation';

/** Tradução de mentira: devolve a chave com os valores, para conferir o que foi pedido. */
const t = (key: string, values: Record<string, unknown>) => `${key} ${JSON.stringify(values)}`;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const VALE3 = '22222222-2222-4222-8222-222222222222';
const ITUB4 = '33333333-3333-4333-8333-333333333333';
const BBAS3 = '44444444-4444-4444-8444-444444444444';
const MXRF11 = '55555555-5555-4555-8555-555555555555';

const APOSENTADORIA = { id: 'c1', name: 'Aposentadoria' };
const DIVIDENDOS = { id: 'c2', name: 'Dividendos' };

/** Cotação das 14:30 de Brasília de segunda, 16/11/2026. */
function day(
  assetId: string,
  ticker: string,
  change: string | null,
  portfolios = [APOSENTADORIA],
): DayChange {
  return {
    assetId,
    ticker,
    name: ticker,
    price: '38.40',
    change,
    at: '2026-11-16T17:30:00.000Z',
    portfolios,
  };
}

describe('avisos de variação: a escolha guardada (SPEC-033)', () => {
  it('sem nada guardado, ligados com 5%; o que vier estranho fica com o padrão', () => {
    expect(parseSettings(null)).toEqual({ enabled: true, threshold: 5 });
    expect(parseSettings('{"enabled":false,"threshold":10}')).toEqual({
      enabled: false,
      threshold: 10,
    });
    expect(parseSettings('{"enabled":false,"threshold":7}')).toEqual({
      enabled: false,
      threshold: 5,
    });
    expect(parseSettings('{"enabled":"sim","threshold":3}')).toEqual({
      enabled: true,
      threshold: 3,
    });
    expect(parseSettings('não é json')).toEqual(DEFAULT_VARIATION_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_VARIATION_SETTINGS);
  });

  it('os avisos dados valem só no dia em que foram dados', () => {
    const saved = serializeSent('2026-11-16', ['a:up', 'b:down']);
    expect(parseSent(saved, '2026-11-16')).toEqual(new Set(['a:up', 'b:down']));
    expect(parseSent(saved, '2026-11-17')).toEqual(new Set());
    expect(parseSent(null, '2026-11-16')).toEqual(new Set());
    expect(parseSent('{"date":"2026-11-16","keys":[1,"a:up"]}', '2026-11-16')).toEqual(
      new Set(['a:up']),
    );
    expect(parseSent('{quebrado', '2026-11-16')).toEqual(new Set());
  });
});

describe('avisos de variação: quando conferir (SPEC-033)', () => {
  it('dia útil, das 10:30 às 18:30 de Brasília, qualquer que seja o fuso do computador', () => {
    // Segunda, 16/11/2026; Brasília está em UTC−3.
    expect(brasiliaClock(new Date('2026-11-16T17:30:00Z'))).toEqual({
      date: '2026-11-16',
      minutes: 14 * 60 + 30,
    });
    expect(inCheckWindow(new Date('2026-11-16T13:29:00Z'))).toBe(false);
    expect(inCheckWindow(new Date('2026-11-16T13:30:00Z'))).toBe(true);
    expect(inCheckWindow(new Date('2026-11-16T21:30:00Z'))).toBe(true);
    expect(inCheckWindow(new Date('2026-11-16T21:31:00Z'))).toBe(false);
    // 23:00 de segunda em Brasília, já terça em UTC.
    expect(inCheckWindow(new Date('2026-11-17T02:00:00Z'))).toBe(false);
    // Sábado e domingo.
    expect(inCheckWindow(new Date('2026-11-14T15:00:00Z'))).toBe(false);
    expect(inCheckWindow(new Date('2026-11-15T15:00:00Z'))).toBe(false);
  });
});

describe('avisos de variação: o que avisar (SPEC-033)', () => {
  it('a partir do limiar, para cima ou para baixo, uma vez por dia em cada sentido', () => {
    const assets = [
      day(PETR4, 'PETR4', '5.20'),
      day(VALE3, 'VALE3', '-6.10'),
      day(ITUB4, 'ITUB4', '4.99'),
      day(BBAS3, 'BBAS3', null),
      day(MXRF11, 'MXRF11', '-5.00'),
    ];
    const moves = pendingMoves(assets, 5, new Set());
    // Da maior variação para a menor, sem olhar o sentido.
    expect(moves.map((move) => [move.asset.ticker, move.direction, move.key])).toEqual([
      ['VALE3', 'down', `${VALE3}:down`],
      ['PETR4', 'up', `${PETR4}:up`],
      ['MXRF11', 'down', `${MXRF11}:down`],
    ]);
    // Já avisados hoje: PETR4 subindo e VALE3 caindo. Se o PETR4 virar, é o outro sentido.
    const sent = new Set([`${PETR4}:up`, `${VALE3}:down`]);
    expect(pendingMoves(assets, 5, sent).map((move) => move.asset.ticker)).toEqual(['MXRF11']);
    expect(pendingMoves([day(PETR4, 'PETR4', '-5.30')], 5, sent).map((move) => move.key)).toEqual([
      `${PETR4}:down`,
    ]);
    // Com 10%, nada; com 3%, o ITUB4 também.
    expect(pendingMoves(assets, 10, new Set())).toEqual([]);
    expect(pendingMoves(assets, 3, new Set())).toHaveLength(4);
  });

  it('até 3 ativos, um aviso para cada, com a ficha como destino', () => {
    const moves = pendingMoves(
      [day(PETR4, 'PETR4', '5.20', [APOSENTADORIA, DIVIDENDOS]), day(VALE3, 'VALE3', '-6.10')],
      5,
      new Set(),
    );
    const notices = variationNotices(moves, 5, t, 'pt-BR');
    expect(notices).toHaveLength(2);
    expect(notices[0]?.title).toBe('alerts.notice.down {"ticker":"VALE3","change":"6,1%"}');
    expect(notices[0]?.target).toEqual({ kind: 'asset', assetId: VALE3 });
    expect(notices[1]?.title).toBe('alerts.notice.up {"ticker":"PETR4","change":"5,2%"}');
    expect(notices[1]?.body).toBe(
      'alerts.notice.quote {"price":"R$ 38,40","time":"14:30","delay":45} · ' +
        'alerts.notice.portfolios {"count":2,"names":"Aposentadoria e Dividendos"}',
    );
  });

  it('com muitas carteiras, as 3 primeiras e "e mais N"', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((name, index) => ({ id: `c${index}`, name }));
    const [notice] = variationNotices(
      pendingMoves([day(PETR4, 'PETR4', '5.20', many)], 5, new Set()),
      5,
      t,
      'pt-BR',
    );
    expect(notice?.body).toContain(
      'alerts.notice.portfolios {"count":5,"names":"alerts.notice.more {\\"items\\":\\"A, B, C\\",\\"more\\":2}"}',
    );
  });

  it('mais que 3 ativos de uma vez viram um aviso só, com os 3 maiores, e abre Carteiras', () => {
    const assets = [
      day(PETR4, 'PETR4', '-5.40'),
      day(VALE3, 'VALE3', '-6.10'),
      day(ITUB4, 'ITUB4', '-5.10'),
      day(BBAS3, 'BBAS3', '-5.05'),
      day(MXRF11, 'MXRF11', '-5.00'),
    ];
    const [notice, ...rest] = variationNotices(pendingMoves(assets, 5, new Set()), 5, t, 'pt-BR');
    expect(rest).toEqual([]);
    expect(notice).toEqual({
      title: 'alerts.notice.groupDown {"total":5,"threshold":"5%"}',
      body: 'alerts.notice.more {"items":"VALE3 -6,1%, PETR4 -5,4%, ITUB4 -5,1%","more":2}',
      target: { kind: 'portfolios' },
    });
    // Subindo e caindo juntos: "variaram".
    const mixed = [...assets.slice(0, 3), day(BBAS3, 'BBAS3', '7.00')];
    expect(variationNotices(pendingMoves(mixed, 5, new Set()), 5, t, 'pt-BR')[0]?.title).toBe(
      'alerts.notice.groupMixed {"total":4,"threshold":"5%"}',
    );
  });

  it('o texto final em português e em inglês, sem valores da carteira', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
      lng: 'pt-BR',
      interpolation: { escapeValue: false },
    });
    const translate = (key: string, values: Record<string, unknown>) => i18n.t(key, values);
    const one = pendingMoves(
      [day(PETR4, 'PETR4', '5.20', [APOSENTADORIA, DIVIDENDOS])],
      5,
      new Set(),
    );
    expect(variationNotices(one, 5, translate, 'pt-BR')[0]).toEqual({
      title: 'PETR4 subiu 5,2% hoje',
      body: 'R$ 38,40 às 14:30 (atraso de até 45 min) · Carteiras: Aposentadoria e Dividendos',
      target: { kind: 'asset', assetId: PETR4 },
    });
    const single = pendingMoves([day(VALE3, 'VALE3', '-6.10')], 5, new Set());
    expect(variationNotices(single, 5, translate, 'pt-BR')[0]?.body).toMatch(
      / · Carteira: Aposentadoria$/,
    );
    const group = pendingMoves(
      [
        day(PETR4, 'PETR4', '-5.40'),
        day(VALE3, 'VALE3', '-6.10'),
        day(ITUB4, 'ITUB4', '-5.10'),
        day(BBAS3, 'BBAS3', '-5.05'),
      ],
      5,
      new Set(),
    );
    expect(variationNotices(group, 5, translate, 'pt-BR')[0]).toMatchObject({
      title: '4 ativos das suas carteiras caíram 5% ou mais hoje',
      body: 'VALE3 -6,1%, PETR4 -5,4%, ITUB4 -5,1% e mais 1',
    });

    await i18n.changeLanguage('en');
    const [english] = variationNotices(one, 5, translate, 'en');
    expect(english?.title).toBe('PETR4 rose 5.2% today');
    expect(english?.body).toMatch(
      /^R\$38\.40 at 02:30\sPM \(up to 45 min delay\) · Portfolios: Aposentadoria and Dividendos$/u,
    );
    expect(variationNotices(group, 5, translate, 'en')[0]?.title).toBe(
      '4 assets in your portfolios fell 5% or more today',
    );
  });
});
