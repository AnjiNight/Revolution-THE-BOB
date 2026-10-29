import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import { cotahistLine, type CotahistLineFields } from '../testing/cotahist-fixtures.js';
import {
  FakeCotahistSource,
  InMemoryCalendarRepository,
  InMemoryQuoteRepository,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { HistoryIngestion, RETRY_DELAYS_MS } from './history-ingestion.js';

const PETR4 = { id: 'a-petr4', ticker: 'PETR4' };
const MXRF11 = { id: 'a-mxrf11', ticker: 'MXRF11' };
const VALE3 = { id: 'a-vale3', ticker: 'VALE3' };

/** Cotação no formato do arquivo: preço em centavos, fechamento = `close`. */
function q(ticker: string, date: string, close = 1000): CotahistLineFields {
  return {
    ticker,
    date: date.replaceAll('-', ''),
    open: close,
    high: close + 10,
    low: close - 10,
    average: close,
    close,
  };
}

describe('carga do histórico (SPEC-008)', () => {
  let source: FakeCotahistSource;
  let quotes: InMemoryQuoteRepository;
  let runs: InMemoryTaskRuns;
  let calendars: InMemoryCalendarRepository;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let now: Date;
  let ingestion: HistoryIngestion;

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

  beforeEach(async () => {
    source = new FakeCotahistSource();
    quotes = new InMemoryQuoteRepository();
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    now = new Date('2026-10-29T12:00:00Z'); // 09:00 em Brasília
    ingestion = new HistoryIngestion({ source, quotes, runs, calendars, clock: () => now, sleep });
    await publish(2025);
    await publish(2026);
    quotes.assets.push(PETR4, MXRF11);
  });

  describe('carga retroativa', () => {
    it('lê os anos publicados, só para os tickers do catálogo, e marca os anos lidos (CA02)', async () => {
      source.annualFiles.set(2025, [q('PETR4', '2025-12-30', 3000), q('ITUB4', '2025-12-30')]);
      source.annualFiles.set(2026, [
        q('PETR4', '2026-10-28', 3851),
        q('MXRF11', '2026-10-28', 992),
      ]);

      const result = await ingestion.loadRetroactive();

      // Ano fechado pode ficar guardado; o ano em andamento (*) não.
      expect(source.requests).toEqual(['A2025', 'A2026*']);
      expect(quotes.closesOf(PETR4.id)).toEqual([
        ['2025-12-30', '30.000000'],
        ['2026-10-28', '38.510000'],
      ]);
      expect(quotes.closesOf(MXRF11.id)).toEqual([['2026-10-28', '9.920000']]);
      expect(quotes.quotes.size).toBe(3); // ITUB4 não está no catálogo
      // MXRF11 não tem cotação em 2025, mas o ano conta como lido.
      expect(quotes.loaded.get(MXRF11.id)).toEqual(new Set([2025, 2026]));
      expect(result).toEqual({
        status: 'sucesso',
        records: 3,
        affectedAssets: 2,
        periodStart: '2025-12-30',
        periodEnd: '2026-10-28',
        errors: [],
      });
      expect(runs.runs).toEqual([
        { id: 'run-1', task: 'historico_retroativo', result: expect.objectContaining(result) },
      ]);
    });

    it('sem trabalho não grava execução; ativo novo carrega só o que falta para ele', async () => {
      source.annualFiles.set(2025, [q('PETR4', '2025-12-30'), q('VALE3', '2025-12-30')]);
      source.annualFiles.set(2026, [q('PETR4', '2026-10-28'), q('VALE3', '2026-10-28')]);
      await ingestion.loadRetroactive();

      expect(await ingestion.loadRetroactive()).toBeNull();
      expect(runs.runs).toHaveLength(1);

      quotes.assets.push(VALE3);
      const result = await ingestion.loadRetroactive();
      expect(result).toMatchObject({ records: 2, affectedAssets: 1 });
      expect(quotes.closesOf(VALE3.id)).toHaveLength(2);
    });

    it('rodar de novo a mesma carga não duplica nem muda nada (CA04)', async () => {
      source.annualFiles.set(2026, [q('PETR4', '2026-10-28', 3851)]);
      await ingestion.loadRetroactive();
      const before = structuredClone([...quotes.quotes.entries()]);
      quotes.loaded.clear();
      await ingestion.loadRetroactive();
      expect([...quotes.quotes.entries()]).toEqual(before);
    });

    it('só carrega anos com calendário publicado e anos da janela (desde 2016)', async () => {
      await publish(2015);
      source.annualFiles.set(2024, [q('PETR4', '2024-12-30')]);
      await ingestion.loadRetroactive();
      expect(source.requests).toEqual(['A2025', 'A2026*']);
    });

    it('cotação em dia sem pregão no calendário é recusada e registrada (CA06)', async () => {
      const line = cotahistLine(q('PETR4', '2025-12-31'));
      source.annualFiles.set(2025, [line, cotahistLine(q('PETR4', '2025-12-30'))]);
      source.annualFiles.set(2026, []);
      const result = await ingestion.loadRetroactive();
      expect(quotes.closesOf(PETR4.id).map(([date]) => date)).toEqual(['2025-12-30']);
      expect(result?.status).toBe('parcial');
      expect(result?.errors).toEqual([
        {
          message: 'cotação em 2025-12-31, dia sem pregão no calendário',
          assetId: PETR4.id,
          date: '2025-12-31',
        },
      ]);
    });

    it('linha malformada vira erro com o ativo, sem derrubar o arquivo (CA01)', async () => {
      const good = cotahistLine(q('PETR4', '2026-10-27'));
      const bad = `${good.slice(0, 56)}00000000ABC12${good.slice(69)}`.replace(
        '20261027',
        '20261026',
      );
      source.annualFiles.set(2026, [bad, good]);
      const result = await ingestion.loadRetroactive();
      expect(quotes.closesOf(PETR4.id)).toHaveLength(1);
      expect(result?.errors[0]).toMatchObject({ assetId: PETR4.id, date: '2026-10-26' });
      expect(result?.errors[0]?.message).toMatch(/linha inválida/);
    });

    it('B3 fora do ar: 3 novas tentativas com espera, falha registrada e o ano fica para depois (CA07)', async () => {
      source.annualFiles.set(2025, 'fail');
      source.annualFiles.set(2026, 'fail');
      const result = await ingestion.loadRetroactive();
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([...RETRY_DELAYS_MS, ...RETRY_DELAYS_MS]);
      expect(source.requests).toHaveLength(8);
      expect(result?.status).toBe('falha');
      expect(result?.errors.map((e) => e.message)).toEqual([
        'arquivo anual de 2025: B3 respondeu 503',
        'arquivo anual de 2026: B3 respondeu 503',
      ]);
      expect(quotes.loaded.size).toBe(0);

      // Na próxima verificação, a B3 voltou.
      source.annualFiles.set(2025, [q('PETR4', '2025-12-30')]);
      source.annualFiles.set(2026, [q('PETR4', '2026-10-28')]);
      expect((await ingestion.loadRetroactive())?.status).toBe('sucesso');
    });

    it('um ano falhando e outro lendo termina como parcial', async () => {
      source.annualFiles.set(2025, 'fail');
      source.annualFiles.set(2026, [q('PETR4', '2026-10-28')]);
      const result = await ingestion.loadRetroactive();
      expect(result).toMatchObject({ status: 'parcial', records: 1 });
      expect(quotes.loaded.get(PETR4.id)).toEqual(new Set([2026]));
    });

    it('guarda no máximo 100 erros por execução e resume o resto', async () => {
      const bad = Array.from({ length: 150 }, () => cotahistLine(q('PETR4', '2025-12-31')));
      source.annualFiles.set(2025, bad);
      const result = await ingestion.loadRetroactive();
      expect(result?.errors).toHaveLength(101);
      expect(result?.errors.at(-1)?.message).toBe('mais 50 erros não guardados');
    });
  });

  describe('atualização diária', () => {
    beforeEach(async () => {
      source.annualFiles.set(2025, [q('PETR4', '2025-12-30')]);
      source.annualFiles.set(2026, [q('PETR4', '2026-10-23'), q('MXRF11', '2026-10-26')]);
      await ingestion.loadRetroactive();
      source.requests.length = 0;
    });

    it('lê os pregões depois do último guardado até ontem, pulando o fim de semana (CA03)', async () => {
      source.dailyFiles.set('2026-10-26', [q('PETR4', '2026-10-26', 3700)]);
      source.dailyFiles.set('2026-10-27', [q('PETR4', '2026-10-27'), q('MXRF11', '2026-10-27')]);
      source.dailyFiles.set('2026-10-28', [q('PETR4', '2026-10-28'), q('MXRF11', '2026-10-28')]);

      const result = await ingestion.updateDaily();

      // Começa no dia seguinte ao último pregão mais antigo entre os ativos (PETR4, 23/10).
      expect(source.requests).toEqual(['D2026-10-26', 'D2026-10-27', 'D2026-10-28']);
      expect(result).toMatchObject({
        status: 'sucesso',
        records: 5,
        affectedAssets: 2,
        periodStart: '2026-10-26',
        periodEnd: '2026-10-28',
      });
      expect(runs.runs.at(-1)?.task).toBe('fechamento_diario');
      expect(await ingestion.updateDaily()).toBeNull();
    });

    it('arquivo do dia ainda não publicado: para ali, sem erro (CA07)', async () => {
      source.dailyFiles.set('2026-10-26', [q('PETR4', '2026-10-26')]);
      const result = await ingestion.updateDaily();
      expect(source.requests).toEqual(['D2026-10-26', 'D2026-10-27']);
      expect(result).toMatchObject({ status: 'sucesso', records: 1, errors: [] });

      // Só o 26 de PETR4 entrou; o mais antigo agora é MXRF11 (26/10): tenta o 27 de novo.
      source.requests.length = 0;
      const waiting = await ingestion.updateDaily();
      expect(source.requests).toEqual(['D2026-10-27']);
      expect(waiting).toMatchObject({ status: 'aguardando_publicacao', records: 0, errors: [] });
    });

    it('cotação de outro dia dentro do arquivo diário é recusada', async () => {
      source.dailyFiles.set('2026-10-26', [q('PETR4', '2026-10-27')]);
      const result = await ingestion.updateDaily();
      expect(result?.errors[0]?.message).toBe(
        'cotação de 2026-10-27 no arquivo do pregão de 2026-10-26',
      );
    });

    it('ano sem calendário publicado interrompe a atualização com erro', async () => {
      calendars.years.delete(2026);
      now = new Date('2027-01-05T12:00:00Z');
      quotes.quotes.clear();
      await quotes.save(
        [
          {
            assetId: PETR4.id,
            date: '2026-12-30',
            open: '1',
            high: '1',
            low: '1',
            close: '1',
            average: '1',
            trades: 1,
            volume: '1.00',
          },
        ],
        'b3_cotahist',
      );
      await publish(2026);
      const result = await ingestion.updateDaily();
      expect(result?.errors).toEqual([
        {
          message: 'calendário de pregão de 2027 não publicado',
          assetId: null,
          date: '2027-01-01',
        },
      ]);
    });

    it('ativo que nunca teve a carga retroativa não entra na atualização', async () => {
      quotes.assets.push(VALE3);
      source.dailyFiles.set('2026-10-26', [q('VALE3', '2026-10-26')]);
      await ingestion.updateDaily();
      expect(quotes.closesOf(VALE3.id)).toEqual([]);
    });
  });

  describe('precedência entre fontes (CA05)', () => {
    const quote = {
      assetId: PETR4.id,
      date: '2026-10-28',
      open: '38.000000',
      high: '39.000000',
      low: '37.000000',
      average: '38.000000',
      trades: 10,
      volume: '100.00',
    };

    it('a B3 substitui outra fonte; outra fonte nunca substitui a B3', async () => {
      await quotes.save([{ ...quote, close: '38.400000' }], 'brapi');
      await quotes.save([{ ...quote, close: '38.510000' }], 'b3_cotahist');
      expect(quotes.closesOf(PETR4.id)).toEqual([['2026-10-28', '38.510000']]);
      expect(await quotes.save([{ ...quote, close: '38.900000' }], 'brapi')).toBe(0);
      expect(quotes.closesOf(PETR4.id)).toEqual([['2026-10-28', '38.510000']]);
    });
  });
});
