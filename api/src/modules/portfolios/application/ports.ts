import type {
  AssetClass,
  CashEntryType,
  IsoDate,
  PortfolioType,
  QuoteLevelCode,
  TradeType,
} from '@simulador/shared';
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

/** Compra ou venda como fica guardada (SPEC-014 §6). Preço e total com 2 casas. */
export interface StoredTrade {
  id: string;
  portfolioId: string;
  assetId: string;
  type: TradeType;
  quantity: number;
  price: string;
  total: string;
  date: IsoDate;
  recordedAt: Date;
  quotedAt: Date;
  level: QuoteLevelCode;
  source: 'brapi';
}

export type NewStoredTrade = Omit<StoredTrade, 'id' | 'portfolioId'>;

/** Tudo o que mexe no caixa de uma carteira: aportes e retiradas, compras e vendas. */
export interface PortfolioLedger {
  cash: StoredCashEntry[];
  trades: StoredTrade[];
}

/**
 * Livro-razão da carteira (SPECs 013 e 014, DA09): só inclui. Não há como alterar nem apagar um
 * lançamento (RB08); eles só saem junto com a carteira ou com a conta.
 */
export interface LedgerRepository {
  /** Os lançamentos da carteira, em qualquer ordem (quem chama ordena pelo livro). */
  ledger(portfolioId: string): Promise<PortfolioLedger>;
  /** Os das carteiras pedidas, para a exportação. */
  ledgers(portfolioIds: readonly string[]): Promise<Map<string, PortfolioLedger>>;
  /**
   * Trava a carteira, lê o livro dela e chama `decide`, que confere as regras com ele e devolve o
   * lançamento novo (ou lança o erro). Grava antes de soltar a trava: dois pedidos ao mesmo tempo
   * na mesma carteira são conferidos um depois do outro (SPEC-013 §4.2).
   */
  appendCashLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredCashEntry,
  ): Promise<StoredCashEntry>;
  /** O mesmo, para uma compra ou venda (SPEC-014). */
  appendTradeLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredTrade,
  ): Promise<StoredTrade>;
}

/** Ativo do catálogo, como a carteira precisa dele (SPEC-014). */
export interface MarketAsset {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  active: boolean;
}

/** Cotação do pregão (SPEC-009): preço com até 6 casas e o horário da coleta. */
export interface MarketQuote {
  price: string;
  at: Date;
  level: QuoteLevelCode;
  source: 'brapi';
}

/**
 * Catálogo e cotações (SPECs 006, 008 e 009), que os módulos Catálogo e Dados de Mercado fornecem.
 * O `main.ts` liga as peças; a carteira não conhece esses módulos.
 */
export interface PortfolioMarket {
  asset(assetId: string): Promise<MarketAsset | null>;
  /** A última cotação do pregão no nível pedido (DA16). */
  latestQuote(assetId: string, level: QuoteLevelCode): Promise<MarketQuote | null>;
  /** O último fechamento guardado do histórico (SPEC-008), para avaliar sem cotação do pregão. */
  lastClose(assetId: string): Promise<{ date: IsoDate; close: string } | null>;
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
