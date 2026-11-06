import type { FieldErrorCode, FieldErrors, ValidationResult } from './auth.js';
import { isIsoDate, type IsoDate } from './calendar.js';

/**
 * Rotas das carteiras (SPEC-012 §5.1) e do caixa (SPEC-013 §5.1). `:id` vira o id da carteira com
 * `portfolioPath` e `portfolioCashPath`.
 */
export const PORTFOLIO_PATHS = {
  list: '/api/portfolios',
  item: '/api/portfolios/:id',
  cash: '/api/portfolios/:id/cash',
} as const;

export function portfolioPath(id: string): string {
  return PORTFOLIO_PATHS.item.replace(':id', encodeURIComponent(id));
}

export function portfolioCashPath(id: string): string {
  return PORTFOLIO_PATHS.cash.replace(':id', encodeURIComponent(id));
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

/** Erros das rotas de carteira e do caixa. */
export type PortfolioErrorCode =
  'portfolio_not_found' | 'portfolio_name_in_use' | 'portfolio_limit_reached' | 'insufficient_cash';

// --- Caixa (SPEC-013) ---

/** Aporte (põe dinheiro) ou retirada (tira dinheiro). */
export const CASH_ENTRY_TYPES = ['deposit', 'withdrawal'] as const;
export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];

/** Valor de cada lançamento: de R$ 0,01 a R$ 10.000.000,00, com 2 casas (SPEC-013 §4.1). */
export const CASH_AMOUNT_MIN = '0.01';
export const CASH_AMOUNT_MAX = '10000000.00';
/** Lançamentos do extrato por página ("Mostrar mais"). */
export const CASH_PAGE_SIZE = 100;

/** Um lançamento do extrato, com o saldo logo depois dele. Valores em decimal com 2 casas. */
export interface CashEntry {
  id: string;
  type: CashEntryType;
  amount: string;
  /** AAAA-MM-DD: na ao vivo, o dia do registro em Brasília; na histórica, o dia escolhido. */
  date: IsoDate;
  /** ISO 8601: quando o servidor registrou. */
  recordedAt: string;
  balanceAfter: string;
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
