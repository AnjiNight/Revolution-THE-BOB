import { DUPLICATE_WINDOW_MS, findOriginal } from '../domain/duplicates.js';
import type { NewsRepository } from './ports.js';

/** Notícias por lote. */
export const DUPLICATE_BATCH = 500;

export interface NewsDeduplicatorDeps {
  news: NewsRepository;
  clock?: () => Date;
  batch?: number;
}

/**
 * Notícias repetidas entre fontes (SPEC-047), no processador: confere as notícias ainda não
 * conferidas, na ordem em que valem como original, e liga cada repetida à original. Roda depois de
 * cada coleta, antes do vínculo (SPEC-028) e do sentimento (SPEC-044), que só pegam as conferidas.
 * Na primeira vez, confere todas as já guardadas. Duas chamadas ao mesmo tempo não se atropelam.
 */
export class NewsDeduplicator {
  private readonly clock: () => Date;
  private readonly batch: number;
  private running: Promise<{ checked: number; duplicates: number }> | null = null;

  constructor(private readonly deps: NewsDeduplicatorDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.batch = deps.batch ?? DUPLICATE_BATCH;
  }

  /** Devolve quantas notícias conferiu e quantas eram repetidas. */
  run(): Promise<{ checked: number; duplicates: number }> {
    this.running ??= this.checkAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async checkAll(): Promise<{ checked: number; duplicates: number }> {
    let checked = 0;
    let duplicates = 0;
    for (;;) {
      const pending = await this.deps.news.newsToCheck(this.batch);
      for (const item of pending) {
        const at = item.publishedAt.getTime();
        const candidates = await this.deps.news.originalsAround(
          new Date(at - DUPLICATE_WINDOW_MS),
          new Date(at + DUPLICATE_WINDOW_MS),
        );
        const found = findOriginal(item, candidates);
        await this.deps.news.markChecked(
          item.id,
          found ? { originalId: found.original.id, reason: found.reason } : null,
          this.clock(),
        );
        checked += 1;
        if (found) duplicates += 1;
      }
      if (pending.length < this.batch) return { checked, duplicates };
    }
  }
}
