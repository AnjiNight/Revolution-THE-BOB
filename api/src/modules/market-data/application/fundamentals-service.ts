import {
  addDays,
  INDICATORS,
  isoDateInBrasilia,
  type AssetDividends,
  type AssetFundamentals,
  type DividendPeriod,
  type IndicatorCode,
  type Investidor10Status,
} from '@simulador/shared';
import { sumDecimals } from '../../financial-calculation/decimal.js';
import type { FundamentalsRepository, TaskRunReader } from './ports.js';

export interface FundamentalsServiceDeps {
  /** Interruptor da autorização do Investidor10 (SPEC-041 §4.1). */
  enabled: boolean;
  fundamentals: FundamentalsRepository;
  runs: TaskRunReader;
  clock?: () => Date;
}

/** Fonte desligada (fim da autorização): as rotas respondem `source_disabled`. */
export class SourceDisabledError extends Error {
  constructor() {
    super('fonte desligada');
    this.name = 'SourceDisabledError';
  }
}

/** Ativo que não existe: 404 `asset_not_found`, como na ficha (SPEC-010). */
export class FundamentalsAssetNotFoundError extends Error {
  constructor() {
    super('ativo não encontrado');
    this.name = 'FundamentalsAssetNotFoundError';
  }
}

/** Indicadores (SPEC-041) e proventos (SPEC-042) da ficha do ativo, com a fonte. */
export class FundamentalsService {
  private readonly clock: () => Date;

  constructor(private readonly deps: FundamentalsServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async fundamentals(assetId: string): Promise<AssetFundamentals> {
    if (!this.deps.enabled) throw new SourceDisabledError();
    const stored = await this.deps.fundamentals.fundamentals(assetId);
    if (!stored) throw new FundamentalsAssetNotFoundError();

    const current = INDICATORS.filter((indicator) =>
      stored.values.get(indicator.code)?.has('atual'),
    ).map((indicator) => ({
      code: indicator.code as IndicatorCode,
      value: stored.values.get(indicator.code)?.get('atual') ?? null,
    }));
    const years = [
      ...new Set([...stored.values.values()].flatMap((byPeriod) => [...byPeriod.keys()])),
    ]
      .filter((period) => period !== 'atual')
      .sort((a, b) => b.localeCompare(a));
    const rows = INDICATORS.filter((indicator) =>
      years.some((year) => stored.values.get(indicator.code)?.has(year)),
    ).map((indicator) => ({
      code: indicator.code as IndicatorCode,
      values: years.map((year) => stored.values.get(indicator.code)?.get(year) ?? null),
    }));

    const hasData = current.length > 0 || stored.fund !== null;
    return {
      source: 'investidor10',
      status:
        stored.status === 'sem_pagina'
          ? 'no_page'
          : hasData
            ? 'collected'
            : stored.status === 'erro'
              ? 'error'
              : 'not_collected',
      collectedAt: hasData ? (stored.collectedAt?.toISOString() ?? null) : null,
      current,
      history: { years, rows },
      fund: stored.assetClass === 'fii' ? stored.fund : null,
    };
  }

  async dividends(assetId: string, period: DividendPeriod): Promise<AssetDividends> {
    if (!this.deps.enabled) throw new SourceDisabledError();
    const stored = await this.deps.fundamentals.fundamentals(assetId);
    if (!stored) throw new FundamentalsAssetNotFoundError();
    const today = isoDateInBrasilia(this.clock());
    // 12 meses e 5 anos contados em dias (29/02 não quebra a conta).
    const since12m = addDays(today, -364);
    const since =
      period === '12m' ? since12m : period === '5y' ? addDays(today, -(5 * 365 + 1)) : null;
    const all = await this.deps.fundamentals.dividends(assetId, since);
    const last12 = (
      period === '12m' ? all : await this.deps.fundamentals.dividends(assetId, since12m)
    ).filter((dividend) => dividend.exDate <= today);
    return {
      source: 'investidor10',
      collectedAt: stored.collectedAt?.toISOString() ?? null,
      period,
      total12m: last12.length > 0 ? sumDecimals(last12.map((dividend) => dividend.value)) : null,
      items: all,
    };
  }

  /** Início do colaborador: interruptor, última coleta e quantos ativos têm dados. */
  async status(): Promise<Investidor10Status> {
    const [counts, lastRun, assets] = await Promise.all([
      this.deps.fundamentals.visitCounts(),
      this.deps.runs.lastRun('investidor10'),
      this.deps.fundamentals.listActiveAssets(),
    ]);
    const status = lastRun?.status;
    return {
      enabled: this.deps.enabled,
      lastRun:
        lastRun?.finishedAt && (status === 'sucesso' || status === 'parcial' || status === 'falha')
          ? { at: lastRun.finishedAt.toISOString(), status }
          : null,
      collected: counts.ok,
      noPage: counts.sem_pagina,
      errors: counts.erro,
      activeAssets: assets.length,
    };
  }
}
