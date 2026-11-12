import type { NewsCategory } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';

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
