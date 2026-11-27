import { isPriceHistoryPeriod, type PriceHistoryPeriod } from './asset-detail.js';
import { isAssetClass, isSectorOf, type AssetClass, type SectorCode } from './assets.js';
import type { FieldErrors, ValidationResult } from './auth.js';
import { addDays, isIsoDate, isoDateInBrasilia, type IsoDate } from './calendar.js';

/** Rotas das fontes de notícias (SPEC-027 §5.1), só para o colaborador. */
export const NEWS_PATHS = {
  sources: '/api/news/sources',
  source: '/api/news/sources/:id',
  /** SPEC-028: as últimas notícias com os vínculos, para o colaborador conferir. */
  latest: '/api/news/latest',
} as const;

/** SPEC-028: o ativo é o assunto, aparece no texto ou a notícia é uma lista com muitos ativos. */
export type NewsLinkRelevance = 'principal' | 'citado' | 'lista';

export interface NewsAssetLink {
  ticker: string;
  relevance: NewsLinkRelevance;
}

export interface LatestNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  /** ISO 8601. */
  publishedAt: string;
  /** Principais primeiro, depois citados e de lista, cada grupo por ticker. */
  links: NewsAssetLink[];
}

/** Corpo de `GET /api/news/latest`. */
export interface LatestNews {
  /** Notícias guardadas. */
  total: number;
  /** Com pelo menos um vínculo. */
  linked: number;
  news: LatestNewsItem[];
}

/** Notícias por página na lista do colaborador. */
export const LATEST_NEWS_LIMIT = 20;

/** SPEC-029: notícias do ativo na ficha. `:id` vira o id do ativo com `assetPath`. */
export const ASSET_NEWS_PATHS = {
  list: '/api/assets/:id/news',
  days: '/api/assets/:id/news/days',
} as const;

/** `main`: o ativo é o assunto ou é citado; `list`: a notícia é uma lista (SPEC-029 §4.1, decisão 2). */
export const ASSET_NEWS_GROUPS = ['main', 'list'] as const;
export type AssetNewsGroup = (typeof ASSET_NEWS_GROUPS)[number];

/** Notícias por página na ficha (SPEC-029 §4.2). */
export const ASSET_NEWS_PAGE_SIZE = 10;
/** Distância máxima entre `after` e `until`, no painel de um pregão. */
export const ASSET_NEWS_MAX_RANGE_DAYS = 31;
/** Depois desta hora de Brasília, a notícia conta para o pregão seguinte (§4.1, decisão 3). */
export const NEWS_SESSION_CUTOFF_HOUR = 18;

export interface AssetNewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  /** ISO 8601. */
  publishedAt: string;
  relevance: NewsLinkRelevance;
  /** SPEC-044: `null` se a notícia está pendente ou se o modelo não passou na avaliação. */
  sentiment: NewsSentiment | null;
  /** SPEC-030: a notícia veio de um feed próprio do usuário ("Sua fonte"). */
  ownSource: boolean;
}

/** Corpo de `GET /api/assets/:id/news`. */
export interface AssetNewsPage {
  /** Notícias do grupo pedido (e do intervalo, se houver). */
  total: number;
  /** Notícias de lista do ativo, para o título do grupo fechado. */
  listTotal: number;
  news: AssetNewsItem[];
  /** SPEC-044: o modelo cujo sentimento aparece, ou `null` se nenhum passou na avaliação. */
  model: SentimentModelName | null;
}

export interface AssetNewsQuery {
  group: AssetNewsGroup;
  offset: number;
  /** Dias de referência: depois de `after` até `until` (o painel de um pregão). */
  after?: IsoDate;
  until?: IsoDate;
}

export interface AssetNewsDay {
  /** Dia de referência (`newsReferenceDay`). */
  day: IsoDate;
  count: number;
  /** SPEC-044: as notícias classificadas do dia por sentimento; `null` sem modelo visível. */
  sentiment: SentimentCounts | null;
}

/** Corpo de `GET /api/assets/:id/news/days`: as notícias principal e citado por dia. */
export interface AssetNewsDays {
  period: PriceHistoryPeriod;
  days: AssetNewsDay[];
  /** SPEC-044: o modelo cujo sentimento aparece, ou `null`. */
  model: SentimentModelName | null;
}

/** SPEC-044: o tom da notícia para o ativo principal (ou para o mercado, sem ativo principal). */
export const NEWS_SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export type NewsSentiment = (typeof NEWS_SENTIMENTS)[number];

export type SentimentCounts = Record<NewsSentiment, number>;

export function isNewsSentiment(value: unknown): value is NewsSentiment {
  return typeof value === 'string' && (NEWS_SENTIMENTS as readonly string[]).includes(value);
}

/** Rotas do sentimento (SPEC-044 §5.1), só para o colaborador. */
export const SENTIMENT_PATHS = {
  summary: '/api/news/sentiment',
  next: '/api/news/sentiment/next',
  evaluate: '/api/news/sentiment/evaluate',
  label: '/api/news/:id/label',
} as const;

export function newsLabelPath(id: string): string {
  return SENTIMENT_PATHS.label.replace(':id', encodeURIComponent(id));
}

/** Parte mais nova da amostra rotulada, separada para a nota (§4.1, decisão 3). */
export const SENTIMENT_TEST_SHARE = 0.4;
/** Notícias de teste e F1 macro mínimas para o usuário ver o sentimento (§4.1, decisão 4). */
export const SENTIMENT_MIN_TEST = 60;
export const SENTIMENT_MIN_F1 = 0.6;
/** Abaixo disso, nem dá para avaliar (409 `not_enough_labels`). */
export const SENTIMENT_MIN_EVALUATE = 10;
/** Ids pulados que o colaborador pode mandar ao pedir a próxima notícia. */
export const SENTIMENT_SKIP_MAX = 50;
/** Rotulados mais recentes na tela, para trocar ou apagar. */
export const SENTIMENT_RECENT_LABELS = 20;

export interface SentimentModelName {
  name: string;
  number: number;
}

export interface SentimentEvaluation {
  /** ISO 8601. */
  evaluatedAt: string;
  /** Notícias de teste classificadas pela versão. */
  testSize: number;
  accuracy: number;
  macroF1: number;
  /** Linhas: o rótulo; colunas: o modelo; as duas na ordem de `NEWS_SENTIMENTS`. */
  matrix: number[][];
}

export interface SentimentModelVersion extends SentimentModelName {
  status: 'in_use' | 'retired';
  /** ISO 8601 de quando a versão foi registrada. */
  createdAt: string;
  evaluation: SentimentEvaluation | null;
}

/** Por que o usuário não vê o sentimento. */
export type SentimentHiddenReason = 'no_model' | 'not_evaluated' | 'few_tests' | 'low_score';

export interface LabeledNews {
  id: string;
  title: string;
  url: string;
  /** ISO 8601. */
  publishedAt: string;
  label: NewsSentiment;
  /** ISO 8601. */
  labeledAt: string;
}

/** Corpo de `GET /api/news/sentiment`. */
export interface SentimentSummary {
  current: SentimentModelVersion | null;
  /** Notícias guardadas, e quantas a versão em uso já classificou. */
  total: number;
  classified: number;
  labels: { total: number; tuning: number; test: number };
  visible: boolean;
  hiddenReason: SentimentHiddenReason | null;
  /** As versões retiradas, das mais novas, com a nota que tinham. */
  history: SentimentModelVersion[];
  recentLabels: LabeledNews[];
}

/** Corpo de `GET /api/news/sentiment/next`: sem a classificação do modelo, para não influenciar. */
export interface NewsToLabel {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  /** ISO 8601. */
  publishedAt: string;
  /** Tickers em que a notícia é principal. */
  principal: string[];
}

export function validateNewsLabel(input: unknown): ValidationResult<{ sentiment: NewsSentiment }> {
  const sentiment = asRecord(input).sentiment;
  if (!isNewsSentiment(sentiment)) {
    return { success: false, fields: { sentiment: 'invalid_option' } };
  }
  return { success: true, data: { sentiment } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `skip`: ids separados por vírgula, até `SENTIMENT_SKIP_MAX`. */
export function validateSentimentNextQuery(input: unknown): ValidationResult<{ skip: string[] }> {
  const text = asRecord(input).skip ?? '';
  if (typeof text !== 'string') return { success: false, fields: { skip: 'invalid_option' } };
  const skip = text === '' ? [] : text.split(',');
  if (skip.length > SENTIMENT_SKIP_MAX || skip.some((id) => !UUID.test(id))) {
    return { success: false, fields: { skip: 'invalid_option' } };
  }
  return { success: true, data: { skip } };
}

/**
 * Dia de referência da notícia (SPEC-029 §4.1, decisão 3): a data de Brasília depois de somar 6
 * horas. Até as 18h, o próprio dia; depois, o seguinte. O pregão da notícia é o primeiro pregão
 * nesse dia ou depois (fim de semana e feriado passam para o próximo).
 */
export function newsReferenceDay(publishedAt: Date): IsoDate {
  const shift = (24 - NEWS_SESSION_CUTOFF_HOUR) * 3_600_000;
  return isoDateInBrasilia(new Date(publishedAt.getTime() + shift));
}

/**
 * Primeiro instante do dia de referência: as 18h de Brasília da véspera. Brasília está em UTC−3,
 * sem horário de verão desde 2019 (as notícias começam em 2023).
 */
export function newsReferenceDayStart(day: IsoDate): Date {
  return new Date(`${addDays(day, -1)}T${NEWS_SESSION_CUTOFF_HOUR}:00:00-03:00`);
}

function isIsoDay(value: unknown): value is IsoDate {
  return typeof value === 'string' && isIsoDate(value);
}

export function validateAssetNewsQuery(input: unknown): ValidationResult<AssetNewsQuery> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const group = record.group ?? 'main';
  if (typeof group !== 'string' || !(ASSET_NEWS_GROUPS as readonly string[]).includes(group)) {
    fields.group = 'invalid_option';
  }
  // Da query string (servidor) vem texto; da tela (o cliente do app confere antes), número. Múltiplo
  // de 10 (a página).
  const offsetText = record.offset ?? '0';
  const offset =
    typeof offsetText === 'number'
      ? offsetText
      : typeof offsetText === 'string' && /^\d{1,6}$/.test(offsetText)
        ? Number(offsetText)
        : NaN;
  if (!Number.isInteger(offset) || offset < 0 || offset % ASSET_NEWS_PAGE_SIZE !== 0) {
    fields.offset = 'invalid_option';
  }
  const { after, until } = record;
  if (after !== undefined || until !== undefined) {
    if (!isIsoDay(after)) fields.after = 'invalid_date';
    if (!isIsoDay(until)) fields.until = 'invalid_date';
    if (isIsoDay(after) && isIsoDay(until)) {
      if (after >= until) fields.until = 'before_start';
      else if (addDays(after, ASSET_NEWS_MAX_RANGE_DAYS) < until) fields.until = 'too_long';
    }
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      group: group as AssetNewsGroup,
      offset,
      ...(isIsoDay(after) && isIsoDay(until) ? { after, until } : {}),
    },
  };
}

export function validateAssetNewsDaysQuery(
  input: unknown,
): ValidationResult<{ period: PriceHistoryPeriod }> {
  const period = asRecord(input).period ?? '1y';
  if (!isPriceHistoryPeriod(period))
    return { success: false, fields: { period: 'invalid_option' } };
  return { success: true, data: { period } };
}

export function newsSourcePath(id: string): string {
  return NEWS_PATHS.source.replace(':id', encodeURIComponent(id));
}

/** Erros das rotas de notícias (SPEC-027 §5.1). */
export type NewsErrorCode =
  | 'news_source_not_found'
  | 'source_exists'
  | 'parent_source'
  // SPEC-044
  | 'news_not_found'
  | 'no_model'
  | 'not_enough_labels'
  // SPEC-030
  | 'source_limit_reached'
  | 'already_added'
  | 'already_in_app'
  | 'not_stopped'
  | 'not_own_source';

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
  /** SPEC-030: só os totais dos feeds dos usuários, sem os endereços (DA13). */
  userSources: UserSourcesTotals;
}

/** SPEC-030: os feeds adicionados pelos usuários, para o colaborador. */
export interface UserSourcesTotals {
  total: number;
  /** Com mais de `NEWS_SOURCE_PROBLEM_AFTER` falhas seguidas, ainda não parados. */
  failing: number;
  stopped: number;
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

// --- SPEC-030: fontes do usuário e tela Notícias ---

/** Rotas do usuário (e do colaborador na Visão do usuário, SPEC-045). */
export const MY_NEWS_PATHS = {
  sources: '/api/news/my-sources',
  source: '/api/news/my-sources/:id',
  retry: '/api/news/my-sources/:id/retry',
  feed: '/api/news/feed',
} as const;

export function myNewsSourcePath(id: string): string {
  return MY_NEWS_PATHS.source.replace(':id', encodeURIComponent(id));
}

export function myNewsSourceRetryPath(id: string): string {
  return MY_NEWS_PATHS.retry.replace(':id', encodeURIComponent(id));
}

/** Prioridade que o usuário dá a cada fonte (§4.1, decisão 2). */
export const SOURCE_PRIORITIES = ['high', 'medium', 'low'] as const;
export type SourcePriority = (typeof SOURCE_PRIORITIES)[number];

export function isSourcePriority(value: unknown): value is SourcePriority {
  return typeof value === 'string' && (SOURCE_PRIORITIES as readonly string[]).includes(value);
}

/** O peso de cada prioridade na ordem e no tom; a fonte pai fica sempre acima (DA19). */
export const SOURCE_PRIORITY_WEIGHT: Readonly<Record<SourcePriority, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};
export const PARENT_SOURCE_WEIGHT = 4;
/** Sem escolha do usuário, a curada e o feed próprio valem Média (§4.2). */
export const DEFAULT_SOURCE_PRIORITY: SourcePriority = 'medium';

/** Feeds próprios por usuário (§4.1, decisão 3). */
export const OWN_FEEDS_LIMIT = 10;
/** Falhas seguidas que param o feed próprio: um dia de leituras de hora em hora (§4.2). */
export const OWN_FEED_STOP_AFTER = 24;
/** As notícias dos feeds dos usuários ficam 12 meses (§4.2). */
export const USER_NEWS_RETENTION_DAYS = 365;

/** Notícias por página na tela Notícias (§4.2). */
export const NEWS_FEED_PAGE_SIZE = 20;
/** Classificadas no filtro para o resumo do tom aparecer (§4.2). */
export const NEWS_TONE_MIN = 10;

export const NEWS_FEED_PERIODS = ['7d', '30d', '90d', '12m'] as const;
export type NewsFeedPeriod = (typeof NEWS_FEED_PERIODS)[number];
export const NEWS_FEED_PERIOD_DAYS: Readonly<Record<NewsFeedPeriod, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};

/** Fonte pai (fixa), curada (do app) ou um feed próprio do usuário. */
export type MySourceKind = 'parent' | 'curated' | 'own';

/**
 * Situação do feed próprio: `pending` antes da primeira leitura do processador, `failing` com
 * mais de `NEWS_SOURCE_PROBLEM_AFTER` falhas seguidas, `stopped` depois de `OWN_FEED_STOP_AFTER`.
 */
export type OwnFeedStatus = 'ok' | 'pending' | 'failing' | 'stopped';

export interface MyNewsSource {
  id: string;
  kind: MySourceKind;
  /** No feed próprio, o nome que o usuário deu (ou o título do feed). */
  name: string;
  url: string;
  /** Sempre `true` na fonte pai. */
  active: boolean;
  /** `null` na fonte pai, que tem sempre o peso maior. */
  priority: SourcePriority | null;
  weight: number;
  /** Só nas curadas. */
  category: NewsCategory | null;
  /** Só nos feeds próprios; `null` nas outras. */
  status: OwnFeedStatus | null;
  /** ISO 8601 da última leitura do feed próprio. */
  lastRunAt: string | null;
  /** Notícias guardadas do feed próprio. */
  news: number | null;
}

/** Corpo de `GET /api/news/my-sources`: a pai, as curadas ligadas pelo colaborador e os feeds. */
export interface MyNewsSources {
  sources: MyNewsSource[];
  ownLimit: number;
  ownCount: number;
}

export interface NewOwnFeedInput {
  url: string;
  /** Vazio: o título do feed. */
  name?: string;
}

/** Corpo de `POST /api/news/my-sources`. */
export interface OwnFeedCreated {
  source: MyNewsSource;
  /** Itens que a leitura na hora achou. */
  items: number;
}

export interface UpdateMySourceInput {
  active?: boolean;
  priority?: SourcePriority;
  /** Só no feed próprio. */
  name?: string;
}

export function validateNewOwnFeed(input: unknown): ValidationResult<NewOwnFeedInput> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const url = checkFeedUrl(record.url);
  if ('error' in url && url.error) fields.url = url.error;
  let name: string | undefined;
  if (record.name !== undefined && record.name !== null && record.name !== '') {
    if (typeof record.name !== 'string') fields.name = 'invalid_option';
    else {
      name = record.name.trim().replace(/\s+/g, ' ');
      if (name.length > NEWS_SOURCE_NAME_MAX) fields.name = 'too_long';
      if (name === '') name = undefined;
    }
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: { url: (url as { url: string }).url, ...(name ? { name } : {}) },
  };
}

export function validateUpdateMySource(input: unknown): ValidationResult<UpdateMySourceInput> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const data: UpdateMySourceInput = {};
  if (record.url !== undefined) fields.url = 'immutable';
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') fields.active = 'invalid_option';
    else data.active = record.active;
  }
  if (record.priority !== undefined) {
    if (!isSourcePriority(record.priority)) fields.priority = 'invalid_option';
    else data.priority = record.priority;
  }
  if (record.name !== undefined) {
    const name = checkName(record.name, fields);
    if (name !== undefined && !fields.name) data.name = name;
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  if (Object.keys(data).length === 0) return { success: false, fields: { active: 'required' } };
  return { success: true, data };
}

/** O setor do filtro: a classe junto, porque "outros" existe nas duas (SPEC-006). */
export interface NewsFeedSector {
  class: AssetClass;
  code: SectorCode;
}

export interface NewsFeedQuery {
  period: NewsFeedPeriod;
  offset: number;
  /** Id do ativo: as notícias em que ele é principal ou citado. */
  asset?: string;
  sector?: NewsFeedSector;
  sentiment?: NewsSentiment;
  /** Id de uma das fontes do usuário. */
  source?: string;
}

/** O setor na query string: `stock:bancos`. */
export function newsFeedSectorParam(sector: NewsFeedSector): string {
  return `${sector.class}:${sector.code}`;
}

export function validateNewsFeedQuery(input: unknown): ValidationResult<NewsFeedQuery> {
  const record = asRecord(input);
  const fields: FieldErrors = {};
  const period = record.period ?? '30d';
  if (typeof period !== 'string' || !(NEWS_FEED_PERIODS as readonly string[]).includes(period)) {
    fields.period = 'invalid_option';
  }
  // Da query string (servidor) vem texto; da tela (o cliente do app confere antes), número.
  const offsetText = record.offset ?? '0';
  const offset =
    typeof offsetText === 'number'
      ? offsetText
      : typeof offsetText === 'string' && /^\d{1,6}$/.test(offsetText)
        ? Number(offsetText)
        : NaN;
  if (!Number.isInteger(offset) || offset < 0 || offset % NEWS_FEED_PAGE_SIZE !== 0) {
    fields.offset = 'invalid_option';
  }
  const query: Partial<NewsFeedQuery> = {};
  for (const key of ['asset', 'source'] as const) {
    const value = record[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !UUID.test(value)) fields[key] = 'invalid_option';
    else query[key] = value.toLowerCase();
  }
  if (record.sector !== undefined && record.sector !== '') {
    // Na query string, `stock:financeiro`; na tela, o objeto `{ class, code }`.
    const sector = asRecord(record.sector);
    const [assetClass = '', code = ''] =
      typeof record.sector === 'string'
        ? record.sector.split(':')
        : [String(sector.class ?? ''), String(sector.code ?? '')];
    if (isAssetClass(assetClass) && isSectorOf(assetClass, code)) {
      query.sector = { class: assetClass, code };
    } else fields.sector = 'invalid_option';
  }
  if (record.sentiment !== undefined && record.sentiment !== '') {
    if (!isNewsSentiment(record.sentiment)) fields.sentiment = 'invalid_option';
    else query.sentiment = record.sentiment;
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return { success: true, data: { ...query, period: period as NewsFeedPeriod, offset } };
}

export interface NewsFeedAsset {
  id: string;
  ticker: string;
}

export interface NewsFeedItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  /** "Sua fonte": veio de um feed próprio. */
  ownSource: boolean;
  /** ISO 8601. */
  publishedAt: string;
  /** `null` se pendente ou sem modelo visível (SPEC-044). */
  sentiment: NewsSentiment | null;
  /** Os ativos em que a notícia é principal ou citada, principais primeiro. */
  assets: NewsFeedAsset[];
}

/** Por que o resumo do tom não aparece. */
export type NewsToneHiddenReason = 'no_model' | 'few_news';

/** O tom ponderado das notícias do filtro (§4.2): cada parte de 0 a 1, somando 1. */
export interface NewsTone {
  shares: Record<NewsSentiment, number>;
  /** Notícias classificadas que entraram na conta. */
  classified: number;
}

/** Corpo de `GET /api/news/feed`. */
export interface NewsFeedPage {
  total: number;
  news: NewsFeedItem[];
  /** O modelo cujo sentimento aparece, ou `null`. */
  model: SentimentModelName | null;
  /** `null` quando não aparece; o motivo em `toneHidden`. */
  tone: NewsTone | null;
  toneHidden: NewsToneHiddenReason | null;
}

/**
 * O tom ponderado (§4.2): a soma dos pesos de cada tom sobre a soma dos pesos das notícias
 * classificadas. `null` sem nenhuma classificada.
 */
export function weightedTone(
  items: ReadonlyArray<{ sentiment: NewsSentiment; weight: number }>,
): NewsTone | null {
  const sums: Record<NewsSentiment, number> = { positive: 0, neutral: 0, negative: 0 };
  let total = 0;
  for (const item of items) {
    sums[item.sentiment] += item.weight;
    total += item.weight;
  }
  if (items.length === 0 || total === 0) return null;
  return {
    shares: {
      positive: sums.positive / total,
      neutral: sums.neutral / total,
      negative: sums.negative / total,
    },
    classified: items.length,
  };
}

// --- SPEC-031: cenários por sentimento na ficha do ativo ---

/** Rota dos cenários do ativo. `:id` vira o id do ativo com `assetPath`. */
export const ASSET_SCENARIO_PATH = '/api/assets/:id/scenarios';

/**
 * Horizontes, em pregões depois do pregão da notícia (§4.1, decisão 3): 0 é o próprio pregão ("No
 * pregão"), como o painel do pregão da SPEC-029; o retorno é sempre sobre o fechamento anterior.
 */
export const SCENARIO_HORIZONS = [0, 5, 20] as const;
export type ScenarioHorizon = (typeof SCENARIO_HORIZONS)[number];

/** Faixa de "estável" de cada horizonte, em % para cima e para baixo (§4.1, decisão 3). */
export const SCENARIO_STABLE_LIMIT: Readonly<Record<ScenarioHorizon, number>> = {
  0: 1,
  5: 2,
  20: 4,
};

/** Abaixo disso, "dados insuficientes" (RB31). */
export const SCENARIO_MIN_OCCURRENCES = 30;

/** O mesmo limite das notícias (SPEC-044): acima de 0,2, positivo; abaixo de −0,2, negativo. */
export const SENTIMENT_BAND_LIMIT = 0.2;

/** A faixa de uma pontuação de −1 a 1. */
export function sentimentBand(score: number): NewsSentiment {
  if (score > SENTIMENT_BAND_LIMIT) return 'positive';
  if (score < -SENTIMENT_BAND_LIMIT) return 'negative';
  return 'neutral';
}

/** Um horizonte de uma faixa (ou da taxa-base): as partes de 0 a 1, ou nada abaixo do mínimo. */
export interface ScenarioCell {
  horizon: ScenarioHorizon;
  occurrences: number;
  /** `true` abaixo de `SCENARIO_MIN_OCCURRENCES`: sem as partes (RB31). */
  insufficient: boolean;
  down: number | null;
  flat: number | null;
  up: number | null;
}

/** O pregão de hoje (o primeiro depois do último fechamento guardado), se teve notícia. */
export interface ScenarioToday {
  band: NewsSentiment;
  /** Quantas notícias oficiais classificadas sobre o ativo. */
  news: number;
  /** Média das pontuações, de −1 a 1. */
  score: number;
}

/** Corpo de `GET /api/assets/:id/scenarios`. */
export interface AssetScenarios {
  /** `false` enquanto o sentimento não passou na avaliação (SPEC-044): sem números. */
  visible: boolean;
  model: SentimentModelName | null;
  today: ScenarioToday | null;
  /** Os pregões usados: desde o primeiro com notícia oficial classificada no banco. */
  period: { from: IsoDate; to: IsoDate; sessions: number } | null;
  /** As três faixas, cada uma com os três horizontes na ordem de `SCENARIO_HORIZONS`. */
  bands: Record<NewsSentiment, ScenarioCell[]> | null;
  /** A taxa-base: todos os pregões do período, com ou sem notícia. */
  base: ScenarioCell[] | null;
  /** Pregões com notícia no período (de qualquer faixa). */
  newsSessions: number;
  minOccurrences: number;
}
