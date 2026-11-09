import {
  fiiSegmentFromInvestidor10,
  stockSectorFromB3,
  suggestionChange,
} from '../domain/sector-suggestion.js';
import type { ClassificationRepository, SectorSuggestion } from './ports.js';

export interface ClassificationSuggestionsDeps {
  classifications: ClassificationRepository;
  /** O interruptor do Investidor10 (SPEC-041): desligado, os FIIs não mudam. */
  investidor10Enabled: boolean;
  clock?: () => Date;
}

export interface SuggestionResult {
  /** Ações trocadas pelo setor econômico da B3. */
  stocks: number;
  /** FIIs trocados pelo segmento do Investidor10. */
  fiis: number;
  /** As trocas feitas, para o registro da execução e a conferência. */
  changes: SectorSuggestion[];
}

/**
 * Classificação sugerida melhor para os ativos que a equipe ainda não conferiu (SPEC-021 §4.1,
 * decisão 5): o setor econômico da B3 nas ações e o segmento do Investidor10 nos FIIs. O que a
 * equipe conferiu nunca muda; a fonte nunca troca uma sugestão por "Outros".
 */
export class ClassificationSuggestions {
  private readonly clock: () => Date;

  constructor(private readonly deps: ClassificationSuggestionsDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async apply(): Promise<SuggestionResult> {
    const [assets, b3] = await Promise.all([
      this.deps.classifications.unreviewed(),
      this.deps.classifications.b3Classifications(),
    ]);
    const changes: SectorSuggestion[] = [];
    for (const asset of assets) {
      const suggested =
        asset.assetClass === 'stock'
          ? stockSectorFromB3(b3.get(asset.ticker.slice(0, 4))?.sector ?? null)
          : this.deps.investidor10Enabled
            ? fiiSegmentFromInvestidor10(asset.fundType, asset.fundSegment)
            : null;
      if (!suggestionChange(asset.sector, suggested)) continue;
      changes.push({
        assetId: asset.id,
        ticker: asset.ticker,
        from: asset.sector,
        to: suggested as SectorSuggestion['to'],
        source: asset.assetClass === 'stock' ? 'b3' : 'investidor10',
      });
    }
    const at = this.clock();
    const stocks = changes.filter((change) => change.source === 'b3');
    const fiis = changes.filter((change) => change.source === 'investidor10');
    return {
      stocks: stocks.length > 0 ? await this.deps.classifications.suggest(stocks, at) : 0,
      fiis: fiis.length > 0 ? await this.deps.classifications.suggest(fiis, at) : 0,
      changes,
    };
  }
}
