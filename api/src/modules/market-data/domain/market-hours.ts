import { isWeekend, type IsoDate, type MarketTodaySymbol } from '@simulador/shared';
import { brasiliaInstant, closingMinute } from './trading-session.js';

/**
 * Horários do "Mercado hoje" (SPEC-048 §4.1, decisão 2), em minutos desde a meia-noite de Brasília.
 * O Ibovespa: a cada 15 minutos em dia de pregão, das 10:00 até 30 minutos depois do fechamento. O
 * dólar: a cada 30 minutos, de segunda a sexta, das 09:00 às 18:30.
 */
export const MARKET_HOURS = {
  ibovespa: { every: 15, first: 10 * 60, afterClose: 30 },
  dollar: { every: 30, first: 9 * 60, last: 18 * 60 + 30 },
  /** Folga depois do horário da coleta antes de dizer "pode estar desatualizado". */
  graceMinutes: 10,
  /** Leitura mais velha que isso, no horário do mercado, também está desatualizada. */
  staleAfterMinutes: 120,
} as const;

const MINUTE_MS = 60_000;

/** Intervalo entre as coletas de cada um. */
export function slotMinutesOf(symbol: MarketTodaySymbol): number {
  return MARKET_HOURS[symbol].every;
}

/**
 * Os minutos das coletas do dia. `open` diz se o mercado abre no dia: para o Ibovespa, o
 * calendário de pregão (SPEC-005); para o dólar, só os dias úteis. Dia fechado: nenhum.
 */
export function marketSlots(symbol: MarketTodaySymbol, date: IsoDate, open: boolean): number[] {
  if (!open || isWeekend(date)) return [];
  const { every, first } = MARKET_HOURS[symbol];
  const last =
    symbol === 'ibovespa'
      ? closingMinute(date) + MARKET_HOURS.ibovespa.afterClose
      : MARKET_HOURS.dollar.last;
  const slots: number[] = [];
  for (let minute = first; minute <= last; minute += every) slots.push(minute);
  return slots;
}

/** A coleta mais recente que já chegou na hora, ou `null` antes da primeira (ou dia fechado). */
export function dueSlot(
  symbol: MarketTodaySymbol,
  date: IsoDate,
  open: boolean,
  now: Date,
): Date | null {
  let due: Date | null = null;
  for (const minute of marketSlots(symbol, date, open)) {
    const at = brasiliaInstant(date, minute);
    if (at.getTime() <= now.getTime()) due = at;
  }
  return due;
}

/**
 * Pode estar desatualizado (decisão 4): só no horário do mercado (passada a folga da primeira
 * coleta), quando a última coleta que deu certo ficou para trás (uma coleta falhou ou o processador
 * parou) ou quando a leitura tem mais de 2 horas. Com o mercado fechado, a última leitura vale.
 */
export function isStale(
  symbol: MarketTodaySymbol,
  date: IsoDate,
  open: boolean,
  now: Date,
  reading: { at: Date; collectedAt: Date },
): boolean {
  const slots = marketSlots(symbol, date, open);
  const first = slots[0];
  const last = slots.at(-1);
  if (first === undefined || last === undefined) return false;
  const grace = MARKET_HOURS.graceMinutes * MINUTE_MS;
  const start = brasiliaInstant(date, first).getTime() + grace;
  const end = brasiliaInstant(date, last).getTime() + grace;
  const time = now.getTime();
  if (time < start || time > end) return false;
  const missedCollection =
    time - reading.collectedAt.getTime() > slotMinutesOf(symbol) * MINUTE_MS + grace;
  const oldReading = time - reading.at.getTime() > MARKET_HOURS.staleAfterMinutes * MINUTE_MS;
  return missedCollection || oldReading;
}
