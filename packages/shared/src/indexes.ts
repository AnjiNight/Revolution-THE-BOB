import type { IsoDate } from './calendar.js';

/** Rotas dos indexadores (SPEC-007 §5.2) e dos índices da B3 (SPEC-020 §5.2). */
export const INDEX_PATHS = {
  cdi: '/api/collaborator/cdi',
  marketIndexes: '/api/collaborator/indices',
} as const;

/** Série do CDI desde o primeiro dia útil de 2016, como o histórico de cotações (SPEC-007 §4.2). */
export const CDI_START_DATE: IsoDate = '2016-01-04';

/** Dias úteis sem CDI novo a partir dos quais o Início do colaborador avisa (SPEC-007 §5.3). */
export const CDI_STALE_BUSINESS_DAYS = 3;

/** Corpo de `GET /api/collaborator/cdi`: situação da série no Início do colaborador. */
export interface CdiStatus {
  /** Primeira e última data guardadas (AAAA-MM-DD); `null` sem nenhuma. */
  from: IsoDate | null;
  to: IsoDate | null;
  /** Quantos dias a série tem. */
  days: number;
  /** Última execução terminada da tarefa `cdi_diario`; `null` antes da primeira. */
  lastRun: {
    at: string;
    status: 'sucesso' | 'parcial' | 'falha' | 'aguardando_publicacao';
  } | null;
  /** O último CDI guardado tem mais de 3 dias úteis. */
  stale: boolean;
  /** Pregões publicados, já com mais de 3 dias úteis, que não têm CDI na série. */
  missingTradingDays: number;
}

/** SPEC-020: índices da B3 carregados pelas estatísticas históricas (sigla da B3). */
export const MARKET_INDEX_CODES = ['IBOV', 'IFIX'] as const;
export type MarketIndexCode = (typeof MARKET_INDEX_CODES)[number];

/** Pregões sem fechamento novo a partir dos quais o Início do colaborador avisa (SPEC-020 §5.3). */
export const INDEX_STALE_TRADING_DAYS = 2;

/** Corpo de `GET /api/collaborator/indices`: situação de cada índice no Início do colaborador. */
export interface MarketIndexStatus {
  indexes: Array<{
    code: MarketIndexCode;
    /** Primeira e última data guardadas; `null` sem nenhuma. */
    from: IsoDate | null;
    to: IsoDate | null;
    days: number;
    /** O último fechamento tem mais de 2 pregões. */
    stale: boolean;
    /** Pregões publicados, já com 2 pregões depois, sem fechamento. */
    missingTradingDays: number;
  }>;
  /** Última execução terminada da tarefa `indices_b3`; `null` antes da primeira. */
  lastRun: {
    at: string;
    status: 'sucesso' | 'parcial' | 'falha' | 'aguardando_publicacao';
  } | null;
}
