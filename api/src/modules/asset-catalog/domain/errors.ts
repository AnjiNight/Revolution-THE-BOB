import type { FieldErrors } from '@simulador/shared';
import { DomainError } from '../../../shared/domain/domain-error.js';

/** Outro ativo, ativo ou desativado, já usa este ticker. */
export class TickerInUseError extends DomainError {
  readonly code = 'ticker_in_use';
}

/** Não há ativo com este id. */
export class AssetNotFoundError extends DomainError {
  readonly code = 'asset_not_found';
}

/** O ativo não tem logo próprio (SPEC-040): o app mostra as letras do ticker. */
export class LogoNotFoundError extends DomainError {
  readonly code = 'logo_not_found';
}

/** Regra que depende do ativo guardado, como o setor ser da classe dele. */
export class AssetValidationError extends DomainError {
  readonly code = 'validation_error';

  constructor(override readonly fields: FieldErrors) {
    super('dados do ativo inválidos');
  }
}
