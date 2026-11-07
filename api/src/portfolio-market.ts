import type { IsoDate } from '@simulador/shared';
import type { StoredAsset } from './modules/asset-catalog/domain/asset.js';
import type { PriceEventInput } from './modules/financial-calculation/price-adjustment.js';
import type { ParsedDividend } from './modules/market-data/domain/investidor10-page.js';
import type {
  DailySession,
  LatestIntradayQuote,
  QuoteLevel,
  QuoteRange,
} from './modules/market-data/application/ports.js';
import type { PortfolioMarket } from './modules/portfolios/application/ports.js';

export interface PortfolioMarketSources {
  assets: { findById(id: string): Promise<StoredAsset | null> };
  intraday: { latestOf(level: QuoteLevel, assetId: string): Promise<LatestIntradayQuote | null> };
  history: {
    sessions(assetId: string, count: number): Promise<DailySession[]>;
    /** SPEC-016. */
    quoteRange(assetId: string): Promise<QuoteRange | null>;
    closeOn(assetId: string, date: IsoDate): Promise<string | null>;
    lastTradingDayBefore(assetId: string, date: IsoDate): Promise<IsoDate | null>;
  };
  /** SPEC-042: desdobramentos, grupamentos e bonificações. */
  events: { forAsset(assetId: string): Promise<PriceEventInput[]> };
  /** SPEC-043: proventos do Investidor10 (SPEC-042), só com o interruptor ligado. */
  income: {
    enabled: boolean;
    dividends(assetId: string, since: IsoDate | null): Promise<ParsedDividend[]>;
    visitedAssets(): Promise<Set<string>>;
  };
}

/**
 * SPECs 014 e 016: o que a carteira precisa do catálogo (SPEC-006), das cotações (SPECs 008 e 009)
 * e dos eventos corporativos (SPEC-042). Fica na raiz da composição, como o `main.ts`: os módulos
 * não se conhecem (arquitetura §6).
 */
export function portfolioMarket(sources: PortfolioMarketSources): PortfolioMarket {
  return {
    async asset(assetId) {
      const asset = await sources.assets.findById(assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        assetClass: asset.assetClass,
        active: asset.deactivatedAt === null,
      };
    },
    async latestQuote(assetId, level) {
      const quote = await sources.intraday.latestOf(
        level === 'subscriber' ? 'assinante' : 'gratuito',
        assetId,
      );
      if (!quote) return null;
      return { price: quote.price, at: quote.at, level, source: 'brapi' };
    },
    async lastClose(assetId) {
      const [last] = await sources.history.sessions(assetId, 1);
      return last ? { date: last.date, close: last.close } : null;
    },
    historyRange: (assetId) => sources.history.quoteRange(assetId),
    closeOn: (assetId, date) => sources.history.closeOn(assetId, date),
    lastTradingDayBefore: (assetId, date) => sources.history.lastTradingDayBefore(assetId, date),
    async corporateEvents(assetId, from) {
      // Data com no dia da compra conta: quem comprou nesse dia ainda leva o evento.
      const events = (await sources.events.forAsset(assetId)).filter(
        (event) => event.exDate >= from,
      );
      return Promise.all(
        events.map(async (event) => ({
          ...event,
          id: `${event.kind}:${event.exDate}`,
          assetId,
          close: await sources.history.closeOn(assetId, event.exDate),
        })),
      );
    },
    incomeEnabled: sources.income.enabled,
    async income(assetId, from) {
      if (!sources.income.enabled) return [];
      const seen = new Map<string, number>();
      return (await sources.income.dividends(assetId, from)).map((row) => {
        // Sem id na SPEC-042: a chave é o próprio provento (dois iguais ganham um número).
        const key = `${assetId}:${row.kind}:${row.exDate}:${row.paymentDate ?? '-'}:${row.value}`;
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        return { ...row, id: count === 1 ? key : `${key}:${count}`, assetId };
      });
    },
    async incomeLoaded(assetIds) {
      if (!sources.income.enabled || assetIds.length === 0) return new Set();
      const visited = await sources.income.visitedAssets();
      return new Set(assetIds.filter((id) => visited.has(id)));
    },
  };
}
