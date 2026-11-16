import { LINK_RULE_VERSION, linkNewsToAssets } from '../domain/asset-links.js';
import type { NewsRepository } from './ports.js';

/** Notícias por lote: o arquivo inteiro (cerca de 22.500) cabe em poucas voltas. */
export const LINK_BATCH = 500;

export interface NewsLinkerDeps {
  news: NewsRepository;
  clock?: () => Date;
  batch?: number;
  version?: number;
}

/**
 * Vínculo notícia–ativo (SPEC-028), no processador (DA11): vincula as notícias ainda sem vínculo ou
 * vinculadas com outra versão da regra, das mais novas para as mais antigas, em lotes. Roda depois
 * de cada coleta e a cada 30 minutos; duas chamadas ao mesmo tempo não se atropelam.
 */
export class NewsLinker {
  private readonly clock: () => Date;
  private readonly batch: number;
  private readonly version: number;
  private running: Promise<number> | null = null;

  constructor(private readonly deps: NewsLinkerDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.batch = deps.batch ?? LINK_BATCH;
    this.version = deps.version ?? LINK_RULE_VERSION;
  }

  /** Devolve quantas notícias vinculou. */
  run(): Promise<number> {
    this.running ??= this.linkAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async linkAll(): Promise<number> {
    const catalog = new Map(
      (await this.deps.news.catalogTickers()).map((asset) => [asset.ticker, asset]),
    );
    let linked = 0;
    for (;;) {
      const pending = await this.deps.news.newsToLink(this.version, this.batch);
      for (const item of pending) {
        const links = linkNewsToAssets(item, catalog).map(({ assetId, relevance, origin }) => ({
          assetId,
          relevance,
          origin,
        }));
        await this.deps.news.saveLinks(item.id, links, this.version, this.clock());
        linked += 1;
      }
      if (pending.length < this.batch) return linked;
    }
  }
}
