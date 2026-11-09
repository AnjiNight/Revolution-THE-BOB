import type { ClassificationSuggestions } from './classification-suggestions.js';
import { isoDateInBrasilia, weekdayOf, type IndicatorCode } from '@simulador/shared';
import {
  Investidor10LayoutError,
  parseIndicatorHistory,
  parseInvestidor10Page,
} from '../domain/investidor10-page.js';
import { RETRY_DELAYS_MS } from './history-ingestion.js';
import {
  Investidor10SourceError,
  type FundamentalsAsset,
  type FundamentalsRepository,
  type Investidor10Source,
  type RunError,
  type RunResult,
  type TaskRunRepository,
} from './ports.js';

/** Uma consulta a cada 3 segundos, uma de cada vez (SPEC-041 §4.3). */
export const INVESTIDOR10_PAUSE_MS = 3_000;
/** Erros guardados por execução; o resto vira um resumo (mesmo limite da SPEC-008). */
const MAX_STORED_ERRORS = 100;
/** A partir de quantos ativos visitados a regra "mais da metade com o site mudado" vale. */
const LAYOUT_CHECK_AFTER = 10;

export interface Investidor10CollectionDeps {
  /** Interruptor da autorização (§4.1): desligado, nada é visitado. */
  enabled: boolean;
  source: Investidor10Source;
  fundamentals: FundamentalsRepository;
  runs: TaskRunRepository;
  /**
   * Volume do último pregão de cada ativo: a coleta começa pelos mais negociados, os primeiros da
   * lista Ativos (mudança de 05/11/2026). Sem ele, a ordem do repositório (por ticker).
   */
  volumes?: { lastVolumes(): Promise<Map<string, string>> };
  /** SPEC-021: no fim, troca a classificação sugerida dos FIIs a revisar pelo segmento coletado. */
  suggestions?: Pick<ClassificationSuggestions, 'apply'>;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
  retryDelaysMs?: readonly number[];
}

/**
 * Coleta semanal do Investidor10 (SPECs 041 e 042): visita a página de cada ativo ativo, devagar,
 * e grava os indicadores, o histórico, as informações do FII e os proventos. Uso autorizado só
 * neste projeto acadêmico; com o interruptor desligado, não faz nada.
 */
export class Investidor10Collection {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pauseMs: number;
  private readonly retryDelays: readonly number[];
  private running = false;
  private requestsMade = 0;

  constructor(private readonly deps: Investidor10CollectionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.pauseMs = deps.pauseMs ?? INVESTIDOR10_PAUSE_MS;
    this.retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  /** Tarefa diária das 03:00: no domingo, todos os ativos; nos outros dias, só os nunca visitados. */
  scheduled(): Promise<RunResult | null> {
    const sunday = weekdayOf(isoDateInBrasilia(this.clock())) === 0;
    return this.run(sunday ? 'all' : 'new');
  }

  /** `all`: todos os ativos ativos; `new`: só os nunca visitados. Sem trabalho, devolve `null`. */
  async run(scope: 'all' | 'new'): Promise<RunResult | null> {
    if (!this.deps.enabled || this.running) return null;
    this.running = true;
    try {
      return await this.collect(scope);
    } finally {
      this.running = false;
    }
  }

  private async collect(scope: 'all' | 'new'): Promise<RunResult | null> {
    const [assets, volumes] = await Promise.all([
      this.deps.fundamentals.listActiveAssets(),
      this.deps.volumes?.lastVolumes(),
    ]);
    const visited = scope === 'new' ? await this.deps.fundamentals.visitedAssets() : null;
    const work = byVolume(
      visited ? assets.filter((asset) => !visited.has(asset.id)) : assets,
      volumes,
    );
    if (work.length === 0) return null;

    const runId = await this.deps.runs.start('investidor10', this.clock());
    const log = new CollectionLog();
    this.requestsMade = 0;
    try {
      for (const asset of work) {
        const outcome = await this.visit(asset, log);
        if (outcome === 'blocked') {
          log.stopped = true;
          break;
        }
        if (log.visited >= LAYOUT_CHECK_AFTER && log.layoutErrors * 2 > log.visited) {
          log.error(
            'mais da metade das páginas sem a tabela esperada: o site mudou; coleta parada',
          );
          log.aborted = true;
          break;
        }
      }
    } catch (error) {
      log.error(`erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
      log.aborted = true;
    }
    if (this.deps.suggestions && !log.aborted) {
      try {
        await this.deps.suggestions.apply();
      } catch (error) {
        log.error(
          `sugestão de classificação: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const result = log.result(this.requestsMade);
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }

  private async visit(
    asset: FundamentalsAsset,
    log: CollectionLog,
  ): Promise<'ok' | 'blocked' | 'skip'> {
    const path = `${asset.assetClass === 'fii' ? 'fiis' : 'acoes'}/${asset.ticker.toLowerCase()}`;
    let html: string | null;
    try {
      html = await this.request(() => this.deps.source.page(path));
    } catch (error) {
      if (error instanceof Investidor10SourceError && error.kind === 'blocked') {
        log.error(
          `${asset.ticker}: ${error.message}; coleta parada até a próxima semana`,
          asset.id,
        );
        return 'blocked';
      }
      log.failed += 1;
      log.error(
        `${asset.ticker}: ${error instanceof Error ? error.message : String(error)}`,
        asset.id,
      );
      await this.deps.fundamentals.markVisit(asset.id, 'erro', this.clock());
      return 'skip';
    }
    log.visited += 1;
    if (html === null) {
      log.noPage += 1;
      await this.deps.fundamentals.markVisit(asset.id, 'sem_pagina', this.clock());
      return 'skip';
    }

    let page;
    try {
      page = parseInvestidor10Page(html, asset.assetClass, asset.ticker);
    } catch (error) {
      if (!(error instanceof Investidor10LayoutError)) throw error;
      log.layoutErrors += 1;
      log.error(error.message, asset.id);
      await this.deps.fundamentals.markVisit(asset.id, 'erro', this.clock());
      return 'skip';
    }
    for (const warning of page.warnings) log.error(`${asset.ticker}: ${warning}`, asset.id);

    let history = new Map<IndicatorCode, Map<string, string | null>>();
    if (page.historyId !== null) {
      try {
        const json = await this.request(() => this.deps.source.history(page.historyId as number));
        if (json !== null) {
          const parsed = parseIndicatorHistory(json);
          history = parsed.rows;
          for (const warning of parsed.warnings.slice(0, 3)) {
            log.error(`${asset.ticker}: ${warning}`, asset.id);
          }
        }
      } catch (error) {
        if (error instanceof Investidor10SourceError && error.kind === 'blocked') {
          log.error(
            `${asset.ticker}: ${error.message}; coleta parada até a próxima semana`,
            asset.id,
          );
          return 'blocked';
        }
        // Sem o histórico, os valores atuais e os proventos ainda valem.
        log.error(
          `${asset.ticker}: histórico: ${error instanceof Error ? error.message : String(error)}`,
          asset.id,
        );
      }
    }

    await this.deps.fundamentals.save(
      {
        assetId: asset.id,
        current: page.current,
        history,
        fund: page.fund,
        dividends: page.dividends,
      },
      this.clock(),
    );
    log.collected += 1;
    return 'ok';
  }

  /** Uma consulta por vez, com a pausa antes (menos a primeira) e as novas tentativas da SPEC-008. */
  private async request<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      if (this.requestsMade > 0) await this.sleep(this.pauseMs);
      this.requestsMade += 1;
      try {
        return await fn();
      } catch (error) {
        const retryable = !(error instanceof Investidor10SourceError) || error.kind === 'retryable';
        const delay = this.retryDelays[attempt];
        if (!retryable || delay === undefined) throw error;
        await this.sleep(delay);
      }
    }
  }
}

/**
 * Os mais negociados primeiro (volume do último pregão); sem volume, por último, na ordem que
 * vieram. O número só ordena: a precisão não importa aqui.
 */
function byVolume<T extends { id: string }>(
  assets: readonly T[],
  volumes: Map<string, string> | undefined,
): T[] {
  if (!volumes || volumes.size === 0) return [...assets];
  const volumeOf = (asset: T) => Number(volumes.get(asset.id) ?? -1);
  return [...assets].sort((a, b) => volumeOf(b) - volumeOf(a));
}

class CollectionLog {
  readonly errors: RunError[] = [];
  private hiddenErrors = 0;
  visited = 0;
  collected = 0;
  noPage = 0;
  layoutErrors = 0;
  failed = 0;
  stopped = false;
  aborted = false;

  error(message: string, assetId: string | null = null): void {
    if (this.errors.length < MAX_STORED_ERRORS) this.errors.push({ message, assetId });
    else this.hiddenErrors += 1;
  }

  result(requests: number): RunResult {
    const errors =
      this.hiddenErrors > 0
        ? [...this.errors, { message: `mais ${this.hiddenErrors} erros não guardados` }]
        : this.errors;
    return {
      status:
        this.aborted || (this.collected === 0 && this.noPage === 0)
          ? 'falha'
          : this.stopped || errors.length > 0
            ? 'parcial'
            : 'sucesso',
      records: this.collected,
      affectedAssets: this.collected,
      periodStart: null,
      periodEnd: null,
      errors,
      requests,
      totals: {
        visited: this.visited,
        collected: this.collected,
        noPage: this.noPage,
        layoutErrors: this.layoutErrors,
        failed: this.failed,
        stopped: this.stopped,
      },
    };
  }
}
