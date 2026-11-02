import { addDays, isoDate, weekdayOf, yearOf, type IsoDate } from '@simulador/shared';

/**
 * Horário das coletas do pregão (SPEC-009 §4.2), em minutos desde a meia-noite de Brasília. A
 * negociação abre às 10h; com o atraso de ~30 minutos da fonte, a primeira coleta é às 10h30 e a
 * última, 30 minutos depois do fechamento.
 */
export const SESSION = {
  firstCollectionMinute: 10 * 60 + 30,
  slotMinutes: 30,
  afterCloseMinutes: 30,
  /** Fechamento (com o leilão) enquanto vale o horário de verão dos EUA: 17h. */
  shortCloseMinute: 17 * 60,
  /** No resto do ano: 18h. */
  longCloseMinute: 18 * 60,
} as const;

const MINUTE_MS = 60_000;

/** 2º domingo de março: começa o horário de verão dos EUA. */
export function usDstStart(year: number): IsoDate {
  const first = isoDate(year, 3, 1);
  return addDays(first, ((7 - weekdayOf(first)) % 7) + 7);
}

/** 1º domingo de novembro: acaba o horário de verão dos EUA. */
export function usDstEnd(year: number): IsoDate {
  const first = isoDate(year, 11, 1);
  return addDays(first, (7 - weekdayOf(first)) % 7);
}

/**
 * Minuto do fechamento no dia. A B3 acompanha o horário de verão dos EUA: do primeiro pregão
 * depois do 2º domingo de março até o primeiro pregão depois do 1º domingo de novembro, fecha uma
 * hora mais cedo (em 2026: 16h55 com o leilão até 17h, de 9/3 a 2/11).
 */
export function closingMinute(date: IsoDate): number {
  const year = yearOf(date);
  const shortSession = date > usDstStart(year) && date <= usDstEnd(year);
  return shortSession ? SESSION.shortCloseMinute : SESSION.longCloseMinute;
}

/** Minutos das coletas do dia: de 10h30 até 30 minutos depois do fechamento, de 30 em 30. */
export function collectionMinutes(date: IsoDate): number[] {
  const last = closingMinute(date) + SESSION.afterCloseMinutes;
  const minutes: number[] = [];
  for (let minute = SESSION.firstCollectionMinute; minute <= last; minute += SESSION.slotMinutes) {
    minutes.push(minute);
  }
  return minutes;
}

/** Instante de um minuto do dia em Brasília (UTC−3 o ano todo desde 2019). */
export function brasiliaInstant(date: IsoDate, minute: number): Date {
  return new Date(Date.parse(`${date}T00:00:00-03:00`) + minute * MINUTE_MS);
}

/** Coleta mais recente que já chegou na hora (índice entre as do dia), ou `null` antes da primeira. */
export function dueCollection(date: IsoDate, now: Date): number | null {
  const minutes = collectionMinutes(date);
  let due: number | null = null;
  minutes.forEach((minute, index) => {
    if (brasiliaInstant(date, minute).getTime() <= now.getTime()) due = index;
  });
  return due;
}
