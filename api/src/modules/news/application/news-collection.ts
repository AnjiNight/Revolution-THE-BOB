import {
  NewsLayoutError,
  parseArchiveSitemap,
  parseNewsArticle,
  parseNewsSitemap,
  type ArchiveEntry,
} from '../domain/investidor10-news.js';
import { parseFeed } from '../domain/feed.js';
import {
  NewsSourceError,
  type FeedFetcher,
  type NewsRepository,
  type NewsRunLog,
  type NewsTask,
  type NewsToSave,
  type ParentNewsSource,
  type StoredNewsSource,
} from './ports.js';

/** Uma página do Investidor10 a cada 3 segundos, uma de cada vez (SPEC-041 §4.3, SPEC-027 §4.1). */
export const PARENT_PAUSE_MS = 3_000;
/** Páginas do arquivo por execução: cerca de 30 minutos no ritmo de uma a cada 3 segundos. */
export const ARCHIVE_PAGES_PER_RUN = 550;
/** Novas tentativas (as primeiras da SPEC-008): 1 e 5 minutos. */
export const NEWS_RETRY_DELAYS_MS = [60_000, 300_000] as const;
const MAX_STORED_ERRORS = 50;

export interface NewsCollectionDeps {
  /** O interruptor `INVESTIDOR10_ENABLED` (SPEC-041): desligado, a fonte pai não é coletada. */
  parentEnabled: boolean;
  parent: ParentNewsSource;
  feeds: FeedFetcher;
  news: NewsRepository;
  runs: NewsRunLog;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
  retryDelaysMs?: readonly number[];
  archivePagesPerRun?: number;
}

/**
 * Coleta de notícias (SPEC-027), só no processador (DA11). Da fonte pai, as novas pelo sitemap de
 * notícias e, aos poucos, o arquivo desde 2023, sempre uma página de cada vez (as duas tarefas
 * dividem a mesma fila); das curadas, os feeds RSS ou Atom.
 */
export class NewsCollection {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pauseMs: number;
  private readonly retryDelays: readonly number[];
  private readonly archivePages: number;
  /** A fila do Investidor10: uma página por vez, com a pausa entre elas, nas duas tarefas. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastParentRequest = 0;
  private readonly busy = new Set<NewsTask>();
  /** Notícias que sumiram ou vieram sem os dados estruturados: não voltam ao topo da fila. */
  private readonly skipped = new Set<string>();

  constructor(private readonly deps: NewsCollectionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.pauseMs = deps.pauseMs ?? PARENT_PAUSE_MS;
    this.retryDelays = deps.retryDelaysMs ?? NEWS_RETRY_DELAYS_MS;
    this.archivePages = deps.archivePagesPerRun ?? ARCHIVE_PAGES_PER_RUN;
  }

  /** A cada 30 minutos: as notícias do sitemap de notícias que ainda não estão guardadas. */
  latest(): Promise<RunSummary | null> {
    return this.once('noticias_novas', async () => {
      const parent = await this.activeParent();
      if (!parent) return null;
      return this.logged('noticias_novas', parent, async (log) => {
        const xml = await this.parentRequest(() => this.deps.parent.newsSitemap(), log);
        const stored = await this.deps.news.storedUrls(parent.id);
        const fresh = parseNewsSitemap(xml).filter((item) => !stored.has(item.url));
        log.totals.inSitemap = fresh.length;
        for (const item of fresh) {
          if (!(await this.collectArticle(parent, item.url, log))) break;
        }
      });
    });
  }

  /**
   * O arquivo desde 2023 (decisão 3), da mais nova para a mais antiga, até `archivePagesPerRun`
   * páginas por vez. Terminado, só busca de novo as que mudaram (`lastmod` mais novo que o guardado).
   */
  archive(): Promise<RunSummary | null> {
    return this.once('noticias_arquivo', async () => {
      const parent = await this.activeParent();
      if (!parent) return null;
      const progress = await this.deps.news.archive(parent.id);
      return this.logged('noticias_arquivo', parent, async (log) => {
        const xml = await this.parentRequest(() => this.deps.parent.archiveSitemap(), log);
        const entries = parseArchiveSitemap(xml).sort((a, b) => b.id - a.id);
        const stored = await this.deps.news.storedUrls(parent.id);
        const missing = entries.filter(
          (entry) => !stored.has(entry.url) && !this.skipped.has(entry.url),
        );
        const changed =
          missing.length === 0 && progress?.status === 'finished'
            ? entries.filter(
                (entry) => stored.has(entry.url) && changedSince(entry, stored.get(entry.url)),
              )
            : [];
        const work = (missing.length > 0 ? missing : changed).slice(0, this.archivePages);
        log.totals.missing = missing.length;
        log.totals.changed = changed.length;
        for (const entry of work) {
          if (!(await this.collectArticle(parent, entry.url, log))) break;
        }
        // Feitas: as do sitemap que estão guardadas agora (as que falharam continuam faltando).
        const after = await this.deps.news.storedUrls(parent.id);
        const done = entries.filter((entry) => after.has(entry.url)).length;
        const left = entries.filter(
          (entry) => !after.has(entry.url) && !this.skipped.has(entry.url),
        ).length;
        await this.deps.news.saveArchive(parent.id, {
          total: entries.length,
          done,
          status: left === 0 ? 'finished' : 'running',
          updatedAt: this.clock(),
        });
      });
    });
  }

  /** A cada 30 minutos: o feed de cada fonte curada ativa. Uma fonte com erro não para as outras. */
  feeds(): Promise<RunSummary | null> {
    return this.once('noticias_feeds', async () => {
      const sources = (await this.deps.news.sources()).filter(
        (source) => source.kind === 'curated' && source.active,
      );
      if (sources.length === 0) return null;
      const runId = await this.deps.runs.start('noticias_feeds', this.clock());
      const log = new CollectionLog();
      for (const source of sources) {
        try {
          const xml = await this.withRetries(() => this.deps.feeds.fetch(source.url));
          const items = parseFeed(xml, this.clock());
          const saved = await this.deps.news.saveNews(
            source.id,
            items.map((item) => ({
              ...item,
              body: null,
              author: null,
              themes: [],
              companies: [],
              updatedAt: null,
            })),
            this.clock(),
          );
          log.collected += saved;
          log.totals.items = (log.totals.items ?? 0) + items.length;
          await this.deps.news.recordRun(
            source.id,
            { status: 'success', error: null },
            this.clock(),
          );
        } catch (error) {
          const message = errorMessage(error);
          log.error(`${source.name}: ${message}`);
          log.failed += 1;
          await this.deps.news.recordRun(
            source.id,
            { status: 'failure', error: message.slice(0, 300) },
            this.clock(),
          );
        }
      }
      const result = log.result(sources.length - log.failed === 0);
      await this.deps.runs.finish(runId, result, this.clock());
      return { collected: log.collected, failed: log.failed };
    });
  }

  private async activeParent(): Promise<StoredNewsSource | null> {
    if (!this.deps.parentEnabled) return null;
    return this.deps.news.parentSource();
  }

  /** A mesma tarefa nunca roda duas vezes ao mesmo tempo. */
  private async once(
    task: NewsTask,
    fn: () => Promise<RunSummary | null>,
  ): Promise<RunSummary | null> {
    if (this.busy.has(task)) return null;
    this.busy.add(task);
    try {
      return await fn();
    } finally {
      this.busy.delete(task);
    }
  }

  /** Abre e fecha a execução da fonte pai, e grava a situação dela na fonte. */
  private async logged(
    task: NewsTask,
    parent: StoredNewsSource,
    fn: (log: CollectionLog) => Promise<void>,
  ): Promise<RunSummary> {
    const runId = await this.deps.runs.start(task, this.clock());
    const log = new CollectionLog();
    try {
      await fn(log);
    } catch (error) {
      log.error(errorMessage(error));
      log.aborted = true;
    }
    const result = log.result(log.aborted);
    await this.deps.runs.finish(runId, result, this.clock());
    await this.deps.news.recordRun(
      parent.id,
      {
        status: log.aborted ? 'failure' : 'success',
        error: log.aborted ? (log.errors[0]?.message ?? null) : null,
      },
      this.clock(),
    );
    return { collected: log.collected, failed: log.failed };
  }

  /** Visita a página e guarda a notícia. `false` para a coleta (o site bloqueou). */
  private async collectArticle(
    parent: StoredNewsSource,
    url: string,
    log: CollectionLog,
  ): Promise<boolean> {
    let html: string | null;
    try {
      html = await this.parentRequest(() => this.deps.parent.article(url), log);
    } catch (error) {
      if (error instanceof NewsSourceError && error.kind === 'blocked') {
        log.error(`${url}: ${error.message}; coleta parada até a próxima vez`);
        log.stopped = true;
        return false;
      }
      log.failed += 1;
      log.error(`${url}: ${errorMessage(error)}`);
      return true;
    }
    if (html === null) {
      log.totals.gone = (log.totals.gone ?? 0) + 1;
      this.skipped.add(url);
      return true;
    }
    let news: NewsToSave;
    try {
      news = { url, ...parseNewsArticle(html) };
    } catch (error) {
      if (!(error instanceof NewsLayoutError)) throw error;
      this.skipped.add(url);
      log.failed += 1;
      log.error(`${url}: ${error.message}`);
      return true;
    }
    log.collected += await this.deps.news.saveNews(parent.id, [news], this.clock());
    log.totals.saved = (log.totals.saved ?? 0) + 1;
    return true;
  }

  /** Uma página do Investidor10 por vez, com a pausa desde a anterior, nas duas tarefas. */
  private parentRequest<T>(fn: () => Promise<T>, log: CollectionLog): Promise<T> {
    const next = this.queue.then(async () => {
      const wait = this.lastParentRequest + this.pauseMs - this.clock().getTime();
      if (this.lastParentRequest > 0 && wait > 0) await this.sleep(wait);
      try {
        return await this.withRetries(() => {
          this.lastParentRequest = this.clock().getTime();
          log.requests += 1;
          return fn();
        });
      } finally {
        this.lastParentRequest = this.clock().getTime();
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const retryable = !(error instanceof NewsSourceError) || error.kind === 'retryable';
        const delay = this.retryDelays[attempt];
        if (!retryable || delay === undefined) throw error;
        await this.sleep(delay);
      }
    }
  }
}

export interface RunSummary {
  collected: number;
  failed: number;
}

function changedSince(entry: ArchiveEntry, stored: Date | null | undefined): boolean {
  return entry.lastModified !== null && (!stored || entry.lastModified > stored);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class CollectionLog {
  readonly errors: Array<{ message: string }> = [];
  private hidden = 0;
  readonly totals: Record<string, number> = {};
  collected = 0;
  failed = 0;
  requests = 0;
  stopped = false;
  aborted = false;

  error(message: string): void {
    if (this.errors.length < MAX_STORED_ERRORS) this.errors.push({ message });
    else this.hidden += 1;
  }

  result(failedAll: boolean) {
    const errors =
      this.hidden > 0
        ? [...this.errors, { message: `mais ${this.hidden} erros não guardados` }]
        : this.errors;
    return {
      status: failedAll
        ? ('falha' as const)
        : this.stopped || errors.length > 0
          ? ('parcial' as const)
          : ('sucesso' as const),
      records: this.collected,
      affectedAssets: 0,
      periodStart: null,
      periodEnd: null,
      errors,
      requests: this.requests,
      totals: { ...this.totals, failed: this.failed, stopped: this.stopped },
    };
  }
}
