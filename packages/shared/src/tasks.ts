import type { IsoDate } from './calendar.js';

/**
 * SPEC-011: as tarefas de ingestão, na ordem do dia (a ordem da tela Tarefas). São as que gravam
 * cada execução (SPEC-008, DA14); as limpezas diárias do processador e o vínculo das notícias com
 * os ativos (SPEC-028) ficam de fora. As três de notícias são da SPEC-027.
 */
export const INGESTION_TASKS = [
  'calendario_b3',
  'historico_retroativo',
  'fechamento_diario',
  'importacao_catalogo',
  'cdi_diario',
  'indices_b3',
  'investidor10',
  'eventos_b3',
  'cotacao_pregao',
  'noticias_novas',
  'noticias_arquivo',
  'noticias_feeds',
] as const;
export type IngestionTaskCode = (typeof INGESTION_TASKS)[number];

export function isIngestionTask(value: unknown): value is IngestionTaskCode {
  return typeof value === 'string' && (INGESTION_TASKS as readonly string[]).includes(value);
}

/** De onde cada tarefa traz os dados (`feeds`: os RSS das fontes curadas, SPEC-027). */
export type TaskSource = 'b3' | 'brapi' | 'bcb' | 'investidor10' | 'feeds';

/**
 * Quando a tarefa roda, no horário de Brasília. `daily`: todo dia, nos horários (o Investidor10
 * visita todos os ativos aos domingos e só os novos nos outros dias: `sundaysAll`); `weekly`: aos
 * domingos; `every`: a cada tantos minutos; `session`: de tanto em tanto tempo durante o pregão.
 */
export type TaskSchedule =
  | { kind: 'daily'; times: string[]; sundaysAll?: true }
  | { kind: 'weekly'; times: string[] }
  | { kind: 'every'; minutes: number }
  | { kind: 'session'; minutes: number };

/** Situação de uma execução terminada (SPEC-008 e 009). A interrompida é uma falha (SPEC-011). */
export type TaskRunStatus =
  'sucesso' | 'parcial' | 'falha' | 'aguardando_publicacao' | 'cota_esgotada';

/** Uma execução terminada, como a lista das tarefas mostra. */
export interface TaskRunSummary {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: TaskRunStatus;
  records: number;
  affectedAssets: number;
  errorCount: number;
}

/** Por que "Executar agora" não está disponível. */
export type TaskBlockedReason = 'running' | 'requested' | 'source_disabled';

export interface TaskOverview {
  task: IngestionTaskCode;
  sources: TaskSource[];
  schedule: TaskSchedule;
  /** A última execução terminada; `null` antes da primeira. */
  lastRun: TaskRunSummary | null;
  /** Desde quando a execução em andamento roda; `null` sem nenhuma. */
  runningSince: string | null;
  /** Quando foi feito o pedido ainda não atendido; `null` sem nenhum. */
  pendingRequestAt: string | null;
  blockedReason: TaskBlockedReason | null;
}

export interface ProcessorState {
  /** O último sinal de vida do processador; `null` se ele nunca deu sinal. */
  lastSeenAt: string | null;
  /** Sem sinal há mais de 3 minutos (ou três vezes o intervalo dele, se for maior). */
  stopped: boolean;
}

/** `GET /api/collaborator/tasks`: as tarefas (primeiro as com falha ou parcial) e o processador. */
export interface TaskList {
  tasks: TaskOverview[];
  processor: ProcessorState;
}

/** Uma execução no histórico de uma tarefa. */
export interface TaskRunDetail {
  id: string;
  startedAt: string;
  /** `null` enquanto está em andamento. */
  finishedAt: string | null;
  status: TaskRunStatus | null;
  records: number;
  affectedAssets: number;
  errorCount: number;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  /** Consultas descontadas da cota e a cota que a fonte informou (tarefas da brapi). */
  requests: number;
  quota: { remaining: number; limit: number; resetsAt: string } | null;
  /** Os totais que a tarefa grava (por exemplo, na importação: criados, desativados, logos). */
  totals: Record<string, number | boolean | string[]> | null;
  /** Veio de um pedido: `name` é quem pediu (`null` se a conta foi removida). Sem pedido, `null`. */
  request: { name: string | null } | null;
}

export interface TaskRunPage {
  runs: TaskRunDetail[];
  total: number;
  hasMore: boolean;
}

/** Um erro de uma execução, como o processador gravou (técnico e em português). */
export interface TaskRunError {
  ticker: string | null;
  date: IsoDate | null;
  message: string;
}

export interface TaskErrorPage {
  errors: TaskRunError[];
  total: number;
  hasMore: boolean;
}

/** `POST /api/collaborator/tasks/:task/requests`: o pedido gravado. */
export interface TaskRequestResult {
  requestedAt: string;
}

/** O histórico vem 50 execuções por vez, e os erros, 100 por vez. */
export const TASK_RUNS_PAGE = 50;
export const TASK_ERRORS_PAGE = 100;

export const TASK_PATHS = {
  list: '/api/collaborator/tasks',
  runs: '/api/collaborator/tasks/:task/runs',
  requests: '/api/collaborator/tasks/:task/requests',
  errors: '/api/collaborator/runs/:id/errors',
} as const;

export function taskPath(path: string, task: string): string {
  return path.replace(':task', encodeURIComponent(task));
}

export function runPath(path: string, id: string): string {
  return path.replace(':id', encodeURIComponent(id));
}

export type TaskErrorCode =
  'task_not_found' | 'run_not_found' | 'run_already_requested' | 'run_in_progress';
