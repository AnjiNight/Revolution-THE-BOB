import {
  addDays,
  newsReferenceDay,
  SCENARIO_MIN_OCCURRENCES,
  type AssetScenarios,
  type IsoDate,
  type PricePoint,
  type ScenarioCell,
  type SentimentModelName,
} from '@simulador/shared';
import { NewsAssetNotFoundError } from '../domain/errors.js';
import { computeScenarios } from '../domain/scenarios.js';
import type { NewsRepository, ScenarioRecord } from './ports.js';

/** SPEC-044: a versão do modelo cujo sentimento o usuário vê, ou `null`. */
type VisibleModel = (SentimentModelName & { id: number }) | null;

/** A série ajustada do ativo (SPEC-042), a mesma do gráfico da ficha. */
export interface AdjustedPrices {
  adjustedCloses(assetId: string, from: IsoDate | null): Promise<PricePoint[]>;
}

export interface AssetScenariosServiceDeps {
  news: NewsRepository;
  prices: AdjustedPrices;
  sentiment?: { visibleModel(): Promise<VisibleModel> };
  clock?: () => Date;
  /** Falha ao registrar o cenário do dia não derruba a resposta (só fica no log). */
  onRecordError?: (error: unknown) => void;
}

/** Dias antes do período buscados a mais: o fechamento anterior ao primeiro pregão. */
const PREVIOUS_CLOSE_MARGIN_DAYS = 10;

const percent = (share: number | null) => (share === null ? null : Math.round(share * 10000) / 100);

/**
 * Cenários por sentimento na ficha do ativo (SPEC-031, DA21). Calculados na hora, com a série
 * ajustada e as notícias oficiais classificadas pela versão em uso; só quando o sentimento está
 * visível (SPEC-044). O cenário do dia fica registrado, sem nada de quem abriu a ficha.
 */
export class AssetScenariosService {
  private readonly clock: () => Date;

  constructor(private readonly deps: AssetScenariosServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async scenarios(assetId: string): Promise<AssetScenarios> {
    if (!(await this.deps.news.assetExists(assetId))) throw new NewsAssetNotFoundError();
    const model = (await this.deps.sentiment?.visibleModel()) ?? null;
    const hidden: AssetScenarios = {
      visible: false,
      model: null,
      today: null,
      period: null,
      bands: null,
      base: null,
      newsSessions: 0,
      minOccurrences: SCENARIO_MIN_OCCURRENCES,
    };
    if (!model) return hidden;

    const first = await this.deps.news.firstClassifiedNewsAt(model.id);
    const from = first ? newsReferenceDay(first) : null;
    const [points, news] = await Promise.all([
      from
        ? this.deps.prices.adjustedCloses(assetId, addDays(from, -PREVIOUS_CLOSE_MARGIN_DAYS))
        : Promise.resolve([]),
      this.deps.news.scenarioNews(assetId, model.id),
    ]);
    // Sem nenhuma notícia classificada no banco, o período fica vazio.
    const result = computeScenarios(points, news, from ?? '9999-12-31');
    if (result.today) await this.record(assetId, model.id, result.today.band, result);

    return {
      visible: true,
      model: { name: model.name, number: model.number },
      today: result.today,
      period: result.period,
      bands: result.bands,
      base: result.base,
      newsSessions: result.newsSessions,
      minOccurrences: SCENARIO_MIN_OCCURRENCES,
    };
  }

  /** O cenário de hoje, um registro por horizonte (DA21, ponto 8). */
  private async record(
    assetId: string,
    modelVersionId: number,
    band: ScenarioRecord['band'],
    result: ReturnType<typeof computeScenarios>,
  ): Promise<void> {
    const day = newsReferenceDay(this.clock());
    const rows: ScenarioRecord[] = result.bands[band].map((cell: ScenarioCell, i) => {
      const base = result.base[i] as ScenarioCell;
      return {
        assetId,
        day,
        band,
        horizon: cell.horizon,
        modelVersionId,
        occurrences: cell.occurrences,
        down: percent(cell.down),
        flat: percent(cell.flat),
        up: percent(cell.up),
        baseOccurrences: base.occurrences,
        baseDown: percent(base.down),
        baseFlat: percent(base.flat),
        baseUp: percent(base.up),
      };
    });
    try {
      await this.deps.news.recordScenarios(rows);
    } catch (error) {
      this.deps.onRecordError?.(error);
    }
  }
}
