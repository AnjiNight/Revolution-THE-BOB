import type { CashEntryType, IsoDate, PortfolioType } from '@simulador/shared';
import type { TradingCalendar } from '../../financial-calculation/trading-calendar.js';

/** Aporte ou retirada como fica guardado (SPEC-013 §6). Valor em decimal com 2 casas. */
export interface StoredCashEntry {
  id: string;
  portfolioId: string;
  type: CashEntryType;
  amount: string;
  date: IsoDate;
  recordedAt: Date;
}

export interface NewStoredCashEntry {
  type: CashEntryType;
  amount: string;
  date: IsoDate;
  recordedAt: Date;
}

/**
 * Livro-razão do caixa (SPEC-013, DA09): só inclui. Não há como alterar nem apagar um lançamento
 * (RB08); eles só saem junto com a carteira ou com a conta.
 */
export interface CashEntryRepository {
  /** Os lançamentos da carteira, em qualquer ordem (quem chama ordena pelo livro). */
  listByPortfolio(portfolioId: string): Promise<StoredCashEntry[]>;
  /** Os das carteiras pedidas, para a exportação. */
  listByPortfolios(portfolioIds: readonly string[]): Promise<Map<string, StoredCashEntry[]>>;
  /**
   * Trava a carteira, lê os lançamentos dela e chama `decide`, que confere as regras com eles e
   * devolve o lançamento novo (ou lança o erro). Grava antes de soltar a trava: dois pedidos ao
   * mesmo tempo na mesma carteira são conferidos um depois do outro (SPEC-013 §4.2).
   */
  appendLocked(
    portfolioId: string,
    decide: (current: StoredCashEntry[]) => NewStoredCashEntry,
  ): Promise<StoredCashEntry>;
}

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
  /** SPEC-013: "Valor inicial", gravado como primeiro aporte na mesma transação da carteira. */
  initialDeposit?: NewStoredCashEntry;
}

export interface PortfolioRepository {
  /** Do usuário, da mais recente para a mais antiga. */
  listByUser(userId: string): Promise<StoredPortfolio[]>;
  countByUser(userId: string): Promise<number>;
  /** Qualquer dono; quem chama confere se é do usuário. */
  findById(id: string): Promise<StoredPortfolio | null>;
  /**
   * Lança PortfolioNameInUseError se o usuário já tem a chave. Com `initialDeposit`, a carteira e o
   * aporte são gravados juntos: se um falhar, nada fica.
   */
  create(portfolio: NewStoredPortfolio): Promise<StoredPortfolio>;
  /** Lança PortfolioNameInUseError se o usuário já tem a chave. */
  rename(id: string, name: string, nameKey: string, at: Date): Promise<StoredPortfolio>;
  /**
   * Apaga a carteira e os lançamentos dela e grava o registro da exclusão (com quantos lançamentos
   * havia), sem dado pessoal, numa transação só.
   */
  delete(id: string, at: Date): Promise<void>;
}

/** Calendário de pregão (SPEC-005), que o módulo Dados de Mercado fornece. */
export interface PortfolioCalendar {
  /** Lança CalendarNotPublishedError ao perguntar de um ano não publicado. */
  tradingCalendar(fromYear: number, toYear: number): Promise<TradingCalendar>;
}
