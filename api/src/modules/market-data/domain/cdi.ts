import {
  addDays,
  CDI_START_DATE,
  isIsoDate,
  isWeekend,
  yearOf,
  type IsoDate,
} from '@simulador/shared';

/**
 * Regras da série do CDI (SPEC-007 §4.2). Puro: recebe a resposta do SGS e as datas, não sabe de
 * rede nem de banco.
 */

/** Taxa do dia como o Banco Central publica: % ao dia, em texto, sem ponto flutuante (RNF12). */
export interface CdiRate {
  date: IsoDate;
  value: string;
}

/** Entre 0 e 1 (% ao dia) com até 6 casas: 1% ao dia seria mais de 1.200% ao ano. */
const VALUE_PATTERN = /^0(\.\d{1,6})?$/;
const SGS_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** AAAA-MM-DD para o formato da consulta do SGS (dd/mm/aaaa). */
export function toSgsDate(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/**
 * Lê as linhas `{ data: "dd/mm/aaaa", valor: "0.050788" }` da resposta. Linha fora do formato vira
 * problema, sem derrubar as outras.
 */
export function parseSgsRows(rows: readonly unknown[]): { rates: CdiRate[]; problems: string[] } {
  const rates: CdiRate[] = [];
  const problems: string[] = [];
  for (const row of rows) {
    const raw = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
    const data = typeof raw.data === 'string' ? raw.data.trim() : '';
    const valor = typeof raw.valor === 'string' ? raw.valor.trim() : '';
    const match = SGS_DATE_PATTERN.exec(data);
    const date = match ? `${match[3]}-${match[2]}-${match[1]}` : '';
    if (!match || !isIsoDate(date)) {
      problems.push(`linha com data inválida: "${data}"`);
    } else if (!VALUE_PATTERN.test(valor)) {
      problems.push(`CDI de ${date} fora de 0 a 1% ao dia ou com mais de 6 casas: "${valor}"`);
    } else {
      rates.push({ date, value: valor });
    }
  }
  return { rates, problems };
}

/** Data que a série recusa (§4.2): fim de semana, futuro ou antes da janela. */
export function rateDateProblem(date: IsoDate, today: IsoDate): string | null {
  if (isWeekend(date)) return `CDI em ${date}, fim de semana`;
  if (date > today) return `CDI em ${date}, data futura`;
  if (date < CDI_START_DATE) return `CDI em ${date}, antes de ${CDI_START_DATE}`;
  return null;
}

/** Último dia de semana antes de `date` (sexta, se `date` é segunda). */
export function previousWeekday(date: IsoDate): IsoDate {
  let day = addDays(date, -1);
  while (isWeekend(day)) day = addDays(day, -1);
  return day;
}

/**
 * Dia útil para os avisos (§5.3): segunda a sexta e, nos anos com calendário publicado, fora dos
 * dias sem pregão. É só para avisar; a série nunca é validada por ele.
 */
export type NonBusinessDay = (date: IsoDate) => boolean;

/** Dias úteis depois de `from` e antes de `until` (nenhum dos dois conta). */
export function businessDaysBetween(
  from: IsoDate,
  until: IsoDate,
  nonBusiness: NonBusinessDay,
): number {
  let count = 0;
  for (let day = addDays(from, 1); day < until; day = addDays(day, 1)) {
    if (!isWeekend(day) && !nonBusiness(day)) count += 1;
  }
  return count;
}

/** O dia útil que fica `days` dias úteis antes de `date`. */
export function businessDaysBefore(
  date: IsoDate,
  days: number,
  nonBusiness: NonBusinessDay,
): IsoDate {
  let day = date;
  for (let left = days; left > 0;) {
    day = addDays(day, -1);
    if (!isWeekend(day) && !nonBusiness(day)) left -= 1;
  }
  return day;
}

/**
 * Pregões de anos com calendário publicado, de CDI_START_DATE até `until`, que não têm CDI (§4.2):
 * todo pregão é dia útil bancário.
 */
export function tradingDaysWithoutRate(
  published: ReadonlyArray<{ year: number; nonTradingDays: readonly IsoDate[] }>,
  rates: ReadonlySet<IsoDate>,
  until: IsoDate,
): IsoDate[] {
  const missing: IsoDate[] = [];
  for (const { year, nonTradingDays } of published) {
    const closed = new Set(nonTradingDays);
    for (let day = `${year}-01-01`; yearOf(day) === year && day <= until; day = addDays(day, 1)) {
      if (day < CDI_START_DATE || isWeekend(day) || closed.has(day) || rates.has(day)) continue;
      missing.push(day);
    }
  }
  return missing.sort();
}
