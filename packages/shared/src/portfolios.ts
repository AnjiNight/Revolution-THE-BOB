import type { FieldErrorCode, FieldErrors, ValidationResult } from './auth.js';
import { isIsoDate, type IsoDate } from './calendar.js';

import type { AssetClass, SectorCode } from './assets.js';
import type { DividendKind } from './fundamentals.js';

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
  performance: '/api/portfolios/:id/performance',
  /** SPEC-022: o caminho fixo tem preferência sobre `item` no roteador. */
  comparison: '/api/portfolios/comparison',
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
  /** SPEC-043: `income` é um provento pago (com `income`) ou a venda de uma fração (`fraction`). */
  type: CashEntryType | TradeType | 'income';
  /** Na compra e na venda, o total da negociação; no provento, o líquido. */
  amount: string;
  trade?: { assetId: string; ticker: string; quantity: number; price: string };
  income?: IncomeDetail;
  fraction?: {
    assetId: string;
    ticker: string;
    /** A fração de ação, com até 6 casas ("0.5"). */
    shares: string;
    /** O fechamento da data com dividido pelo multiplicador. */
    price: string;
  };
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
  /** SPEC-043: data com já passou, pagamento ainda não (ou sem data); fora do saldo. */
  pendingIncome: IncomeDetail[];
  /** SPEC-043: o interruptor do Investidor10; desligado, nenhum provento entra. */
  incomeEnabled: boolean;
}

/**
 * SPEC-043: um provento de quem tinha o ativo no fim da data com: quantidade × valor por ação, em
 * centavos para baixo; no JCP, o IR retido (15% até 2025, 17,5% desde 2026). Fonte: Investidor10.
 */
export interface IncomeDetail {
  assetId: string;
  ticker: string;
  kind: DividendKind;
  quantity: number;
  /** Valor por ação ou cota, com até 10 casas. */
  perShare: string;
  gross: string;
  tax: string;
  net: string;
  exDate: IsoDate;
  paymentDate: IsoDate | null;
  source: 'investidor10';
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

/**
 * Desdobramento, grupamento ou bonificação (SPEC-042), com a data com. SPEC-043: já aplicado na
 * posição, com a quantidade antes e depois.
 */
export interface PositionEvent {
  kind: 'split' | 'reverse_split' | 'bonus';
  exDate: IsoDate;
  /** Quantas ações passou a valer uma ("4", "0.1", "1.02"). */
  multiplier: string;
  quantityBefore: number;
  quantityAfter: number;
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
   * SPEC-016: eventos corporativos desde a primeira compra ainda em posição. SPEC-043: já aplicados
   * na quantidade e no preço médio.
   */
  events: PositionEvent[];
  /** SPEC-043: total líquido de proventos pagos por este ativo nesta carteira. */
  income: string;
  /** SPEC-043: `false` se o processador ainda não visitou o ativo no Investidor10. */
  incomeLoaded: boolean;
  /** SPEC-021: setor (ação) ou segmento (FII) do catálogo. */
  sector: SectorCode;
}

/** SPEC-021: um ativo dentro do setor, com a % da carteira. */
export interface AllocationAsset {
  assetId: string;
  ticker: string;
  value: string;
  percent: string;
}

/** SPEC-021: um setor (ação) ou segmento (FII), com a % da carteira e a da classe. */
export interface AllocationSector {
  sector: SectorCode;
  value: string;
  percent: string;
  percentOfClass: string;
  assets: AllocationAsset[];
}

/** SPEC-021: Ações, FIIs ou Caixa, com a % do patrimônio. */
export interface AllocationClass {
  kind: AssetClass | 'cash';
  value: string;
  percent: string;
  /** Só em Ações e FIIs, do maior para o menor, "Outros" no fim. */
  sectors?: AllocationSector[];
}

/** SPEC-021: a distribuição de hoje (§5.1). */
export interface PortfolioAllocation {
  /** Caixa positivo + ativos (os sem preço pelo custo). */
  total: string;
  /** Só as classes com valor, na ordem Ações, FIIs, Caixa. */
  classes: AllocationClass[];
  /** Tickers dos ativos sem preço, que entraram pelo custo. */
  atCost: string[];
  /** O caixa negativo (fora das barras e das %), ou `null`. */
  negativeCash: string | null;
}

/** Corpo de `GET /api/portfolios/:id/positions`. */
export interface PortfolioPositions {
  cash: string;
  /** Soma do valor atual das posições com preço. */
  positionsValue: string;
  /** Caixa + posições. */
  total: string;
  /** Em ordem de ticker. */
  positions: Position[];
  /** SPEC-016: dia do último lançamento que vale, para a data mínima na histórica (RB25). */
  lastEntryDate: IsoDate | null;
  /** SPEC-043: proventos pagos (líquidos) e a receber, somados. */
  income: string;
  pendingIncome: string;
  /** O próximo pagamento a receber, ou `null`. */
  nextPayment: { date: IsoDate; amount: string } | null;
  incomeEnabled: boolean;
  /** SPEC-021: a distribuição por classe, setor e ativo. */
  allocation: PortfolioAllocation;
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

// --- Rentabilidade (SPEC-019) ---

/** 1 mês, 6 meses, 12 meses, no ano, desde o início. */
export const PERFORMANCE_PERIODS = ['1m', '6m', '12m', 'ytd', 'all'] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

export type PerformanceQuery = { period: PerformancePeriod } | { from: IsoDate; to: IsoDate };

/** SPEC-020: as referências do mercado (CDI, Ibovespa e IFIX). */
export const BENCHMARK_CODES = ['cdi', 'ibov', 'ifix'] as const;
export type BenchmarkCode = (typeof BENCHMARK_CODES)[number];

/** Um ponto do gráfico: o fechamento de um pregão (ou de uma semana, com `weekly`). */
export interface PerformancePoint {
  date: IsoDate;
  /** Caixa + ativos no fechamento. */
  equity: string;
  /** Aportes − retiradas desde o início da carteira. */
  invested: string;
  /** Rentabilidade da cota desde o início do período, em % com 2 casas. */
  return: string;
  /**
   * SPEC-020: rentabilidade acumulada de cada referência desde o dia-base, em % com 2 casas;
   * `null` sem dado até esse dia (ou, no IFIX, quando ele não aparece).
   */
  benchmarks: Record<BenchmarkCode, string | null>;
  /**
   * SPEC-020: "o mesmo dinheiro" em cada referência, em reais (o patrimônio do dia-base com os
   * aportes e retiradas da carteira nos mesmos dias), para o gráfico em reais.
   */
  benchmarkValues: Record<BenchmarkCode, string | null>;
}

/** SPEC-020: uma referência no período. */
export interface BenchmarkSummary {
  code: BenchmarkCode;
  /** Rentabilidade acumulada até `until`, em % com 2 casas; `null` se ainda não foi carregada. */
  return: string | null;
  /** O último dia com dado; antes do fim do período, a tela diz "até". */
  until: IsoDate | null;
  /** "O mesmo dinheiro" na referência em `until` ("No CDI, você teria R$ 26.654,53"). */
  endValue: string | null;
  source: 'bcb' | 'b3';
}

export type PerformanceWarning =
  /** Salto de preço (SPEC-010) sem evento da B3 que o explique, com o ativo em posição. */
  | { kind: 'unexplained_jump'; assetId: string; ticker: string; date: IsoDate }
  /** Ativo sem fechamento até a data: até lá, vale o preço da compra. */
  | { kind: 'no_close'; assetId: string; ticker: string; until: IsoDate };

/**
 * Corpo de `GET /api/portfolios/:id/performance` (SPEC-019 §5.1). `null` nos números quando a
 * carteira ainda não tem lançamento no período.
 */
export interface PortfolioPerformance {
  from: IsoDate;
  to: IsoDate;
  /** Patrimônio no fechamento do pregão antes do período (0 se a carteira começou nele). */
  startValue: string;
  endValue: string;
  /** Aportes − retiradas no período. */
  netFlows: string;
  /** Patrimônio final − inicial − aportes líquidos. */
  result: string;
  /** Rentabilidade da cota no período, em % com 2 casas. */
  return: string;
  series: PerformancePoint[];
  /** Acima de 2 anos, um ponto por semana (o último pregão de cada). */
  weekly: boolean;
  warnings: PerformanceWarning[];
  /** A carteira não tem lançamento até o fim do período. */
  empty: boolean;
  /**
   * SPEC-020: o dia em que as referências começam a contar (0%): o pregão antes do primeiro ponto,
   * se a carteira já tinha patrimônio, ou o dia do primeiro ponto. `null` sem lançamentos.
   */
  baseDate: IsoDate | null;
  /** SPEC-020: CDI e Ibovespa sempre; IFIX se a carteira teve FII no período. */
  benchmarks: BenchmarkSummary[];
  /** SPEC-020: "% do CDI" sem casas ("61"), só com a carteira e o CDI acima de 0%. */
  cdiShare: string | null;
}

export function validatePerformanceQuery(input: unknown): ValidationResult<PerformanceQuery> {
  const { query, fields } = periodQuery(asRecord(input), PERFORMANCE_PERIODS, 'all');
  if (!query) return { success: false, fields };
  return { success: true, data: query };
}

/**
 * Um período conhecido (vazio é `fallback`) ou duas datas em ordem; o período junto com as datas é
 * `not_allowed`. Se as datas passam de hoje, quem diz é o servidor (`after_today`).
 */
function periodQuery<P extends string>(
  record: Record<string, unknown>,
  periods: readonly P[],
  fallback: P,
): { query: { period: P } | { from: IsoDate; to: IsoDate } | null; fields: FieldErrors } {
  const { period, from, to } = record;
  if (from === undefined && to === undefined) {
    if (period === undefined || period === '') return { query: { period: fallback }, fields: {} };
    if (typeof period !== 'string' || !(periods as readonly string[]).includes(period)) {
      return { query: null, fields: { period: 'invalid_option' } };
    }
    return { query: { period: period as P }, fields: {} };
  }
  const fields: FieldErrors = {};
  const date = (value: unknown, key: 'from' | 'to') => {
    if (value === undefined || value === '') fields[key] = 'required';
    else if (typeof value !== 'string' || !isIsoDate(value)) fields[key] = 'invalid_date';
  };
  date(from, 'from');
  date(to, 'to');
  if (period !== undefined) fields.period = 'not_allowed';
  if (Object.keys(fields).length === 0 && (from as string) > (to as string)) {
    fields.from = 'after_end';
  }
  if (Object.keys(fields).length > 0) return { query: null, fields };
  return { query: { from: from as IsoDate, to: to as IsoDate }, fields };
}

// --- Comparação de carteiras (SPEC-022) ---

/** De 2 a 4 carteiras (SPEC-022 §4.1, decisão 3). */
export const COMPARISON_MIN = 2;
export const COMPARISON_MAX = 4;

/**
 * "Em comum" (o padrão: do início da carteira mais nova até hoje) e os períodos da SPEC-019
 * (§4.1, decisão 4).
 */
export const COMPARISON_PERIODS = ['common', ...PERFORMANCE_PERIODS] as const;
export type ComparisonPeriod = (typeof COMPARISON_PERIODS)[number];

/** As carteiras na ordem da tela, com o período ou as duas datas. */
export type ComparisonQuery = { ids: string[] } & (
  { period: ComparisonPeriod } | { from: IsoDate; to: IsoDate }
);

/** Um ponto de uma carteira no gráfico: a rentabilidade da cota desde o início dela no período. */
export interface ComparisonPoint {
  date: IsoDate;
  return: string;
}

/** A rentabilidade de uma carteira no período, com os mesmos números da tela dela (CA03). */
export interface ComparedPerformance {
  /**
   * Onde a conta desta carteira começa: o início do período ou, se ela começou depois, o dia do
   * primeiro lançamento ("começou em …").
   */
  from: IsoDate;
  startValue: string;
  endValue: string;
  netFlows: string;
  result: string;
  return: string;
  /** "% do CDI" pela regra da SPEC-020, com o CDI desde o dia-base desta carteira. */
  cdiShare: string | null;
  /** Sem lançamento até o fim do período: "Sem lançamentos no período", sem linha no gráfico. */
  empty: boolean;
  warnings: PerformanceWarning[];
  series: ComparisonPoint[];
}

export interface ComparedPortfolio {
  id: string;
  name: string;
  type: PortfolioType;
  startDate: IsoDate;
  performance: ComparedPerformance;
  /** A distribuição de hoje (SPEC-021), qualquer que seja o período. */
  allocation: PortfolioAllocation;
}

/** Uma referência no período (SPEC-020), sem "o mesmo dinheiro": cada carteira tem o seu. */
export type ComparisonBenchmark = Omit<BenchmarkSummary, 'endValue'>;

/** Corpo de `GET /api/portfolios/comparison` (SPEC-022 §5.1). */
export interface PortfolioComparison {
  from: IsoDate;
  to: IsoDate;
  /** O dia em que as referências valem 0%, o mesmo para todas; `null` sem nenhum lançamento. */
  baseDate: IsoDate | null;
  /** Acima de 2 anos, um ponto por semana. */
  weekly: boolean;
  /** CDI e Ibovespa; IFIX se alguma carteira teve FII no período. */
  benchmarks: ComparisonBenchmark[];
  /** Os dias do gráfico, com a rentabilidade de cada referência desde `baseDate`. */
  benchmarkSeries: Array<{ date: IsoDate; benchmarks: Record<BenchmarkCode, string | null> }>;
  /** Na ordem pedida. */
  portfolios: ComparedPortfolio[];
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Valida a comparação (SPEC-022 §4.2): `ids` com 2 a 4 ids de carteira, separados por vírgula e
 * sem repetir (`invalid_selection`), e o período (padrão "Em comum") ou as duas datas.
 */
export function validateComparisonQuery(input: unknown): ValidationResult<ComparisonQuery> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const raw = record.ids;
  const ids = typeof raw === 'string' ? raw.split(',').map((id) => id.trim().toLowerCase()) : null;
  if (
    ids === null ||
    ids.length < COMPARISON_MIN ||
    ids.length > COMPARISON_MAX ||
    ids.some((id) => !UUID_LIKE.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    fields.ids = 'invalid_selection';
  }
  const period = periodQuery(record, COMPARISON_PERIODS, 'common');
  Object.assign(fields, period.fields);
  if (Object.keys(fields).length > 0 || !period.query) return { success: false, fields };
  return { success: true, data: { ids: ids as string[], ...period.query } };
}
