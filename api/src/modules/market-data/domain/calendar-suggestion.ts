import { addDays, isoDate, isWeekend, type IsoDate, type NonTradingDay } from '@simulador/shared';

/**
 * Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus/Jones/Butcher). Os feriados
 * móveis contam a partir dele.
 */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

/** Feriados nacionais de data fixa e o ano em que passaram a valer. */
const FIXED_HOLIDAYS: ReadonlyArray<{
  month: number;
  day: number;
  reason: string;
  since?: number;
}> = [
  { month: 1, day: 1, reason: 'Confraternização Universal' },
  { month: 4, day: 21, reason: 'Tiradentes' },
  { month: 5, day: 1, reason: 'Dia do Trabalho' },
  { month: 9, day: 7, reason: 'Independência do Brasil' },
  { month: 10, day: 12, reason: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, reason: 'Finados' },
  { month: 11, day: 15, reason: 'Proclamação da República' },
  // Lei 14.759/2023: feriado nacional a partir de 2024.
  { month: 11, day: 20, reason: 'Dia Nacional de Zumbi e da Consciência Negra', since: 2024 },
  { month: 12, day: 25, reason: 'Natal' },
];

/**
 * A B3 não abre no último dia útil do ano: 31/12 ou, quando ele cai no fim de semana, a sexta antes
 * (30/12/2022 e 29/12/2023, conferidos nos arquivos anuais da B3).
 */
function lastBusinessDay(year: number): IsoDate {
  let day = isoDate(year, 12, 31);
  while (isWeekend(day)) day = addDays(day, -1);
  return day;
}

/**
 * Sugestão dos dias úteis sem pregão de um ano (SPEC-005 §4), para o colaborador conferir com o
 * calendário oficial da B3 antes de publicar. De 2022 a 2025 ela é igual aos dias sem pregão dos
 * arquivos da B3, e a de 2026 ao calendário oficial.
 *
 * Não cobre os feriados de São Paulo (25/1, 9/7 e 20/11), em que a B3 fechava até 2021 (em 2020 ela
 * abriu nesses dias), nem mudanças avisadas pela B3 durante o ano: por isso a revisão do
 * colaborador (DA07).
 */
export function suggestNonTradingDays(year: number): NonTradingDay[] {
  const easter = easterSunday(year);
  const days: NonTradingDay[] = [
    ...FIXED_HOLIDAYS.filter((holiday) => (holiday.since ?? 0) <= year).map((holiday) => ({
      date: isoDate(year, holiday.month, holiday.day),
      reason: holiday.reason,
    })),
    { date: addDays(easter, -48), reason: 'Carnaval' },
    { date: addDays(easter, -47), reason: 'Carnaval' },
    { date: addDays(easter, -2), reason: 'Sexta-feira Santa' },
    { date: addDays(easter, 60), reason: 'Corpus Christi' },
    // Dias em que a B3 não abre, embora não sejam feriado nacional.
    { date: isoDate(year, 12, 24), reason: 'Véspera de Natal' },
    { date: lastBusinessDay(year), reason: 'Último dia útil do ano' },
  ];
  // Dois feriados no mesmo dia viram um só (ex.: Sexta-feira Santa em 21/4, como em 2000).
  const byDate = new Map<IsoDate, string>();
  for (const day of days) {
    if (isWeekend(day.date)) continue;
    const other = byDate.get(day.date);
    byDate.set(day.date, other ? `${other} e ${day.reason}` : day.reason);
  }
  return [...byDate]
    .map(([date, reason]) => ({ date, reason }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
