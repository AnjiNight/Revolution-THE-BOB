import { DomainError } from '../../../shared/domain/domain-error.js';

/** SPEC-011: o erro gravado na execução que ficou sem fim quando o processador parou. */
export const INTERRUPTED_MESSAGE = 'Interrompida: o processador parou antes de terminar';

/** SPEC-011: a tarefa não é uma das tarefas de ingestão. */
export class TaskNotFoundError extends DomainError {
  readonly code = 'task_not_found';
}

/** SPEC-011: a execução não existe (ou já foi limpa, depois de 90 dias). */
export class RunNotFoundError extends DomainError {
  readonly code = 'run_not_found';
}

/** SPEC-011: a tarefa já tem um pedido de execução pendente. */
export class RunAlreadyRequestedError extends DomainError {
  readonly code = 'run_already_requested';
}

/** SPEC-011: a tarefa está rodando agora. */
export class RunInProgressError extends DomainError {
  readonly code = 'run_in_progress';
}

/** SPEC-011: a coleta do Investidor10 está desligada (sem a autorização, SPEC-041 §4.1). */
export class TaskSourceDisabledError extends DomainError {
  readonly code = 'source_disabled';
}
