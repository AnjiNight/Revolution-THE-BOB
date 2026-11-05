import type { IsoDate, PortfolioType } from '@simulador/shared';
import type { TradingCalendar } from '../../financial-calculation/trading-calendar.js';

/** Carteira como fica guardada (SPEC-012 §6). */
export interface StoredPortfolio {
  id: string;
  userId: string;
  name: string;
  type: PortfolioType;
  startDate: IsoDate;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewStoredPortfolio {
  userId: string;
  name: string;
  /** O nome sem maiúsculas nem acentos: único por usuário. */
  nameKey: string;
  type: PortfolioType;
  startDate: IsoDate;
  at: Date;
}

export interface PortfolioRepository {
  /** Do usuário, da mais recente para a mais antiga. */
  listByUser(userId: string): Promise<StoredPortfolio[]>;
  countByUser(userId: string): Promise<number>;
  /** Qualquer dono; quem chama confere se é do usuário. */
  findById(id: string): Promise<StoredPortfolio | null>;
  /** Lança PortfolioNameInUseError se o usuário já tem a chave. */
  create(portfolio: NewStoredPortfolio): Promise<StoredPortfolio>;
  /** Lança PortfolioNameInUseError se o usuário já tem a chave. */
  rename(id: string, name: string, nameKey: string, at: Date): Promise<StoredPortfolio>;
  /**
   * Apaga a carteira e os lançamentos dela e grava o registro da exclusão, sem dado pessoal, numa
   * transação só.
   */
  delete(id: string, at: Date): Promise<void>;
}

/** Calendário de pregão (SPEC-005), que o módulo Dados de Mercado fornece. */
export interface PortfolioCalendar {
  /** Lança CalendarNotPublishedError ao perguntar de um ano não publicado. */
  tradingCalendar(fromYear: number, toYear: number): Promise<TradingCalendar>;
}
