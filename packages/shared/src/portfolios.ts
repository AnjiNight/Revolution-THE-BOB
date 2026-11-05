import type { FieldErrorCode, FieldErrors, ValidationResult } from './auth.js';
import { isIsoDate, type IsoDate } from './calendar.js';

/** Rotas das carteiras (SPEC-012 §5.1). `:id` vira o id da carteira com `portfolioPath`. */
export const PORTFOLIO_PATHS = {
  list: '/api/portfolios',
  item: '/api/portfolios/:id',
} as const;

export function portfolioPath(id: string): string {
  return PORTFOLIO_PATHS.item.replace(':id', encodeURIComponent(id));
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
}

export interface RenamePortfolioInput {
  name: string;
}

/** Erros das rotas de carteira. */
export type PortfolioErrorCode =
  'portfolio_not_found' | 'portfolio_name_in_use' | 'portfolio_limit_reached';

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

  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      name: normalizePortfolioName(raw.name as string),
      type: type as PortfolioType,
      ...(startDate ? { startDate } : {}),
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
