import type { IsoDate } from './calendar.js';

/** Rotas dos indexadores (SPEC-007 §5.2). */
export const INDEX_PATHS = {
  cdi: '/api/collaborator/cdi',
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
