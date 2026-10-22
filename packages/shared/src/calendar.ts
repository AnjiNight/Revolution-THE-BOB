import type { FieldErrorCode, FieldErrors, ValidationResult } from './auth.js';

/** Rotas do calendário de pregão (SPEC-005, §5.2). `:year` vira o ano com `calendarPath`. */
export const CALENDAR_PATHS = {
  year: '/api/calendar/:year',
  suggestion: '/api/collaborator/calendar/:year/suggestion',
  publish: '/api/collaborator/calendar/:year',
} as const;

export function calendarPath(path: string, year: number): string {
  return path.replace(':year', String(year));
}

/** Anos aceitos (SPEC-005 §5.2; CHECK no banco). */
export const CALENDAR_MIN_YEAR = 2000;
export const CALENDAR_MAX_YEAR = 2100;
export const NON_TRADING_REASON_MAX = 100;
/** Teto da lista de um ano: um ano costuma ter uns 12 dias úteis sem pregão. */
export const NON_TRADING_DAYS_MAX = 100;

/** Todas as datas do calendário seguem o horário de Brasília (PRE05). */
export const CALENDAR_TIME_ZONE = 'America/Sao_Paulo';

/** Data sem hora, no formato AAAA-MM-DD. */
export type IsoDate = string;

export interface NonTradingDay {
  date: IsoDate;
  /** Texto livre da equipe, como no calendário da B3 ("Carnaval", "Sexta-feira Santa"). */
  reason: string;
}

/** Corpo de `GET /api/calendar/:year` e da resposta da publicação. */
export interface TradingCalendarYear {
  year: number;
  published: boolean;
  /** ISO 8601; `null` se o ano não foi publicado. */
  publishedAt: string | null;
  /** Só dias úteis, em ordem de data. Fins de semana nunca têm pregão e não entram. */
  nonTradingDays: NonTradingDay[];
}

/** Corpo de `GET /api/collaborator/calendar/:year/suggestion`: tudo ali é sugestão, a conferir. */
export interface CalendarSuggestion {
  year: number;
  nonTradingDays: NonTradingDay[];
}

/** Corpo de `PUT /api/collaborator/calendar/:year`: a lista inteira do ano. */
export interface CalendarPublication {
  nonTradingDays: NonTradingDay[];
}

/** Erros das rotas do calendário. `calendar_not_published` é o de quem usa o calendário (§4). */
export type CalendarErrorCode = 'calendar_not_published';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** As contas usam meia-noite em UTC só como número do dia: nenhum fuso entra no cálculo. */
function toUtcMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** AAAA-MM-DD de um dia que existe (recusa 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const ms = toUtcMs(value);
  return !Number.isNaN(ms) && fromUtcMs(ms) === value;
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return fromUtcMs(Date.UTC(year, month - 1, day));
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: IsoDate): number {
  return Number(date.slice(5, 7));
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: IsoDate): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const weekday = weekdayOf(date);
  return weekday === 0 || weekday === 6;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** O dia em Brasília de um instante (CA08): 23h30 de 31/12 em Brasília já é 1º/1 em UTC. */
export function isoDateInBrasilia(instant: Date): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Ano da rota: inteiro de 2000 a 2100, ou `null`. */
export function parseCalendarYear(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= CALENDAR_MIN_YEAR && year <= CALENDAR_MAX_YEAR ? year : null;
}

/**
 * Anos que o Início do colaborador confere (SPEC-005, CA09): o atual, sempre (sem ele os
 * lançamentos desse ano ficam bloqueados), e o seguinte desde 1º de dezembro (prazo: 31/12).
 */
export function calendarYearsToCheck(today: IsoDate): number[] {
  const year = yearOf(today);
  return monthOf(today) === 12 ? [year, year + 1] : [year];
}

/** Chave do erro de um campo de um dia da lista: `nonTradingDays.3.date`. */
export function nonTradingDayField(index: number, field: keyof NonTradingDay): string {
  return `nonTradingDays.${index}.${field}`;
}

/**
 * Valida a lista de um ano (CA05) e aponta o problema de cada dia: data inválida, de outro ano,
 * fim de semana ou repetida; motivo vazio ou longo. Devolve a lista em ordem de data.
 */
export function validateCalendarPublication(
  year: number,
  input: unknown,
): ValidationResult<CalendarPublication> {
  const list = (input as { nonTradingDays?: unknown } | null | undefined)?.nonTradingDays;
  if (!Array.isArray(list)) return { success: false, fields: { nonTradingDays: 'required' } };
  if (list.length > NON_TRADING_DAYS_MAX) {
    return { success: false, fields: { nonTradingDays: 'too_long' } };
  }

  const fields: FieldErrors = {};
  const seen = new Set<IsoDate>();
  const days: NonTradingDay[] = [];
  list.forEach((item: unknown, index) => {
    const raw = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const date = typeof raw.date === 'string' ? raw.date.trim() : '';
    const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';

    const dateError = dayDateError(year, date, seen);
    if (dateError) fields[nonTradingDayField(index, 'date')] = dateError;
    if (isIsoDate(date)) seen.add(date);

    if (!reason) fields[nonTradingDayField(index, 'reason')] = 'required';
    else if (reason.length > NON_TRADING_REASON_MAX) {
      fields[nonTradingDayField(index, 'reason')] = 'too_long';
    }
    days.push({ date, reason });
  });

  if (Object.keys(fields).length > 0) return { success: false, fields };
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { success: true, data: { nonTradingDays: days } };
}

function dayDateError(year: number, date: IsoDate, seen: Set<IsoDate>): FieldErrorCode | null {
  if (!date) return 'required';
  if (!isIsoDate(date)) return 'invalid_date';
  if (yearOf(date) !== year) return 'wrong_year';
  if (isWeekend(date)) return 'weekend';
  if (seen.has(date)) return 'duplicate';
  return null;
}
