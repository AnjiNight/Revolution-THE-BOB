import {
  HISTORY_START_YEAR,
  INDEX_STALE_TRADING_DAYS,
  isoDateInBrasilia,
  MARKET_INDEX_CODES,
  yearOf,
  type MarketIndexStatus,
} from '@simulador/shared';
import { businessDaysBefore, businessDaysBetween, tradingDaysWithoutRate } from '../domain/cdi.js';
import { nonBusinessDays } from './cdi-ingestion.js';
import type { CalendarRepository, MarketIndexRepository, TaskRunReader } from './ports.js';

export interface MarketIndexStatusServiceDeps {
  indexes: MarketIndexRepository;
  runs: TaskRunReader;
  calendars: CalendarRepository;
  clock?: () => Date;
}

/** Situação do Ibovespa e do IFIX para o Início do colaborador (SPEC-020 §5.2 e §5.3). */
export class MarketIndexStatusService {
  private readonly clock: () => Date;

  constructor(private readonly deps: MarketIndexStatusServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async status(): Promise<MarketIndexStatus> {
    const today = isoDateInBrasilia(this.clock());
    const [lastRun, published] = await Promise.all([
      this.deps.runs.lastRun('indices_b3'),
      this.deps.calendars.findYears(HISTORY_START_YEAR, yearOf(today)),
    ]);
    const nonBusiness = nonBusinessDays(published);
    const until = businessDaysBefore(today, INDEX_STALE_TRADING_DAYS, nonBusiness);
    const years = published.map((stored) => ({
      year: stored.year,
      nonTradingDays: stored.nonTradingDays.map((day) => day.date),
    }));
    const indexes = await Promise.all(
      MARKET_INDEX_CODES.map(async (code) => {
        const index = await this.deps.indexes.findIndex(code);
        const dates = index ? await this.deps.indexes.closeDates(index.id) : [];
        const to = dates.at(-1) ?? null;
        return {
          code,
          from: dates[0] ?? null,
          to,
          days: dates.length,
          stale:
            to !== null && businessDaysBetween(to, today, nonBusiness) > INDEX_STALE_TRADING_DAYS,
          // Sem nenhum dado, a tela diz "carregando": não conta os pregões que faltam.
          missingTradingDays:
            dates.length === 0 ? 0 : tradingDaysWithoutRate(years, new Set(dates), until).length,
        };
      }),
    );
    // A tarefa nunca termina como cota_esgotada; uma execução em andamento ainda não conta.
    const status = lastRun?.status;
    return {
      indexes,
      lastRun:
        lastRun?.finishedAt && status && status !== 'cota_esgotada'
          ? { at: lastRun.finishedAt.toISOString(), status }
          : null,
    };
  }
}
