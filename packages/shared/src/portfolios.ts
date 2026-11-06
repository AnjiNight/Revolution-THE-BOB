import type { FieldErrorCode, FieldErrors, ValidationResult } from './auth.js';
import { isIsoDate, type IsoDate } from './calendar.js';

import type { AssetClass } from './assets.js';

/**
 * Rotas das carteiras (SPEC-012 §5.1), do caixa (SPEC-013 §5.1) e da compra e venda (SPEC-014
 * §5.1). `:id` vira o id da carteira com `portfolioPath`, `portfolioCashPath` e `portfolioSubPath`.
 */
export const PORTFOLIO_PATHS = {
  list: '/api/portfolios',
  item: '/api/portfolios/:id',
  cash: '/api/portfolios/:id/cash',
  positions: '/api/portfolios/:id/positions',
  tradeQuote: '/api/portfolios/:id/trade-quote',
  trades: '/api/portfolios/:id/trades',
  reversals: '/api/portfolios/:id/reversals',
} as const;

export function portfolioPath(id: string): string {
  return PORTFOLIO_PATHS.item.replace(':id', encodeURIComponent(id));
}

export function portfolioCashPath(id: string): string {
  return PORTFOLIO_PATHS.cash.replace(':id', encodeURIComponent(id));
}

/** Uma das rotas de `PORTFOLIO_PATHS` com o id da carteira. */
export function portfolioSubPath(path: string, id: string): string {
  return path.replace(':id', encodeURIComponent(id));
}

/** Ao vivo (opera com o preço de agora) ou histórica (opera no passado), DA17. Não muda (RB24). */
export const PORTFOLIO_TYPES = ['live', 'historical'] as const;
export type PortfolioType = (typeof PORTFOLIO_TYPES)[number];

export const PORTFOLIO_NAME_MAX = 60;
/** Carteiras por usuário (SPEC-012 §4.2). */
export const PORTFOLIO_LIMIT = 20;
/** Primeiro dia aceito no início da carteira histórica: o primeiro pregão do histórico (DA18). */
export const PORTFOLIO_HISTORY_START: IsoDate = '2016-01-04';

export interface Portfolio {
  id: string;
  name: string;
  type: PortfolioType;
  /** AAAA-MM-DD: ao vivo, o dia da criação em Brasília; histórica, o dia de pregão escolhido. */
  startDate: IsoDate;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
}

/** Corpo de `GET /api/portfolios`: da mais recente para a mais antiga. */
export interface PortfolioList {
  portfolios: Portfolio[];
  limit: number;
}

export interface NewPortfolioInput {
  name: string;
  type: PortfolioType;
  /** Só na histórica. */
  startDate?: IsoDate;
  /**
   * SPEC-013: "Valor inicial", opcional. Vira o primeiro aporte, na mesma operação da criação (na
   * histórica, na data de início). Decimal em texto com até 2 casas: "5000.00".
   */
  initialAmount?: string;
}

export interface RenamePortfolioInput {
  name: string;
}

/** Erros das rotas de carteira, do caixa e da compra e venda. */
export type PortfolioErrorCode =
  | 'portfolio_not_found'
  | 'portfolio_name_in_use'
  | 'portfolio_limit_reached'
  | 'insufficient_cash'
  // SPEC-014
  | 'insufficient_position'
  | 'quote_changed'
  | 'market_closed'
  | 'no_quote_today'
  | 'asset_inactive'
  | 'historical_portfolio'
  // SPEC-015
  | 'entry_not_found'
  | 'already_reversed'
  | 'reversal_window_closed'
  | 'reversal_breaks_cash'
  | 'reversal_breaks_position'
  // SPEC-016
  | 'no_close_that_day'
  | 'history_pending';

// --- Caixa (SPEC-013) ---

/** Aporte (põe dinheiro) ou retirada (tira dinheiro). */
export const CASH_ENTRY_TYPES = ['deposit', 'withdrawal'] as const;
export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];

/** Valor de cada lançamento: de R$ 0,01 a R$ 10.000.000,00, com 2 casas (SPEC-013 §4.1). */
export const CASH_AMOUNT_MIN = '0.01';
export const CASH_AMOUNT_MAX = '10000000.00';
/** Lançamentos do extrato por página ("Mostrar mais"). */
export const CASH_PAGE_SIZE = 100;

/**
 * Um lançamento do extrato, com o saldo logo depois dele. Valores em decimal com 2 casas. Desde a
 * SPEC-014, compras e vendas também aparecem, com o ativo, a quantidade e o preço em `trade`.
 */
export interface CashEntry {
  id: string;
  type: CashEntryType | TradeType;
  /** Na compra e na venda, o total da negociação. */
  amount: string;
  trade?: { assetId: string; ticker: string; quantity: number; price: string };
  /** AAAA-MM-DD: na ao vivo, o dia do registro em Brasília; na histórica, o dia escolhido. */
  date: IsoDate;
  /** ISO 8601: quando o servidor registrou. */
  recordedAt: string;
  /** `null` no lançamento estornado: ele não conta no saldo (SPEC-015). */
  balanceAfter: string | null;
  /** SPEC-015: ISO 8601 do estorno, ou `null`. */
  reversedAt: string | null;
  /** SPEC-015: dá para estornar agora (não estornado e, na ao vivo, compra e venda do dia). */
  reversible: boolean;
}

/** Corpo de `GET /api/portfolios/:id/cash`: saldo e extrato do mais recente ao mais antigo. */
export interface CashStatement {
  balance: string;
  entries: CashEntry[];
  hasMore: boolean;
  total: number;
}

export interface NewCashEntryInput {
  type: CashEntryType;
  /** Decimal em texto com até 2 casas: "1000", "1000.5", "1000.50". */
  amount: string;
  /** Só na histórica: na ao vivo, a data é o momento do registro (DA17). */
  date?: IsoDate;
}

/** Corpo de `POST /api/portfolios/:id/cash`. */
export interface CashEntryResult {
  entry: CashEntry;
  balance: string;
}

/**
 * Query string do extrato: `offset` (quantos pular, "Mostrar mais") é um inteiro sem sinal; sem
 * ele, do mais recente.
 */
export function validateCashStatementQuery(input: unknown): ValidationResult<{ offset: number }> {
  const raw = asRecord(input).offset;
  if (raw === undefined || raw === '') return { success: true, data: { offset: 0 } };
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) {
    return { success: false, fields: { offset: 'invalid_option' } };
  }
  return { success: true, data: { offset: Number(raw) } };
}

/** Detalhe do `insufficient_cash`: quanto há em caixa (RB26). */
export interface InsufficientCashDetails {
  available: string;
}

const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

/**
 * Valor monetário da API ("1234.5") → centavos, ou `null` se não for um decimal positivo com até 2
 * casas (RB13). Sem ponto flutuante (RNF12).
 */
export function amountToCents(text: string): bigint | null {
  if (!AMOUNT_PATTERN.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Centavos → decimal com 2 casas: 123456n → "1234.56"; -5n → "-0.05". */
export function centsToAmount(cents: bigint): string {
  const negative = cents < 0n;
  const text = (negative ? -cents : cents).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${text.slice(0, -2)}.${text.slice(-2)}`;
}

const MAX_CENTS = amountToCents(CASH_AMOUNT_MAX) as bigint;

/** Confere um valor de lançamento; devolve o valor com 2 casas ou o problema. */
function checkAmount(raw: unknown): { amount: string } | { error: FieldErrorCode } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { error: 'required' };
  }
  if (typeof raw !== 'string') return { error: 'invalid_amount' };
  const cents = amountToCents(raw.trim());
  if (cents === null) {
    // Muitos dígitos antes da vírgula ainda é um número: passa do teto.
    return /^\d+(\.\d{1,2})?$/.test(raw.trim())
      ? { error: 'above_max' }
      : { error: 'invalid_amount' };
  }
  if (cents <= 0n) return { error: 'invalid_amount' };
  if (cents > MAX_CENTS) return { error: 'above_max' };
  return { amount: centsToAmount(cents) };
}

/**
 * Valida um aporte ou retirada (SPEC-013 §4.1). A data é conferida aqui só no formato; se ela pode
 * ser enviada (só na histórica) e se é aceita (pregão, início, último lançamento, hoje) depende da
 * carteira e do calendário, e fica com o servidor.
 */
export function validateNewCashEntry(input: unknown): ValidationResult<NewCashEntryInput> {
  const raw = asRecord(input);
  const fields: FieldErrors = {};
  const type = raw.type;
  if (type !== 'deposit' && type !== 'withdrawal') fields.type = 'invalid_option';
  const amount = checkAmount(raw.amount);
  if ('error' in amount) fields.amount = amount.error;

  let date: IsoDate | undefined;
  if (raw.date !== undefined && raw.date !== null && raw.date !== '') {
    const value = typeof raw.date === 'string' ? raw.date.trim() : '';
    if (!isIsoDate(value)) fields.date = 'invalid_date';
    else date = value;
  }

  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      type: type as CashEntryType,
      amount: (amount as { amount: string }).amount,
      ...(date ? { date } : {}),
    },
  };
}

/** Sem espaços nas pontas e com os repetidos trocados por um (SPEC-012 §4.2). */
export function normalizePortfolioName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Chave do nome para a regra de nome único por usuário: sem maiúsculas nem acentos
 * ("Dividendos" e "dividêndos" são o mesmo nome).
 */
export function portfolioNameKey(name: string): string {
  return normalizePortfolioName(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function nameError(raw: unknown): FieldErrorCode | null {
  if (typeof raw !== 'string' || normalizePortfolioName(raw) === '') return 'required';
  if (normalizePortfolioName(raw).length > PORTFOLIO_NAME_MAX) return 'too_long';
  return null;
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
}

/**
 * Valida a criação (SPEC-012 §4.2). A data de início da histórica é conferida aqui só no formato
 * e no começo do histórico; "não é dia de pregão" e "hoje ou depois" dependem do calendário e de
 * hoje em Brasília, e ficam com o servidor.
 */
export function validateNewPortfolio(input: unknown): ValidationResult<NewPortfolioInput> {
  const raw = asRecord(input);
  const fields: FieldErrors = {};
  const name = nameError(raw.name);
  if (name) fields.name = name;
  const type = raw.type;
  if (type !== 'live' && type !== 'historical') fields.type = 'invalid_option';

  let startDate: IsoDate | undefined;
  if (type === 'historical') {
    const value = typeof raw.startDate === 'string' ? raw.startDate.trim() : '';
    if (!value) fields.startDate = 'required';
    else if (!isIsoDate(value)) fields.startDate = 'invalid_date';
    else if (value < PORTFOLIO_HISTORY_START) fields.startDate = 'before_history';
    else startDate = value;
  }

  // SPEC-013: "Valor inicial" é opcional; vazio é o mesmo que não mandar.
  let initialAmount: string | undefined;
  const rawInitial = raw.initialAmount;
  if (rawInitial !== undefined && rawInitial !== null && rawInitial !== '') {
    const checked = checkAmount(rawInitial);
    if ('error' in checked) fields.initialAmount = checked.error;
    else initialAmount = checked.amount;
  }

  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      name: normalizePortfolioName(raw.name as string),
      type: type as PortfolioType,
      ...(startDate ? { startDate } : {}),
      ...(initialAmount ? { initialAmount } : {}),
    },
  };
}

/** Valida a troca de nome; mandar `type` ou `startDate` junto é `immutable` (RB24, §4.2). */
export function validateRenamePortfolio(input: unknown): ValidationResult<RenamePortfolioInput> {
  const raw = asRecord(input);
  const fields: FieldErrors = {};
  const name = nameError(raw.name);
  if (name) fields.name = name;
  if ('type' in raw) fields.type = 'immutable';
  if ('startDate' in raw) fields.startDate = 'immutable';
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return { success: true, data: { name: normalizePortfolioName(raw.name as string) } };
}

// --- Compra e venda na carteira ao vivo (SPEC-014) ---

export const TRADE_TYPES = ['buy', 'sell'] as const;
export type TradeType = (typeof TRADE_TYPES)[number];

/** RB27: quantidade inteira, de 1 a 1.000.000 por negociação. */
export const TRADE_QUANTITY_MAX = 1_000_000;

/** Nível da cotação usada (DA16). Até a SPEC-026, só existe o gratuito. */
export type QuoteLevelCode = 'free' | 'subscriber';

/** Uma compra ou venda registrada. Preço e total em decimal com 2 casas. */
export interface Trade {
  id: string;
  type: TradeType;
  assetId: string;
  ticker: string;
  quantity: number;
  price: string;
  total: string;
  date: IsoDate;
  /** ISO 8601: quando o servidor registrou. */
  recordedAt: string;
  /** ISO 8601: horário da cotação usada; `null` na histórica, que usa o fechamento do dia. */
  quotedAt: string | null;
  /** `null` na histórica (SPEC-016). */
  level: QuoteLevelCode | null;
  /** `brapi`: cotação do pregão (ao vivo); `b3`: fechamento da B3 (histórica, SPEC-016). */
  source: 'brapi' | 'b3';
}

/** Desdobramento, grupamento ou bonificação (SPEC-042), com a data com. */
export interface PositionEvent {
  kind: 'split' | 'reverse_split' | 'bonus';
  exDate: IsoDate;
}

/**
 * A posição de um ativo (RB09, RF14): quantidade e preço médio vêm das negociações; o último preço
 * conhecido avalia a posição. Sem preço nenhum, os campos da avaliação vêm `null`.
 */
export interface Position {
  assetId: string;
  ticker: string;
  name: string;
  class: AssetClass;
  quantity: number;
  /** Com 2 casas, para mostrar; a conta guarda 6 (SPEC-014 §4.2). */
  averagePrice: string;
  lastPrice: string | null;
  /** `intraday`: cotação do pregão, com `lastPriceAt`; `close`: fechamento, com `lastPriceDate`. */
  lastPriceKind: 'intraday' | 'close' | null;
  lastPriceAt: string | null;
  lastPriceDate: IsoDate | null;
  /** Quantidade × último preço. */
  marketValue: string | null;
  /** Valor atual menos o custo (quantidade × preço médio), em reais e em % com 2 casas. */
  change: string | null;
  changePercent: string | null;
  /**
   * SPEC-016: eventos corporativos desde a primeira compra ainda em posição. Até a SPEC-043, com
   * algum, `marketValue`, `change` e `changePercent` vêm `null` (a quantidade não foi corrigida).
   */
  events: PositionEvent[];
}

/** Corpo de `GET /api/portfolios/:id/positions`. */
export interface PortfolioPositions {
  cash: string;
  /** Soma do valor atual das posições com preço (sem as que têm evento). */
  positionsValue: string;
  /** Caixa + posições. */
  total: string;
  /** Em ordem de ticker. */
  positions: Position[];
  /** SPEC-016: dia do último lançamento que vale, para a data mínima na histórica (RB25). */
  lastEntryDate: IsoDate | null;
}

/** Por que não dá para negociar agora (SPECs 014 e 016). */
export type TradeBlockReason =
  | 'market_closed'
  | 'no_quote_today'
  | 'historical_portfolio'
  | 'calendar_not_published'
  // SPEC-016: na histórica.
  | 'no_close_that_day'
  | 'history_pending';

/**
 * Corpo de `GET /api/portfolios/:id/trade-quote?assetId=`: o preço que a negociação usaria agora,
 * com o caixa e a posição do ativo para a tela calcular o máximo; ou o motivo de não dar.
 */
export type TradeQuote = {
  cash: string;
  /** Quantidade do ativo na posição (0 sem posição). */
  held: number;
  /** Ativo desativado só pode ser vendido (SPEC-014 §4.2). */
  buyable: boolean;
} & (
  | {
      tradable: true;
      /** Com 2 casas: o preço que a negociação vai usar. */
      price: string;
      /** O dia da negociação: hoje na ao vivo; o escolhido na histórica. */
      date: IsoDate;
      source: 'brapi' | 'b3';
      /** Ao vivo: o horário e o nível da cotação; na histórica, `null` (fechamento do dia). */
      quotedAt: string | null;
      level: QuoteLevelCode | null;
      delayMinutes: number | null;
    }
  | {
      tradable: false;
      reason: TradeBlockReason;
      nextTradingDay: IsoDate | null;
      /** SPEC-016, no `no_close_that_day`: o último dia com negócio antes do escolhido. */
      lastTradingDay?: IsoDate | null;
    }
);

export interface NewTradeInput {
  type: TradeType;
  assetId: string;
  quantity: number;
  /** Ao vivo: o horário da cotação que a pessoa viu (`TradeQuote.quotedAt`). */
  quotedAt?: string;
  /** SPEC-016, só na histórica: o dia da negociação. */
  date?: IsoDate;
}

/** Corpo de `POST /api/portfolios/:id/trades`. `position` vem `null` quando a venda zera. */
export interface TradeResult {
  trade: Trade;
  cash: string;
  position: Position | null;
}

/** Detalhes dos erros da negociação. */
export interface InsufficientPositionDetails {
  held: string;
}
export interface QuoteChangedDetails {
  price: string;
  quotedAt: string;
}
export interface MarketClosedDetails {
  nextTradingDay?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Query string de `trade-quote`: o id do ativo e, na histórica, a data (SPEC-016). */
export function validateTradeQuoteQuery(
  input: unknown,
): ValidationResult<{ assetId: string; date?: IsoDate }> {
  const record = asRecord(input);
  const raw = record.assetId;
  const fields: FieldErrors = {};
  if (raw === undefined || raw === '') fields.assetId = 'required';
  else if (typeof raw !== 'string' || !UUID_PATTERN.test(raw)) fields.assetId = 'invalid_option';
  const date = record.date;
  if (date !== undefined && date !== '' && (typeof date !== 'string' || !isIsoDate(date))) {
    fields.date = 'invalid_date';
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      assetId: (raw as string).toLowerCase(),
      ...(typeof date === 'string' && date !== '' ? { date } : {}),
    },
  };
}

/** Valida uma compra ou venda (SPEC-014 §5.1); se dá para negociar agora, quem diz é o servidor. */
export function validateNewTrade(input: unknown): ValidationResult<NewTradeInput> {
  const raw = asRecord(input);
  const fields: FieldErrors = {};
  if (raw.type !== 'buy' && raw.type !== 'sell') fields.type = 'invalid_option';
  if (typeof raw.assetId !== 'string' || !UUID_PATTERN.test(raw.assetId)) {
    fields.assetId = raw.assetId === undefined ? 'required' : 'invalid_option';
  }
  const quantity = raw.quantity;
  if (quantity === undefined || quantity === null || quantity === '') fields.quantity = 'required';
  else if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    fields.quantity = 'invalid_quantity';
  } else if (quantity > TRADE_QUANTITY_MAX) fields.quantity = 'above_max';
  // Ao vivo manda o horário da cotação; a histórica, a data (SPEC-016). Qual é obrigatório
  // depende da carteira e fica com o servidor; aqui, só o formato.
  const quotedAt = raw.quotedAt;
  if (quotedAt !== undefined && (typeof quotedAt !== 'string' || !ISO_INSTANT.test(quotedAt))) {
    fields.quotedAt = 'invalid_date';
  }
  const date = raw.date;
  if (date !== undefined && (typeof date !== 'string' || !isIsoDate(date))) {
    fields.date = 'invalid_date';
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      type: raw.type as TradeType,
      assetId: (raw.assetId as string).toLowerCase(),
      quantity: quantity as number,
      ...(typeof quotedAt === 'string' ? { quotedAt: new Date(quotedAt).toISOString() } : {}),
      ...(typeof date === 'string' ? { date } : {}),
    },
  };
}

// --- Estorno (SPEC-015) ---

export interface NewReversalInput {
  /** O aporte, a retirada, a compra ou a venda a estornar. */
  entryId: string;
}

/** Corpo de `POST /api/portfolios/:id/reversals`. */
export interface ReversalResult {
  reversal: { entryId: string; type: CashEntryType | TradeType; reversedAt: string };
  /** O caixa sem o lançamento estornado. */
  cash: string;
}

/**
 * Detalhe do `reversal_breaks_cash` e do `reversal_breaks_position`: o lançamento que deixaria o
 * caixa negativo ou a venda maior que a posição, para a tela dizer qual estornar antes.
 */
export interface ReversalBreakDetails {
  entryId: string;
  type: CashEntryType | TradeType;
  date: IsoDate;
  /** Valor do lançamento (na compra e na venda, o total). */
  amount: string;
  /** Só na compra e na venda. */
  ticker?: string;
  quantity?: string;
}

/** Valida o pedido de estorno: o id do lançamento. */
export function validateNewReversal(input: unknown): ValidationResult<NewReversalInput> {
  const raw = asRecord(input).entryId;
  if (raw === undefined || raw === '') return { success: false, fields: { entryId: 'required' } };
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw)) {
    return { success: false, fields: { entryId: 'invalid_option' } };
  }
  return { success: true, data: { entryId: raw.toLowerCase() } };
}
