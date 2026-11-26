import { beforeEach, describe, expect, it } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import {
  FakeMarketQuoteSource,
  InMemoryCalendarRepository,
  InMemoryMarketQuotes,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { MarketQuoteSourceError } from './ports.js';
import { MarketTodayCollection } from './market-today.js';

/** Segunda, 23/11/2026, dia de pregão (fechamento às 18h, fora do horário de verão dos EUA). */
const at = (brasilia: string, day = '2026-11-23') => new Date(`${day}T${brasilia}:00-03:00`);

describe('"Mercado hoje" pela Yahoo (SPEC-048)', () => {
  let now: Date;
  let source: FakeMarketQuoteSource;
  let quotes: InMemoryMarketQuotes;
  let runs: InMemoryTaskRuns;
  let calendars: InMemoryCalendarRepository;
  let market: MarketTodayCollection;

  const publish = (year: number) =>
    calendars.publish(
      {
        year,
        publishedAt: new Date(),
        publishedBy: 'colab',
        nonTradingDays: suggestNonTradingDays(year),
      },
      () => ({
        at: new Date(),
        collaboratorId: 'colab',
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: String(year),
        details: {},
      }),
    );

  /** A Yahoo responde com o horário de agora (menos o atraso de 15 minutos do Ibovespa). */
  const answer = () => {
    source.answers.set('ibovespa', {
      at: new Date(now.getTime() - 15 * 60_000),
      value: '166376.44',
      previousClose: '167538',
    });
    source.answers.set('dollar', { at: now, value: '5.9074', previousClose: '5.9052' });
  };

  beforeEach(() => {
    now = at('09:00');
    source = new FakeMarketQuoteSource();
    quotes = new InMemoryMarketQuotes();
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    market = new MarketTodayCollection({ source, quotes, runs, calendars, clock: () => now });
  });

  it('às 09:00 só o dólar; às 10:00 os dois; às 10:15 só o Ibovespa (CA01)', async () => {
    answer();
    const first = await market.collect();
    expect(source.asked).toEqual(['dollar']);
    expect(first).toMatchObject({ status: 'sucesso', records: 1 });

    now = at('09:04');
    expect(await market.collect()).toBeNull();

    now = at('10:02');
    answer();
    await market.collect();
    expect(source.asked.slice(1)).toEqual(['ibovespa', 'dollar']);

    now = at('10:16');
    answer();
    await market.collect();
    expect(source.asked.slice(3)).toEqual(['ibovespa']);
    expect(runs.runs.every((run) => run.task === 'mercado_yahoo')).toBe(true);
    expect(runs.runs).toHaveLength(3);
  });

  it('o Ibovespa até 30 minutos depois do fechamento; o dólar até 18:30', async () => {
    answer();
    now = at('18:29');
    await market.collect();
    expect(source.asked).toEqual(['ibovespa', 'dollar']);
    now = at('18:30');
    answer();
    await market.collect();
    expect(source.asked.slice(2)).toEqual(['ibovespa', 'dollar']);
    now = at('19:00');
    expect(await market.collect()).toBeNull();
  });

  it('feriado do calendário: só o dólar; fim de semana: nenhum', async () => {
    await publish(2026);
    // 25/12/2026, sexta: Natal, sem pregão (o dólar segue nos dias úteis).
    now = at('11:00', '2026-12-25');
    answer();
    await market.collect();
    expect(source.asked).toEqual(['dollar']);

    now = at('11:00', '2026-11-21');
    expect(await market.collect()).toBeNull();
  });

  it('"Executar agora" coleta os dois a qualquer hora, até no sábado', async () => {
    now = at('11:00', '2026-11-21');
    answer();
    const result = await market.collect({ force: true });
    expect(source.asked).toEqual(['ibovespa', 'dollar']);
    expect(result).toMatchObject({ status: 'sucesso', records: 2 });
  });

  it('a Yahoo fora do ar: falha registrada e nova tentativa só na vez seguinte (CA04)', async () => {
    now = at('10:01');
    const failed = await market.collect();
    expect(failed).toMatchObject({ status: 'falha', records: 0 });
    expect(failed?.errors.map((error) => error.message)).toEqual([
      'Ibovespa: Yahoo fora do ar (teste)',
      'dólar: Yahoo fora do ar (teste)',
    ]);
    now = at('10:06');
    expect(await market.collect()).toBeNull();

    // Um só com dados: parcial.
    now = at('10:31');
    source.answers.set('dollar', { at: now, value: '5.91', previousClose: '5.9' });
    source.answers.set(
      'ibovespa',
      new MarketQuoteSourceError('no_data', 'Yahoo sem dados de ^BVSP'),
    );
    expect(await market.collect()).toMatchObject({ status: 'parcial', records: 1 });
  });

  it('o painel: valor, variação e horário; null sem leitura (CA02)', async () => {
    expect(await market.today()).toEqual({ ibovespa: null, dollar: null });
    now = at('14:20');
    answer();
    await market.collect({ force: true });
    expect(await market.today()).toEqual({
      ibovespa: {
        value: '166376.44',
        previousClose: '167538',
        change: '-0.69',
        at: at('14:05').toISOString(),
        stale: false,
      },
      dollar: {
        value: '5.9074',
        previousClose: '5.9052',
        change: '0.04',
        at: at('14:20').toISOString(),
        stale: false,
      },
    });
  });

  it('desatualizado: uma coleta perdida no horário do mercado, nunca com ele fechado (CA04)', async () => {
    now = at('10:46');
    answer();
    await market.collect();
    source.answers.clear();

    // 11:00 falhou; às 11:12 o Ibovespa já passou da vez (15 min + 10 de folga).
    now = at('11:01');
    await market.collect();
    now = at('11:12');
    let today = await market.today();
    expect(today.ibovespa?.stale).toBe(true);
    expect(today.dollar?.stale).toBe(false);

    // O dólar passa da vez dele (30 min + 10 de folga) às 11:26.
    now = at('11:27');
    today = await market.today();
    expect(today.dollar?.stale).toBe(true);

    // Sábado: a última leitura vale, sem o aviso.
    now = at('11:00', '2026-11-28');
    today = await market.today();
    expect(today.ibovespa?.stale).toBe(false);
    expect(today.dollar?.stale).toBe(false);
  });

  it('leitura velha (mais de 2 horas) no horário do mercado também está desatualizada', async () => {
    now = at('13:00');
    source.answers.set('ibovespa', { at: at('10:30'), value: '166000', previousClose: '167538' });
    await market.collect({ force: true });
    expect((await market.today()).ibovespa?.stale).toBe(true);
  });

  it('apaga as leituras de mais de 30 dias (CA05)', async () => {
    await quotes.save({
      symbol: 'dollar',
      at: at('10:00', '2026-10-20'),
      value: '5.5',
      previousClose: null,
      collectedAt: at('10:00', '2026-10-20'),
    });
    await quotes.save({
      symbol: 'dollar',
      at: at('10:00', '2026-11-20'),
      value: '5.9',
      previousClose: null,
      collectedAt: at('10:00', '2026-11-20'),
    });
    expect(await market.cleanup()).toBe(1);
    expect(quotes.rows).toHaveLength(1);
  });
});
