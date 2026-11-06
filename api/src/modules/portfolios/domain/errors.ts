import type { FieldErrors } from '@simulador/shared';
import { DomainError } from '../../../shared/domain/domain-error.js';

/**
 * Não há carteira com este id para este usuário (RB03). `foreign`: existe, mas é de outra pessoa —
 * a rota responde igual (404) e só registra a tentativa no log (QA05).
 */
export class PortfolioNotFoundError extends DomainError {
  readonly code = 'portfolio_not_found';

  constructor(readonly foreign = false) {
    super('carteira não encontrada');
  }
}

/** Outra carteira do usuário já tem este nome (sem diferenciar maiúsculas e acentos). */
export class PortfolioNameInUseError extends DomainError {
  readonly code = 'portfolio_name_in_use';
}

/** O usuário já tem o número máximo de carteiras (SPEC-012 §4.2). */
export class PortfolioLimitReachedError extends DomainError {
  readonly code = 'portfolio_limit_reached';
}

/** RB26: a retirada passa do saldo em caixa; `details.available` diz quanto há. */
export class InsufficientCashError extends DomainError {
  readonly code = 'insufficient_cash';
  override readonly details: Readonly<Record<string, string>>;

  constructor(available: string) {
    super('saldo insuficiente');
    this.details = { available };
  }
}

/** Entrada que a regra do servidor recusa (data de início no futuro ou fora de pregão). */
export class PortfolioValidationError extends DomainError {
  readonly code = 'validation_error';

  constructor(override readonly fields: FieldErrors) {
    super('dados inválidos');
  }
}
