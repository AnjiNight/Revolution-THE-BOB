import type { NewsCategory, NewsSentiment } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type { CatalogTicker, LinkOrigin, LinkRelevance } from '../domain/asset-links.js';
import type { DuplicateCandidate, DuplicateReason } from '../domain/duplicates.js';

/** Fonte como fica guardada (SPEC-027 §6). */
export interface StoredNewsSource {
  id: string;
  kind: 'parent' | 'curated';
  name: string;
  url: string;
  category: NewsCategory | null;
  reliability: number | null;
  active: boolean;
  licenseCheckedAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: 'success' | 'failure' | null;
  lastError: string | null;
  failures: number;
}

/** Notícia a guardar. O texto completo só existe na fonte pai. */
export interface NewsToSave {
  url: string;
  title: string;
  summary: string | null;
  body: string | null;
  author: string | null;
  themes: string[];
  companies: string[];
  publishedAt: Date;
  updatedAt: Date | null;
}

export interface ArchiveProgress {
  total: number;
  done: number;
  status: 'running' | 'finished';
  updatedAt: Date;
}

export interface NewsRepository {
  sources(): Promise<StoredNewsSource[]>;
  source(id: string): Promise<StoredNewsSource | null>;
  parentSource(): Promise<StoredNewsSource | null>;
  /** Quantas notícias cada fonte tem, pelo id da fonte. */
  newsCounts(): Promise<Map<string, number>>;
  /** SPEC-047: quantas repetidas cada fonte trouxe, pelo id da fonte. */
  duplicateCounts(): Promise<Map<string, number>>;
  /**
   * SPEC-047: notícias ainda não conferidas, na ordem em que valem como original (a primeira
   * coletada; no empate, a fonte pai e depois a maior confiabilidade).
   */
  newsToCheck(limit: number): Promise<DuplicateCandidate[]>;
  /** SPEC-047: as já conferidas que não são repetidas, publicadas em [`from`, `to`], na mesma ordem. */
  originalsAround(from: Date, to: Date): Promise<DuplicateCandidate[]>;
  /**
   * SPEC-047: marca a notícia como conferida e, se é repetida, liga à original numa transação: a
   * repetida perde o vínculo e o sentimento, e o rótulo da equipe passa para a original se ela não
   * tem um.
   */
  markChecked(
    newsId: string,
    duplicateOf: { originalId: string; reason: DuplicateReason } | null,
    at: Date,
  ): Promise<void>;
  /** Endereço → data de atualização guardada, das notícias da fonte. */
  storedUrls(sourceId: string): Promise<Map<string, Date | null>>;
  /**
   * Grava ou atualiza pela chave (fonte, endereço); a data de publicação de uma notícia já guardada
   * nunca muda. Devolve quantas eram novas.
   */
  saveNews(sourceId: string, news: readonly NewsToSave[], at: Date): Promise<number>;
  recordRun(
    sourceId: string,
    outcome: { status: 'success' | 'failure'; error: string | null },
    at: Date,
  ): Promise<void>;
  archive(sourceId: string): Promise<ArchiveProgress | null>;
  saveArchive(sourceId: string, progress: ArchiveProgress): Promise<void>;
  /** Lança NewsSourceExistsError se o endereço já está cadastrado; grava a auditoria junto. */
  createSource(
    source: {
      name: string;
      url: string;
      category: NewsCategory;
      reliability: number;
      licenseCheckedAt: Date;
    },
    audit: (id: string) => AuditEntry,
  ): Promise<StoredNewsSource>;
  updateSource(
    id: string,
    changes: { name?: string; category?: NewsCategory; reliability?: number; active?: boolean },
    at: Date,
    audit: AuditEntry,
  ): Promise<StoredNewsSource>;
  /** SPEC-027 §4.2: apaga as notícias e o andamento do arquivo da fonte pai. Devolve as linhas. */
  clearParent(): Promise<number>;
  /** SPEC-028: notícias nunca vinculadas ou vinculadas com outra versão da regra, das mais novas. */
  newsToLink(version: number, limit: number): Promise<NewsToLink[]>;
  /** Troca os vínculos da notícia e marca a versão, numa transação. */
  saveLinks(newsId: string, links: readonly StoredLink[], version: number, at: Date): Promise<void>;
  /** Os tickers do catálogo (ativos e desativados), para achar os citados. */
  catalogTickers(): Promise<CatalogTicker[]>;
  /** As últimas notícias guardadas, com a fonte e os vínculos (SPEC-028 §5.1). */
  latestNews(limit: number): Promise<LatestNewsRow[]>;
  /** Quantas notícias há e quantas têm pelo menos um vínculo. */
  linkCounts(): Promise<{ total: number; linked: number }>;
  /** SPEC-029: o ativo está no catálogo (ativo ou desativado). */
  assetExists(assetId: string): Promise<boolean>;
  /**
   * As notícias do ativo com essas relevâncias, publicadas em [`from`, `to`), das mais novas, e
   * quantas são ao todo.
   */
  assetNews(
    assetId: string,
    filter: AssetNewsFilter,
    page: { offset: number; limit: number },
  ): Promise<{ total: number; rows: AssetNewsRow[] }>;
  /**
   * O horário de publicação e a classificação das notícias do ativo com essas relevâncias, desde
   * `from`.
   */
  assetNewsDates(assetId: string, filter: AssetNewsFilter): Promise<AssetNewsDate[]>;
}

export interface AssetNewsFilter {
  relevances: readonly LinkRelevance[];
  from?: Date;
  to?: Date;
}

/** SPEC-044: o que o modelo disse e com qual versão; `null` se a notícia está pendente. */
export interface StoredClassification {
  sentiment: NewsSentiment;
  modelVersionId: number;
}

export interface AssetNewsRow {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: Date;
  relevance: LinkRelevance;
  classification: StoredClassification | null;
  /** SPEC-047: a mesma matéria em outras fontes. */
  alsoIn: Array<{ source: string; url: string }>;
}

export interface AssetNewsDate {
  publishedAt: Date;
  classification: StoredClassification | null;
}

/** SPEC-044: uma versão do modelo como fica guardada (DA20). */
export interface StoredModelVersion {
  id: number;
  name: string;
  number: number;
  status: 'in_use' | 'retired';
  createdAt: Date;
  evaluation: StoredEvaluation | null;
}

export interface StoredEvaluation {
  evaluatedAt: Date;
  testSize: number;
  accuracy: number;
  macroF1: number;
  matrix: number[][];
}

export interface NewsToClassify {
  id: string;
  title: string;
  summary: string | null;
}

export interface Classification {
  newsId: string;
  sentiment: NewsSentiment;
  score: number;
}

export interface LabelRow {
  publishedAt: Date;
  label: NewsSentiment;
  /** O que a versão pedida disse, ou `null` se ela não classificou a notícia. */
  predicted: NewsSentiment | null;
}

export interface StoredLabel {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  label: NewsSentiment;
  labeledAt: Date;
}

export interface StoredNewsToLabel {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: Date;
  principal: string[];
}

/** SPEC-044: versões do modelo, classificação das notícias e a amostra rotulada. */
export interface SentimentRepository {
  /**
   * Registra a versão, se é nova, e a deixa em uso; a que estava em uso fica retirada, com a nota.
   * Devolve o id.
   */
  useVersion(name: string, number: number, at: Date): Promise<number>;
  /** A versão em uso, ou `null` se o processador ainda não registrou nenhuma. */
  currentVersion(): Promise<StoredModelVersion | null>;
  /** As versões retiradas, das mais novas. */
  retiredVersions(): Promise<StoredModelVersion[]>;
  /** Notícias nunca classificadas ou classificadas por outra versão, das mais novas. */
  newsToClassify(versionId: number, limit: number): Promise<NewsToClassify[]>;
  saveClassifications(versionId: number, items: readonly Classification[], at: Date): Promise<void>;
  /** Quantas notícias há e quantas a versão classificou. */
  classifiedCounts(versionId: number | null): Promise<{ total: number; classified: number }>;
  /** Todos os rótulos, com o que a versão disse de cada notícia. */
  labels(versionId: number | null): Promise<LabelRow[]>;
  recentLabels(limit: number): Promise<StoredLabel[]>;
  /**
   * Uma notícia sem rótulo, fora das puladas; primeiro as que têm ativo principal, em ordem
   * sorteada. `null` se acabaram.
   */
  nextToLabel(skip: readonly string[]): Promise<StoredNewsToLabel | null>;
  /** Lança NewsNotFoundError se a notícia não existe. */
  saveLabel(newsId: string, sentiment: NewsSentiment, at: Date): Promise<void>;
  /** `false` se não havia rótulo. */
  deleteLabel(newsId: string): Promise<boolean>;
  saveEvaluation(versionId: number, evaluation: StoredEvaluation): Promise<void>;
}

export interface NewsToLink {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  companies: string[];
}

export interface StoredLink {
  assetId: string;
  relevance: LinkRelevance;
  origin: LinkOrigin;
}

export interface LatestNewsRow {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  links: Array<{ ticker: string; relevance: LinkRelevance }>;
}

/** O Investidor10: os dois sitemaps e a página de uma notícia (DA06). */
export interface ParentNewsSource {
  newsSitemap(): Promise<string>;
  archiveSitemap(): Promise<string>;
  /** `null` se a notícia não existe mais (404 ou 410). */
  article(url: string): Promise<string | null>;
}

/** Busca um feed com as regras de segurança do §4.2. */
export interface FeedFetcher {
  fetch(url: string): Promise<string>;
}

export type NewsTask = 'noticias_novas' | 'noticias_arquivo' | 'noticias_feeds';

/** O mesmo registro de execuções das ingestões (SPEC-008, DA14). */
export interface NewsRunLog {
  start(task: NewsTask, at: Date): Promise<string>;
  finish(
    id: string,
    result: {
      status: 'sucesso' | 'parcial' | 'falha';
      records: number;
      affectedAssets: number;
      periodStart: null;
      periodEnd: null;
      errors: Array<{ message: string }>;
      requests?: number;
      totals?: Record<string, number | boolean>;
    },
    at: Date,
  ): Promise<void>;
}

/** O endereço do feed não pode ser buscado (§4.2): não é `https` ou é da rede interna. */
export class FeedAddressError extends Error {
  constructor(readonly reason: 'not_https' | 'private_address') {
    super(reason === 'not_https' ? 'o feed precisa ser https' : 'endereço da rede interna');
  }
}

/** Erro da fonte: `blocked` (403 ou 429) para tudo; `retryable` tenta de novo; `invalid` não. */
export class NewsSourceError extends Error {
  constructor(
    readonly kind: 'blocked' | 'retryable' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}
