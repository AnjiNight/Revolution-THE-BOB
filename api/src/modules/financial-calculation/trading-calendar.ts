import { addDays, isIsoDate, isWeekend, yearOf, type IsoDate } from '@simulador/shared';
import { DomainError } from '../../shared/domain/domain-error.js';

/**
 * SPEC-005 §4: o ano não tem calendário publicado pela equipe, então ninguém adivinha se houve
 * pregão. Quem usa o calendário (cotações, lançamentos) recusa a operação com este erro.
 */
export class CalendarNotPublishedError extends DomainError {
  readonly code = 'calendar_not_published';

  constructor(readonly year: number) {
    super(`calendário de pregão de ${year} não publicado`);
  }
}

/** Um ano publicado: os dias úteis sem pregão (fins de semana nunca entram). */
export interface PublishedCalendarYear {
  year: number;
  nonTradingDays: Iterable<IsoDate>;
}

/**
 * Regras de pregão da RB11 (SPEC-005 §5.1), no núcleo de cálculo puro (DA10): recebe os anos
 * publicados e responde sem banco nem rede. Datas sempre como AAAA-MM-DD do dia em Brasília.
 */
export class TradingCalendar {
  private readonly years = new Map<number, ReadonlySet<IsoDate>>();

  constructor(published: Iterable<PublishedCalendarYear>) {
    for (const { year, nonTradingDays } of published) this.years.set(year, new Set(nonTradingDays));
  }

  /** Segunda a sexta e fora da lista do ano. Fim de semana não precisa do ano publicado. */
  isTradingDay(date: IsoDate): boolean {
    assertDate(date);
    if (isWeekend(date)) return false;
    return !this.closedDays(yearOf(date)).has(date);
  }

  /** Pregões de `start` a `end`, incluindo os dois; 0 se `start` vier depois de `end`. */
  countTradingDays(start: IsoDate, end: IsoDate): number {
    assertDate(start);
    assertDate(end);
    let count = 0;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (this.isTradingDay(day)) count += 1;
    }
    return count;
  }

  /** O pregão mais perto antes da data (a própria data não conta). */
  previousTradingDay(date: IsoDate): IsoDate {
    return this.step(date, -1);
  }

  /** O pregão mais perto depois da data (a própria data não conta). */
  nextTradingDay(date: IsoDate): IsoDate {
    return this.step(date, 1);
  }

  // Termina: um ano tem no máximo 100 dias na lista e uns 260 dias úteis; um ano sem
  // calendário interrompe com CalendarNotPublishedError.
  private step(date: IsoDate, direction: 1 | -1): IsoDate {
    assertDate(date);
    let day = addDays(date, direction);
    while (!this.isTradingDay(day)) day = addDays(day, direction);
    return day;
  }

  private closedDays(year: number): ReadonlySet<IsoDate> {
    const days = this.years.get(year);
    if (!days) throw new CalendarNotPublishedError(year);
    return days;
  }
}

function assertDate(date: IsoDate): void {
  if (!isIsoDate(date)) throw new RangeError(`data inválida: "${date}" (use AAAA-MM-DD)`);
}
