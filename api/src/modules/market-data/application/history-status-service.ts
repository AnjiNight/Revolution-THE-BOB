import {
  HISTORY_START_YEAR,
  isoDateInBrasilia,
  yearOf,
  type AssetHistory,
} from '@simulador/shared';
import { historyStatus } from '../domain/history-status.js';
import type { CalendarRepository, QuoteRepository } from './ports.js';

export interface HistoryOverview {
  byAsset: Map<string, AssetHistory>;
  yearsWithoutCalendar: number[];
}

export interface HistoryStatusServiceDeps {
  quotes: QuoteRepository;
  calendars: CalendarRepository;
  clock?: () => Date;
}

/** Situação do histórico de cada ativo e anos da janela ainda sem calendário (SPEC-008 §5.2). */
export class HistoryStatusService {
  private readonly clock: () => Date;

  constructor(private readonly deps: HistoryStatusServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async overview(): Promise<HistoryOverview> {
    const currentYear = yearOf(isoDateInBrasilia(this.clock()));
    const [published, assets, loaded, ranges] = await Promise.all([
      this.deps.calendars.findYears(HISTORY_START_YEAR, currentYear),
      this.deps.quotes.listAssets(),
      this.deps.quotes.loadedYears(),
      this.deps.quotes.quoteRanges(),
    ]);
    const publishedYears = published.map((stored) => stored.year);
    const byAsset = new Map(
      assets.map((asset) => [
        asset.id,
        historyStatus(ranges.get(asset.id), loaded.get(asset.id), publishedYears),
      ]),
    );
    const yearsWithoutCalendar: number[] = [];
    for (let year = HISTORY_START_YEAR; year <= currentYear; year += 1) {
      if (!publishedYears.includes(year)) yearsWithoutCalendar.push(year);
    }
    return { byAsset, yearsWithoutCalendar };
  }
}
