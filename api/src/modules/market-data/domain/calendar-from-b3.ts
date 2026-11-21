import {
  addDays,
  isoDate,
  isWeekend,
  monthOf,
  yearOf,
  type IsoDate,
  type NonTradingDay,
} from '@simulador/shared';
import { suggestNonTradingDays } from './calendar-suggestion.js';

/**
 * Calendário de um ano fechado a partir do arquivo anual da B3 (SPEC-005 §10). Puro: recebe os
 * pregões que apareceram no arquivo, não sabe de arquivo nem de rede.
 */

/** Um ano tem uns 250 pregões: menos que isto é arquivo cortado, não calendário. */
export const MIN_SESSIONS_PER_YEAR = 200;

/** Fallback do motivo, quando nem a sugestão nem os feriados de São Paulo explicam o dia. */
export const B3_FILE_REASON = 'Sem pregão no arquivo da B3';

/** Feriados de São Paulo em que a B3 fechava até 2021 (SPEC-005 §4); só dão nome ao dia. */
const SAO_PAULO_HOLIDAYS: ReadonlyArray<{ month: number; day: number; reason: string }> = [
  { month: 1, day: 25, reason: 'Aniversário de São Paulo' },
  { month: 7, day: 9, reason: 'Revolução Constitucionalista' },
  { month: 11, day: 20, reason: 'Consciência Negra em São Paulo' },
];

export class B3CalendarFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'B3CalendarFileError';
  }
}

/**
 * Dias úteis do ano que não aparecem no arquivo, com o motivo. Lança B3CalendarFileError quando o
 * arquivo não serve de calendário: pregão de outro ano, em fim de semana ou poucos pregões (CA15).
 */
export function nonTradingDaysFromSessions(
  year: number,
  sessions: ReadonlySet<IsoDate>,
): NonTradingDay[] {
  const outside = [...sessions].filter((date) => yearOf(date) !== year).sort();
  if (outside.length > 0) {
    throw new B3CalendarFileError(`arquivo de ${year} com pregão em ${outside[0]}`);
  }
  const weekend = [...sessions].filter(isWeekend).sort();
  if (weekend.length > 0) {
    throw new B3CalendarFileError(`arquivo de ${year} com pregão no fim de semana (${weekend[0]})`);
  }
  if (sessions.size < MIN_SESSIONS_PER_YEAR) {
    throw new B3CalendarFileError(
      `arquivo de ${year} com só ${sessions.size} pregões (mínimo ${MIN_SESSIONS_PER_YEAR})`,
    );
  }

  const suggested = new Map(suggestNonTradingDays(year).map((day) => [day.date, day.reason]));
  const days: NonTradingDay[] = [];
  for (let day = isoDate(year, 1, 1); yearOf(day) === year; day = addDays(day, 1)) {
    if (isWeekend(day) || sessions.has(day)) continue;
    days.push({ date: day, reason: suggested.get(day) ?? saoPauloHoliday(day) ?? B3_FILE_REASON });
  }
  return days;
}

/** Datas que estão só numa das listas: o que o colaborador publicou e o que o arquivo mostra. */
export function calendarDifference(
  published: readonly NonTradingDay[],
  fromFile: readonly NonTradingDay[],
): { onlyPublished: IsoDate[]; onlyInFile: IsoDate[] } {
  const publishedDates = new Set(published.map((day) => day.date));
  const fileDates = new Set(fromFile.map((day) => day.date));
  return {
    onlyPublished: [...publishedDates].filter((date) => !fileDates.has(date)).sort(),
    onlyInFile: [...fileDates].filter((date) => !publishedDates.has(date)).sort(),
  };
}

function saoPauloHoliday(date: IsoDate): string | null {
  const day = Number(date.slice(8, 10));
  return (
    SAO_PAULO_HOLIDAYS.find((holiday) => holiday.month === monthOf(date) && holiday.day === day)
      ?.reason ?? null
  );
}
