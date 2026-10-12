import type { EmailLocale } from '@simulador/shared';

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
