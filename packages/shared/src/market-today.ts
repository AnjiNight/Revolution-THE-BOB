/**
 * SPEC-048: o Ibovespa e o dólar do dia, pela Yahoo Finance, para o painel "Mercado hoje" do Início
 * do usuário. Sempre com o horário e o atraso; nunca como "tempo real" (DA16).
 */

/** O que o painel mostra: o Ibovespa (em pontos) e o dólar (US$ em R$). */
export const MARKET_TODAY_SYMBOLS = ['ibovespa', 'dollar'] as const;
export type MarketTodaySymbol = (typeof MARKET_TODAY_SYMBOLS)[number];

/** A Yahoo publica a B3 com atraso: o painel diz "atraso de até 20 min". */
export const MARKET_TODAY_DELAY_MINUTES = 20;

/** A última leitura de um dos dois. */
export interface MarketReading {
  /** Valor em texto decimal (pontos do Ibovespa, reais do dólar). */
  value: string;
  /** O fechamento anterior que a Yahoo informou; `null` se não veio. */
  previousClose: string | null;
  /** Variação em %, com 2 casas, sobre o fechamento anterior; `null` sem ele. */
  change: string | null;
  /** Horário da leitura que a Yahoo informou (ISO). */
  at: string;
  /** No horário do mercado, a coleta falhou ou passou do tempo: "pode estar desatualizado". */
  stale: boolean;
}

/** `GET /api/market/today`: `null` enquanto não há leitura. */
export interface MarketToday {
  ibovespa: MarketReading | null;
  dollar: MarketReading | null;
}

export const MARKET_TODAY_PATHS = {
  today: '/api/market/today',
} as const;
