import {
  SENTIMENT_MIN_EVALUATE,
  SENTIMENT_RECENT_LABELS,
  type NewsSentiment,
  type NewsToLabel,
  type SentimentModelName,
  type SentimentModelVersion,
  type SentimentSummary,
} from '@simulador/shared';
import { evaluate, hiddenReason, splitByTime } from '../domain/sentiment-evaluation.js';
import {
  NewsNotFoundError,
  NoSentimentModelError,
  NotEnoughLabelsError,
} from '../domain/errors.js';
import type { SentimentRepository, StoredModelVersion } from './ports.js';

function toVersion(version: StoredModelVersion): SentimentModelVersion {
  return {
    name: version.name,
    number: version.number,
    status: version.status,
    createdAt: version.createdAt.toISOString(),
    evaluation: version.evaluation
      ? { ...version.evaluation, evaluatedAt: version.evaluation.evaluatedAt.toISOString() }
      : null,
  };
}

export interface SentimentServiceDeps {
  sentiment: SentimentRepository;
  clock?: () => Date;
}

/**
 * O lado do servidor do sentimento (SPEC-044 §5.1): a amostra rotulada, a avaliação e qual versão
 * o usuário vê. A classificação em si roda no processador (DA11).
 */
export class SentimentService {
  private readonly clock: () => Date;

  constructor(private readonly deps: SentimentServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async summary(): Promise<SentimentSummary> {
    const current = await this.deps.sentiment.currentVersion();
    const [counts, labels, history, recent] = await Promise.all([
      this.deps.sentiment.classifiedCounts(current?.id ?? null),
      this.deps.sentiment.labels(null),
      this.deps.sentiment.retiredVersions(),
      this.deps.sentiment.recentLabels(SENTIMENT_RECENT_LABELS),
    ]);
    const split = splitByTime(labels);
    const reason = hiddenReason(current);
    return {
      current: current ? toVersion(current) : null,
      total: counts.total,
      classified: counts.classified,
      labels: { total: labels.length, tuning: split.tuning.length, test: split.test.length },
      visible: reason === null,
      hiddenReason: reason,
      history: history.map(toVersion),
      recentLabels: recent.map((label) => ({
        ...label,
        publishedAt: label.publishedAt.toISOString(),
        labeledAt: label.labeledAt.toISOString(),
      })),
    };
  }

  /** A próxima notícia para rotular, sem o que o modelo disse (§4.2). */
  async next(skip: readonly string[]): Promise<NewsToLabel | null> {
    const found = await this.deps.sentiment.nextToLabel(skip);
    return found ? { ...found, publishedAt: found.publishedAt.toISOString() } : null;
  }

  label(newsId: string, sentiment: NewsSentiment): Promise<void> {
    return this.deps.sentiment.saveLabel(newsId, sentiment, this.clock());
  }

  async unlabel(newsId: string): Promise<void> {
    if (!(await this.deps.sentiment.deleteLabel(newsId))) throw new NewsNotFoundError();
  }

  /** Compara os rótulos mais novos com a versão em uso e guarda a nota nela (§4.2). */
  async evaluate(): Promise<SentimentModelVersion> {
    const current = await this.deps.sentiment.currentVersion();
    if (!current) throw new NoSentimentModelError();
    const { test } = splitByTime(await this.deps.sentiment.labels(current.id));
    const result = evaluate(test);
    if (result.testSize < SENTIMENT_MIN_EVALUATE) throw new NotEnoughLabelsError();
    const evaluation = { ...result, evaluatedAt: this.clock() };
    await this.deps.sentiment.saveEvaluation(current.id, evaluation);
    return toVersion({ ...current, evaluation });
  }

  /** A versão cujo sentimento o usuário vê, ou `null` (§4.1, decisão 4). */
  async visibleModel(): Promise<(SentimentModelName & { id: number }) | null> {
    const current = await this.deps.sentiment.currentVersion();
    if (!current || hiddenReason(current) !== null) return null;
    return { id: current.id, name: current.name, number: current.number };
  }
}
