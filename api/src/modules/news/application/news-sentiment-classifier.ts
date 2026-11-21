import type { NewsSentiment } from '@simulador/shared';
import { LEXICON_MODEL, classifySentiment } from '../domain/sentiment-lexicon.js';
import type { Classification, SentimentRepository } from './ports.js';

/** Notícias por lote, como no vínculo (SPEC-028). */
export const CLASSIFY_BATCH = 500;

/**
 * O classificador atrás da interface (DA11): a v1 é o dicionário; um modelo treinado entra no lugar
 * com outro nome ou número (DA20).
 */
export interface SentimentClassifier {
  readonly name: string;
  readonly number: number;
  classify(news: { title: string; summary: string | null }): {
    sentiment: NewsSentiment;
    score: number;
  };
}

export const lexiconClassifier: SentimentClassifier = {
  ...LEXICON_MODEL,
  classify: classifySentiment,
};

export interface NewsSentimentClassifierDeps {
  sentiment: SentimentRepository;
  classifier?: SentimentClassifier;
  clock?: () => Date;
  batch?: number;
}

/**
 * Sentimento das notícias (SPEC-044), no processador (DA11): registra a versão do classificador e
 * classifica as notícias pendentes ou de outra versão, das mais novas, em lotes. Roda depois do
 * vínculo e a cada 30 minutos; duas chamadas ao mesmo tempo dividem uma execução só.
 */
export class NewsSentimentClassifier {
  private readonly classifier: SentimentClassifier;
  private readonly clock: () => Date;
  private readonly batch: number;
  private running: Promise<number> | null = null;

  constructor(private readonly deps: NewsSentimentClassifierDeps) {
    this.classifier = deps.classifier ?? lexiconClassifier;
    this.clock = deps.clock ?? (() => new Date());
    this.batch = deps.batch ?? CLASSIFY_BATCH;
  }

  /** Devolve quantas notícias classificou. */
  run(): Promise<number> {
    this.running ??= this.classifyAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async classifyAll(): Promise<number> {
    const { name, number } = this.classifier;
    const versionId = await this.deps.sentiment.useVersion(name, number, this.clock());
    let classified = 0;
    // A notícia que falha fica pendente e não volta no mesmo turno (senão o lote se repetiria).
    const failed = new Set<string>();
    for (;;) {
      const limit = this.batch + failed.size;
      const batch = await this.deps.sentiment.newsToClassify(versionId, limit);
      const pending = batch.filter((item) => !failed.has(item.id));
      const results: Classification[] = [];
      for (const item of pending) {
        try {
          const { sentiment, score } = this.classifier.classify(item);
          results.push({ newsId: item.id, sentiment, score });
        } catch {
          failed.add(item.id);
        }
      }
      await this.deps.sentiment.saveClassifications(versionId, results, this.clock());
      classified += results.length;
      // Acabou quando veio menos que o pedido, ou quando só voltaram as que já falharam.
      if (batch.length < limit || pending.length === 0) return classified;
    }
  }
}
