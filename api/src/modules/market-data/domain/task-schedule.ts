import type { IngestionTaskCode, TaskSchedule, TaskSource } from '@simulador/shared';
import { SESSION } from './trading-session.js';

/** A coleta do pregão confere a cada 5 minutos se chegou a vez dela (SPEC-009). */
export const SESSION_CHECK_MINUTES = 5;

/**
 * De onde cada tarefa traz os dados e quando ela roda (horário de Brasília). Um lugar só (SPEC-011
 * §4.2): o processador agenda por aqui, e o servidor mostra daqui na tela Tarefas.
 */
export const INGESTION_SCHEDULE: Record<
  IngestionTaskCode,
  { sources: TaskSource[]; schedule: TaskSchedule }
> = {
  // SPEC-005 §10: anos fechados do calendário pelo arquivo da B3, antes do fechamento diário.
  calendario_b3: { sources: ['b3'], schedule: { kind: 'daily', times: ['07:30'] } },
  // SPEC-008: histórico de ativo novo a cada 15 minutos; pregões que faltam às 08:00.
  historico_retroativo: { sources: ['b3'], schedule: { kind: 'every', minutes: 15 } },
  fechamento_diario: { sources: ['b3'], schedule: { kind: 'daily', times: ['08:00'] } },
  // SPEC-040: a lista da brapi e os negociados da B3, às 08:30, depois do fechamento diário.
  importacao_catalogo: { sources: ['brapi', 'b3'], schedule: { kind: 'daily', times: ['08:30'] } },
  // SPEC-007: o CDI do dia sai no dia útil seguinte; às 09:00 e às 18:00.
  cdi_diario: { sources: ['bcb'], schedule: { kind: 'daily', times: ['09:00', '18:00'] } },
  // SPEC-020: o fechamento do Ibovespa e do IFIX sai depois do pregão; às 08:00 e às 20:00.
  indices_b3: { sources: ['b3'], schedule: { kind: 'daily', times: ['08:00', '20:00'] } },
  // SPEC-041: às 03:00; todos os ativos no domingo, só os nunca visitados nos outros dias.
  investidor10: {
    sources: ['investidor10'],
    schedule: { kind: 'daily', times: ['03:00'], sundaysAll: true },
  },
  // SPEC-042: às 04:00 do domingo (e fora dele, se nunca rodou).
  eventos_b3: { sources: ['b3'], schedule: { kind: 'weekly', times: ['04:00'] } },
  // SPEC-009 e 040: de 30 em 30 minutos durante o pregão.
  cotacao_pregao: {
    sources: ['brapi'],
    schedule: { kind: 'session', minutes: SESSION.slotMinutes },
  },
  // SPEC-027: as notícias novas do Investidor10 e os feeds das fontes curadas a cada 30 minutos; o
  // arquivo do Investidor10 aos poucos, a cada 35 minutos (uns 30 minutos de páginas por vez).
  noticias_novas: { sources: ['investidor10'], schedule: { kind: 'every', minutes: 30 } },
  noticias_arquivo: { sources: ['investidor10'], schedule: { kind: 'every', minutes: 35 } },
  noticias_feeds: { sources: ['feeds'], schedule: { kind: 'every', minutes: 30 } },
};

/**
 * Como o processador agenda a tarefa: nos horários do dia ou a cada tantos minutos. A semanal roda
 * todo dia no horário (ela mesma confere se é domingo); a do pregão confere a cada 5 minutos.
 */
export function workerTiming(schedule: TaskSchedule): {
  everyMinutes?: number;
  dailyAt?: Array<{ hour: number; minute: number }>;
} {
  switch (schedule.kind) {
    case 'every':
      return { everyMinutes: schedule.minutes };
    case 'session':
      return { everyMinutes: SESSION_CHECK_MINUTES };
    case 'daily':
    case 'weekly':
      return {
        dailyAt: schedule.times.map((time) => {
          const [hour = 0, minute = 0] = time.split(':').map(Number);
          return { hour, minute };
        }),
      };
  }
}
