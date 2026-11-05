import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fiiPage, stockPage } from '../testing/investidor10-fixtures.js';
import {
  FakeInvestidor10Source,
  InMemoryFundamentals,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { Investidor10Collection } from './investidor10-collection.js';
import { Investidor10SourceError } from './ports.js';

const PETR4 = { id: 'a-petr4', ticker: 'PETR4', assetClass: 'stock' as const };
const MXRF11 = { id: 'a-mxrf11', ticker: 'MXRF11', assetClass: 'fii' as const };
const ZZZZ3 = { id: 'a-zzzz3', ticker: 'ZZZZ3', assetClass: 'stock' as const };

const petr4Page = stockPage({
  historyId: 4,
  groups: [['Valuation', [['P/L', '4,55']]]],
  dividends: [['JSCP', '21/08/2026', '21/12/2026', '0,20250435']],
});
const mxrf11Page = fiiPage({
  ticker: 'MXRF11',
  cards: [['P/VP', '0,90']],
  cells: [['TIPO DE FUNDO', 'Fundo de Papel']],
  dividends: [['Dividendos', '30/10/2026', '16/11/2026', '0,095']],
});

describe('coleta do Investidor10 (SPEC-041)', () => {
  let source: FakeInvestidor10Source;
  let fundamentals: InMemoryFundamentals;
  let runs: InMemoryTaskRuns;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let now: Date;

  const collection = (enabled = true) =>
    new Investidor10Collection({
      enabled,
      source,
      fundamentals,
      runs,
      clock: () => now,
      sleep,
      pauseMs: 3000,
    });

  beforeEach(() => {
    source = new FakeInvestidor10Source();
    fundamentals = new InMemoryFundamentals([PETR4, MXRF11, ZZZZ3]);
    runs = new InMemoryTaskRuns();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    now = new Date('2026-11-08T06:00:00Z'); // domingo, 03:00 em Brasília
    source.pages.set('acoes/petr4', petr4Page);
    source.pages.set('fiis/mxrf11', mxrf11Page);
    source.histories.set(4, { 'P/L': [{ year: '2025', value: 3.6 }] });
  });

  it('visita cada ativo uma vez, uma consulta a cada 3 s, e grava tudo de cada um (CA03, CA05)', async () => {
    const result = await collection().run('all');

    expect(source.requests).toEqual(['fiis/mxrf11', 'acoes/petr4', 'historico/4', 'acoes/zzzz3']);
    // Pausa antes de cada consulta, menos a primeira.
    expect(sleep.mock.calls).toEqual([[3000], [3000], [3000]]);
    expect(result).toMatchObject({ status: 'sucesso', records: 2, requests: 4 });
    expect(result?.totals).toMatchObject({ collected: 2, noPage: 1 });

    const petr4 = fundamentals.saved.get(PETR4.id)?.collection;
    expect(Object.fromEntries(petr4?.current ?? [])).toEqual({ p_l: '4.55' });
    expect(Object.fromEntries(petr4?.history.get('p_l') ?? [])).toEqual({ '2025': '3.6' });
    expect(petr4?.dividends).toHaveLength(1);
    expect(fundamentals.saved.get(MXRF11.id)?.collection.fund?.fundType).toBe('Fundo de Papel');
    expect(fundamentals.visits.get(ZZZZ3.id)?.status).toBe('sem_pagina');
  });

  it('os mais negociados primeiro; sem volume, por último, na ordem do ticker (05/11/2026)', async () => {
    const volumes = new Map([
      [PETR4.id, '3265521701.00'],
      [MXRF11.id, '31213326.76'],
    ]);
    await new Investidor10Collection({
      enabled: true,
      source,
      fundamentals,
      runs,
      volumes: { lastVolumes: () => Promise.resolve(volumes) },
      clock: () => now,
      sleep,
      pauseMs: 3000,
    }).run('all');
    expect(source.requests).toEqual(['acoes/petr4', 'historico/4', 'fiis/mxrf11', 'acoes/zzzz3']);
  });

  it('interruptor desligado: nenhuma visita ao site (CA04)', async () => {
    expect(await collection(false).run('all')).toBeNull();
    expect(source.requests).toEqual([]);
    expect(runs.runs).toEqual([]);
  });

  it('fora do domingo, só os nunca visitados; sem nenhum, não grava execução', async () => {
    await collection().run('all');
    now = new Date('2026-11-09T06:00:00Z'); // segunda
    source.requests.length = 0;
    expect(await collection().scheduled()).toBeNull();
    expect(source.requests).toEqual([]);
  });

  it('403 ou 429: a coleta para ali, como parcial, até a próxima semana (CA03)', async () => {
    source.failures = [new Investidor10SourceError('blocked', 'Investidor10 recusou (429)')];
    const result = await collection().run('all');
    expect(result?.status).toBe('falha');
    expect(source.requests).toEqual(['fiis/mxrf11']);

    source.failures = [];
    source.pages.set('acoes/zzzz3', petr4Page);
    source.requests.length = 0;
    // Bloqueado no segundo: o primeiro fica gravado e a execução é parcial.
    const order = ['fiis/mxrf11', 'acoes/petr4'];
    vi.spyOn(source, 'page').mockImplementation((path) => {
      source.requests.push(path);
      if (path === order[1]) return Promise.reject(new Investidor10SourceError('blocked', '403'));
      return Promise.resolve(source.pages.get(path) ?? null);
    });
    const second = await collection().run('all');
    expect(second?.status).toBe('parcial');
    expect(second?.records).toBe(1);
  });

  it('página sem a tabela (site mudou) não grava o ativo; mais da metade assim para a coleta (CA02)', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `a-${i}`,
      ticker: `TEST${i + 10}`.slice(0, 6),
      assetClass: 'stock' as const,
    }));
    fundamentals = new InMemoryFundamentals(many);
    for (const asset of many)
      source.pages.set(`acoes/${asset.ticker.toLowerCase()}`, '<html></html>');

    const result = await collection().run('all');

    expect(result?.status).toBe('falha');
    expect(fundamentals.saved.size).toBe(0);
    expect(result?.totals).toMatchObject({ layoutErrors: 10 });
    expect(result?.errors.at(-1)?.message).toContain('o site mudou');
  });

  it('rede ou 5xx: 3 novas tentativas por página', async () => {
    source.failures = [
      new Investidor10SourceError('retryable', '503'),
      new Investidor10SourceError('retryable', '503'),
    ];
    const result = await collection().run('all');
    expect(result?.status).toBe('sucesso');
    expect(source.requests.slice(0, 3)).toEqual(['fiis/mxrf11', 'fiis/mxrf11', 'fiis/mxrf11']);
  });
});
