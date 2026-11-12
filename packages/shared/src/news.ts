import type { FieldErrors, ValidationResult } from './auth.js';

/** Rotas das fontes de notícias (SPEC-027 §5.1), só para o colaborador. */
export const NEWS_PATHS = {
  sources: '/api/news/sources',
  source: '/api/news/sources/:id',
} as const;

export function newsSourcePath(id: string): string {
  return NEWS_PATHS.source.replace(':id', encodeURIComponent(id));
}

/** Erros das rotas de notícias (SPEC-027 §5.1). */
export type NewsErrorCode = 'news_source_not_found' | 'source_exists' | 'parent_source';

/** Fonte pai (o Investidor10, fixa) ou curada (RSS ou Atom, pelo colaborador), DA19. */
export type NewsSourceKind = 'parent' | 'curated';

export const NEWS_CATEGORIES = ['economia', 'mercado', 'empresas', 'internacional'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const NEWS_SOURCE_NAME_MAX = 80;
export const NEWS_SOURCE_URL_MAX = 500;
/** Falhas seguidas a partir das quais a fonte aparece "com problema" (SPEC-027 §4.2). */
export const NEWS_SOURCE_PROBLEM_AFTER = 3;

export interface NewsSource {
  id: string;
  kind: NewsSourceKind;
  name: string;
  url: string;
  /** `null` na fonte pai. */
  category: NewsCategory | null;
  /** De 1 a 5; `null` na fonte pai. */
  reliability: number | null;
  active: boolean;
  /** ISO 8601 da última coleta, ou `null` se nunca coletou. */
  lastRunAt: string | null;
  lastStatus: 'success' | 'failure' | null;
  lastError: string | null;
  failures: number;
  /** Notícias guardadas desta fonte. */
  news: number;
}

/** Carga do arquivo da fonte pai (SPEC-027 §4.1, decisão 3). */
export interface NewsArchiveProgress {
  done: number;
  total: number;
  status: 'running' | 'finished';
  updatedAt: string;
}

/** Corpo de `GET /api/news/sources`. */
export interface NewsSourcesStatus {
  sources: NewsSource[];
  /** `null` enquanto a carga do arquivo não começou. */
  archive: NewsArchiveProgress | null;
  /** O interruptor `INVESTIDOR10_ENABLED`: desligado, a fonte pai não é coletada. */
  parentEnabled: boolean;
}

export interface NewNewsSourceInput {
  name: string;
  url: string;
  category: NewsCategory;
  reliability: number;
  licenseChecked: true;
}

export interface UpdateNewsSourceInput {
  name?: string;
  category?: NewsCategory;
  reliability?: number;
  active?: boolean;
}

/** Corpo de `POST /api/news/sources`: a fonte e quantos itens o primeiro teste do feed achou. */
export interface NewsSourceCreated {
  source: NewsSource;
  items: number;
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
}

function checkName(value: unknown, fields: FieldErrors): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    fields.name = 'required';
    return undefined;
  }
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > NEWS_SOURCE_NAME_MAX) fields.name = 'too_long';
  return name;
}

function checkCategory(value: unknown, fields: FieldErrors): NewsCategory | undefined {
  if (value === undefined || value === '') {
    fields.category = 'required';
    return undefined;
  }
  if (typeof value !== 'string' || !(NEWS_CATEGORIES as readonly string[]).includes(value)) {
    fields.category = 'invalid_option';
    return undefined;
  }
  return value as NewsCategory;
}

function checkReliability(value: unknown, fields: FieldErrors): number | undefined {
  if (value === undefined || value === '') {
    fields.reliability = 'required';
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    fields.reliability = 'invalid_option';
    return undefined;
  }
  return value;
}

/**
 * Endereço do feed: `https`, com host, sem usuário e senha, até 500 caracteres. Endereço interno
 * (`localhost`, IP privado) é conferido também no servidor, depois de resolver o nome (§4.2).
 */
export function checkFeedUrl(value: unknown): { url: string } | { error: FieldErrors[string] } {
  if (typeof value !== 'string' || value.trim() === '') return { error: 'required' };
  const text = value.trim();
  if (text.length > NEWS_SOURCE_URL_MAX) return { error: 'too_long' };
  // Sem `URL` aqui (o pacote roda sem as bibliotecas do Node e do navegador): esquema, autoridade
  // e o resto. O servidor confere de novo, com o endereço resolvido.
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]*)([^\s]*)$/i.exec(text);
  if (!match) return { error: 'invalid_url' };
  const [, scheme = '', authority = '', rest = ''] = match;
  if (scheme.toLowerCase() !== 'https') return { error: 'not_https' };
  if (authority === '' || authority.includes('@')) return { error: 'invalid_url' };
  const host = authority.replace(/:\d+$/, '');
  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/i.test(host)) return { error: 'invalid_url' };
  return { url: `https://${authority.toLowerCase()}${rest.replace(/#.*$/, '') || '/'}` };
}

export function validateNewNewsSource(input: unknown): ValidationResult<NewNewsSourceInput> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const name = checkName(record.name, fields);
  const url = checkFeedUrl(record.url);
  if ('error' in url && url.error) fields.url = url.error;
  const category = checkCategory(record.category, fields);
  const reliability = checkReliability(record.reliability, fields);
  if (record.licenseChecked !== true) fields.licenseChecked = 'required';
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      name: name as string,
      url: (url as { url: string }).url,
      category: category as NewsCategory,
      reliability: reliability as number,
      licenseChecked: true,
    },
  };
}

/** Só os campos enviados mudam; o endereço e o tipo não mudam (`immutable`). */
export function validateUpdateNewsSource(input: unknown): ValidationResult<UpdateNewsSourceInput> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const data: UpdateNewsSourceInput = {};
  if (record.url !== undefined) fields.url = 'immutable';
  if (record.kind !== undefined) fields.kind = 'immutable';
  if (record.name !== undefined) {
    const name = checkName(record.name, fields);
    if (name !== undefined) data.name = name;
  }
  if (record.category !== undefined) {
    const category = checkCategory(record.category, fields);
    if (category !== undefined) data.category = category;
  }
  if (record.reliability !== undefined) {
    const reliability = checkReliability(record.reliability, fields);
    if (reliability !== undefined) data.reliability = reliability;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') fields.active = 'invalid_option';
    else data.active = record.active;
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  if (Object.keys(data).length === 0) return { success: false, fields: { name: 'required' } };
  return { success: true, data };
}
