import type { NonTradingDay } from '@simulador/shared';

/** Ano publicado, como fica guardado (SPEC-005 §6). */
export interface StoredCalendarYear {
  year: number;
  publishedAt: Date;
  /** Id do colaborador; nenhum dado pessoal fora do módulo de identidade (DA13). */
  publishedBy: string;
  /** Em ordem de data. */
  nonTradingDays: NonTradingDay[];
}

export interface NewCalendarPublication {
  year: number;
  publishedAt: Date;
  publishedBy: string;
  nonTradingDays: NonTradingDay[];
}

export interface CalendarRepository {
  findYear(year: number): Promise<StoredCalendarYear | null>;
  /** Anos publicados de `from` a `to`, incluindo os dois; os não publicados ficam de fora. */
  findYears(from: number, to: number): Promise<StoredCalendarYear[]>;
  /** Publica ou republica o ano: a lista nova substitui a anterior inteira, de uma vez. */
  publish(publication: NewCalendarPublication): Promise<StoredCalendarYear>;
}
