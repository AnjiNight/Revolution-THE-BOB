import {
  CDI_STALE_BUSINESS_DAYS,
  HISTORY_START_YEAR,
  isoDateInBrasilia,
  yearOf,
  type CdiStatus,
} from '@simulador/shared';
import { businessDaysBefore, businessDaysBetween, tradingDaysWithoutRate } from '../domain/cdi.js';
import { CDI_CODE, nonBusinessDays } from './cdi-ingestion.js';
import type { CalendarRepository, IndexRateRepository, TaskRunReader } from './ports.js';

export interface CdiStatusServiceDeps {
  rates: IndexRateRepository;
  runs: TaskRunReader;
  calendars: CalendarRepository;
  clock?: () => Date;
}

/** Situação da série do CDI para o Início do colaborador (SPEC-007 §5.2 e §5.3). */
export class CdiStatusService {
  private readonly clock: () => Date;

  constructor(private readonly deps: CdiStatusServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async status(): Promise<CdiStatus> {
    const today = isoDateInBrasilia(this.clock());
    const indexer = await this.deps.rates.findIndexer(CDI_CODE);
    const [dates, lastRun, published] = await Promise.all([
      indexer ? this.deps.rates.rateDates(indexer.id) : Promise.resolve([]),
      this.deps.runs.lastRun('cdi_diario'),
      this.deps.calendars.findYears(HISTORY_START_YEAR, yearOf(today)),
    ]);
    const nonBusiness = nonBusinessDays(published);
    const to = dates.at(-1) ?? null;
    const missing = tradingDaysWithoutRate(
      published.map((stored) => ({
        year: stored.year,
        nonTradingDays: stored.nonTradingDays.map((day) => day.date),
      })),
      new Set(dates),
      businessDaysBefore(today, CDI_STALE_BUSINESS_DAYS, nonBusiness),
    );
    // A tarefa nunca termina como cota_esgotada; uma execução em andamento ainda não conta.
    const status = lastRun?.status;
    return {
      from: dates[0] ?? null,
      to,
      days: dates.length,
      lastRun:
        lastRun?.finishedAt && status && status !== 'cota_esgotada'
          ? { at: lastRun.finishedAt.toISOString(), status }
          : null,
      stale: to !== null && businessDaysBetween(to, today, nonBusiness) > CDI_STALE_BUSINESS_DAYS,
      missingTradingDays: missing.length,
    };
  }
}
