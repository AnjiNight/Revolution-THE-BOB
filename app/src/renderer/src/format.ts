import type { EmailLocale, IsoDate } from '@simulador/shared';

/** Idioma dos e-mails que o servidor manda, a partir do idioma da interface (RNF20). */
export function emailLocale(language: string): EmailLocale {
  return language.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';
}

/** Iniciais para o avatar: primeira letra do primeiro e do último nome ("Lucas Ferreira" → "LF"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Data no idioma da interface (e não no formato do sistema operacional), como pedem as
 * diretrizes de i18n: "8 de outubro de 2026" em português, "October 8, 2026" em inglês.
 */
export function formatDate(iso: string, language: string, withTime = false): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(iso));
}

/**
 * Dia do calendário (AAAA-MM-DD, SPEC-005) no idioma da interface: "16 de fev. de 2026". Lido em
 * UTC de propósito: é um dia, não um instante, e não pode mudar com o fuso da máquina.
 */
export function formatCalendarDay(date: IsoDate, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/**
 * Lista de anos em ordem, juntando os seguidos: [2016, 2017, 2018, 2021] → "2016–2018, 2021"
 * (SPEC-008: anos do histórico que esperam o calendário).
 */
export function formatYears(years: readonly number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    const first = sorted[i] as number;
    let last = first;
    while (sorted[i + 1] === last + 1) {
      i += 1;
      last = sorted[i] as number;
    }
    parts.push(last === first ? String(first) : `${first}–${last}`);
    i += 1;
  }
  return parts.join(', ');
}

/** Dia da semana de um dia do calendário: "segunda-feira", "Monday". */
export function formatWeekday(date: IsoDate, language: string): string {
  return new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
