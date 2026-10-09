import { DomainError } from '../../../shared/domain/domain-error.js';

/** RB01: o e-mail já pertence a outra conta. */
export class EmailInUseError extends DomainError {
  readonly code = 'email_in_use';
}

/** E-mail inexistente ou senha errada: propositalmente indistinguíveis. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'invalid_credentials';
}

/** Token de renovação desconhecido, expirado, revogado ou reutilizado. */
export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'invalid_refresh_token';
}

/** Conta certa, porta errada: usuário na Área do colaborador ou colaborador no login comum. */
export class WrongAccountTypeError extends DomainError {
  readonly code = 'wrong_account_type';
}

/** Primeiro acesso pelo Google: é preciso aceitar os termos antes de criar a conta (RNF11). */
export class TermsRequiredError extends DomainError {
  readonly code = 'terms_required';
}

/** ID token do Google inválido, expirado ou emitido para outro app. */
export class GoogleTokenInvalidError extends DomainError {
  readonly code = 'google_token_invalid';
}

/** O Google não confirmou que o e-mail pertence à pessoa. */
export class GoogleEmailNotVerifiedError extends DomainError {
  readonly code = 'google_email_not_verified';
}
