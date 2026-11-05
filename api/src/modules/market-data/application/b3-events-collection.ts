import { isoDateInBrasilia, weekdayOf } from '@simulador/shared';
import { parseB3Events } from '../domain/b3-events.js';
import { RETRY_DELAYS_MS } from './history-ingestion.js';
import type {
  B3CompanySource,
  B3TradeRepository,
  CorporateEventRepository,
  FundamentalsRepository,
  RunError,
  RunResult,
  TaskRunReader,
  TaskRunRepository,
} from './ports.js';

/** Uma consulta a cada 2 segundos, uma de cada vez (SPEC-042 §4.3). */
export const B3_EVENTS_PAUSE_MS = 2_000;
const MAX_STORED_ERRORS = 100;

export interface B3EventsCollectionDeps {
  source: B3CompanySource;
  assets: Pick<FundamentalsRepository, 'listActiveAssets'>;
  trades: Pick<B3TradeRepository, 'all'>;
  events: CorporateEventRepository;
  runs: TaskRunRepository & TaskRunReader;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
  retryDelaysMs?: readonly number[];
}

/**
 * Eventos corporativos das ações pela B3 (SPEC-042): uma consulta por empresa (código de 4 letras
 * do ticker), e cada evento vai para o ativo do mesmo ISIN (o ISIN vem do arquivo da B3).
 */
export class B3EventsCollection {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pauseMs: number;
  private readonly retryDelays: readonly number[];
  private running = false;

  constructor(private readonly deps: B3EventsCollectionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.pauseMs = deps.pauseMs ?? B3_EVENTS_PAUSE_MS;
    this.retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  /** Tarefa diária das 04:00: roda no domingo e, fora dele, só se nunca rodou. */
  async scheduled(): Promise<RunResult | null> {
    const sunday = weekdayOf(isoDateInBrasilia(this.clock())) === 0;
    if (!sunday && (await this.deps.runs.lastRun('eventos_b3'))) return null;
    return this.run();
  }

  async run(): Promise<RunResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.collect();
    } finally {
      this.running = false;
    }
  }

  private async collect(): Promise<RunResult | null> {
    const [assets, trades] = await Promise.all([
      this.deps.assets.listActiveAssets(),
      this.deps.trades.all(),
    ]);
    const stocks = assets.filter((asset) => asset.assetClass === 'stock');
    // O ISIN chega com a próxima leitura dos arquivos da B3 (importação do catálogo, SPEC-040):
    // sem nenhum ainda, espera a próxima vez em vez de registrar um erro por ativo.
    if (!stocks.some((asset) => trades.get(asset.ticker)?.isin)) return null;
    const byCompany = new Map<string, typeof stocks>();
    for (const asset of stocks) {
      const code = asset.ticker.slice(0, 4);
      byCompany.set(code, [...(byCompany.get(code) ?? []), asset]);
    }

    const runId = await this.deps.runs.start('eventos_b3', this.clock());
    const errors: RunError[] = [];
    let hidden = 0;
    const error = (message: string, assetId: string | null = null) => {
      if (errors.length < MAX_STORED_ERRORS) errors.push({ message, assetId });
      else hidden += 1;
    };
    let read = 0;
    let failed = 0;
    let records = 0;
    let requests = 0;
    const affected = new Set<string>();

    try {
      for (const [code, companyAssets] of byCompany) {
        let json: unknown;
        try {
          json = await this.withRetries(async () => {
            if (requests > 0) await this.sleep(this.pauseMs);
            requests += 1;
            return this.deps.source.company(code);
          });
        } catch (cause) {
          failed += 1;
          error(`${code}: ${cause instanceof Error ? cause.message : String(cause)}`);
          continue;
        }
        read += 1;
        const { events, warnings } = parseB3Events(json);
        for (const warning of warnings) error(`${code}: ${warning}`);
        for (const asset of companyAssets) {
          const isin = trades.get(asset.ticker)?.isin;
          if (!isin) {
            error(`${asset.ticker}: sem ISIN no arquivo da B3; eventos não ligados`, asset.id);
            continue;
          }
          const own = events.filter((event) => event.isin === isin);
          await this.deps.events.replace(asset.id, own, this.clock());
          records += own.length;
          if (own.length > 0) affected.add(asset.id);
        }
      }
    } catch (cause) {
      failed += 1;
      error(`erro inesperado: ${cause instanceof Error ? cause.message : String(cause)}`);
    }

    const allErrors =
      hidden > 0 ? [...errors, { message: `mais ${hidden} erros não guardados` }] : errors;
    const result: RunResult = {
      status: read === 0 && failed > 0 ? 'falha' : allErrors.length > 0 ? 'parcial' : 'sucesso',
      records,
      affectedAssets: affected.size,
      periodStart: null,
      periodEnd: null,
      errors: allErrors,
      requests,
    };
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }

  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (cause) {
        const delay = this.retryDelays[attempt];
        if (delay === undefined) throw cause;
        await this.sleep(delay);
      }
    }
  }
}
