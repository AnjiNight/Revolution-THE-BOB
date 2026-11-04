import {
  CALENDAR_TIME_ZONE,
  isoDateInBrasilia,
  type EmailLocale,
  type IsoDate,
} from '@simulador/shared';

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

/** Preço em reais no formato do idioma: "R$ 52,71", "R$52.71" (SPEC-009). */
export function formatMoney(value: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

/** Volume financeiro abreviado (SPEC-010): "R$ 3,3 bi", "R$ 31,2 mi"; em inglês, "R$3.3B". */
export function formatCompactMoney(value: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value));
}

/** Quantidade no formato do idioma: "77.862", "77,862". */
export function formatCount(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}

/** Preço do eixo do gráfico (SPEC-010): sem centavos quando o passo é de R$ 1 ou mais. */
export function formatAxisPrice(value: number, step: number, language: string): string {
  const digits = step >= 1 ? 0 : 2;
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Marca de data do eixo do gráfico: o dia ("30/10") nos períodos curtos, o mês ("nov.") nos
 * médios, com o ano no lugar de janeiro, e o ano nos longos. Lida em UTC: é um dia, não um instante.
 */
export function formatTickDate(
  date: IsoDate,
  unit: 'day' | 'month' | 'year',
  language: string,
): string {
  if (unit === 'year' || (unit === 'month' && date.slice(5, 7) === '01')) return date.slice(0, 4);
  return new Intl.DateTimeFormat(
    language,
    unit === 'month'
      ? { month: 'short', timeZone: 'UTC' }
      : { day: '2-digit', month: '2-digit', timeZone: 'UTC' },
  ).format(new Date(`${date}T00:00:00Z`));
}

/** Variação do dia com sinal: "+1,23%", "-0,85%", "0,00%". O sinal não depende só da cor. */
export function formatChange(change: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(Number(change) / 100);
}

/**
 * Horário de uma cotação no horário de Brasília (PRE05): se é de hoje, só a hora; se é de outro
 * dia, também a data ("30/10").
 */
export function quoteMoment(
  at: string,
  language: string,
  now: Date = new Date(),
): { today: boolean; time: string; date: string } {
  const instant = new Date(at);
  const timeZone = CALENDAR_TIME_ZONE;
  return {
    today: isoDateInBrasilia(instant) === isoDateInBrasilia(now),
    time: new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(instant),
    date: new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', timeZone }).format(
      instant,
    ),
  };
}
