import type {
  CalendarPublication,
  CalendarSuggestion,
  TradingCalendarYear,
} from '@simulador/shared';
import { TradingCalendar } from '../../financial-calculation/trading-calendar.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import type { CalendarRepository, StoredCalendarYear } from './ports.js';

export interface CalendarServiceDeps {
  calendars: CalendarRepository;
  clock?: () => Date;
}

/** Calendário de pregão (SPEC-005): consulta, sugestão e publicação pelo colaborador. */
export class CalendarService {
  private readonly clock: () => Date;

  constructor(private readonly deps: CalendarServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Qualquer pessoa conectada: ano não publicado vem com `published: false` e lista vazia. */
  async getYear(year: number): Promise<TradingCalendarYear> {
    const stored = await this.deps.calendars.findYear(year);
    return stored
      ? toPublic(stored)
      : { year, published: false, publishedAt: null, nonTradingDays: [] };
  }

  /** Colaborador: ponto de partida para conferir com o calendário oficial da B3. */
  suggest(year: number): CalendarSuggestion {
    return { year, nonTradingDays: suggestNonTradingDays(year) };
  }

  /**
   * Colaborador: publica (ou republica) o ano. A lista já chega validada (CA05). A auditoria guarda
   * a lista anterior e a nova (SPEC-006, RNF15).
   */
  async publish(
    year: number,
    publication: CalendarPublication,
    collaboratorId: string,
  ): Promise<TradingCalendarYear> {
    const now = this.clock();
    const after = publication.nonTradingDays.map(({ date, reason }) => ({ date, reason }));
    const stored = await this.deps.calendars.publish(
      { year, publishedAt: now, publishedBy: collaboratorId, nonTradingDays: after },
      (before) => ({
        at: now,
        collaboratorId,
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: String(year),
        details: { before: before?.map(({ date, reason }) => ({ date, reason })) ?? null, after },
      }),
    );
    return toPublic(stored);
  }

  /**
   * Regras de pregão para os anos de `from` a `to` (para as cotações e os lançamentos). Carrega
   * também o ano antes e o depois, para o pregão anterior e o próximo na virada do ano. Pergunta
   * sobre ano não publicado falha com CalendarNotPublishedError (SPEC-005 §4, CA07).
   */
  async tradingCalendar(from: number, to: number): Promise<TradingCalendar> {
    return new TradingCalendar(
      (await this.deps.calendars.findYears(from - 1, to + 1)).map((stored) => ({
        year: stored.year,
        nonTradingDays: stored.nonTradingDays.map((day) => day.date),
      })),
    );
  }
}

function toPublic(stored: StoredCalendarYear): TradingCalendarYear {
  return {
    year: stored.year,
    published: true,
    publishedAt: stored.publishedAt.toISOString(),
    nonTradingDays: stored.nonTradingDays,
  };
}
