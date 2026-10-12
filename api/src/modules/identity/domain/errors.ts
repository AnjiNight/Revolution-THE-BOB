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

/** A conta do token não existe mais (ex.: excluída depois de o token ser emitido). */
export class UserNotFoundError extends DomainError {
  readonly code = 'unauthorized';
}

/** SPEC-003: a senha atual informada para confirmar a alteração está errada. */
export class InvalidPasswordError extends DomainError {
  readonly code = 'invalid_password';
}

/** SPEC-003: conta só com Google não troca o e-mail (ele vem do Google). */
export class EmailChangeNotAllowedError extends DomainError {
  readonly code = 'email_change_not_allowed';
}

/**
 * SPEC-004: código errado, vencido, já usado, substituído, sem tentativas ou de e-mail sem conta.
 * Propositalmente um erro só, para não revelar quem tem conta.
 */
export class InvalidResetCodeError extends DomainError {
  readonly code = 'invalid_reset_code';
}

/** SPEC-004: o servidor está sem SMTP configurado, então a recuperação de senha fica desligada. */
export class PasswordResetUnavailableError extends DomainError {
  readonly code = 'password_reset_unavailable';
}

/** SPEC-039: senha certa, mas o e-mail do cadastro ainda não foi confirmado. */
export class EmailNotConfirmedError extends DomainError {
  readonly code = 'email_not_confirmed';
}

/**
 * SPEC-039: código de confirmação errado, vencido, já usado, sem tentativas ou sem confirmação
 * pendente. Um erro só, para não revelar quem tem conta.
 */
export class InvalidConfirmationCodeError extends DomainError {
  readonly code = 'invalid_confirmation_code';
}

/** SPEC-039: sem SMTP não há como confirmar e-mail (só acontece fora de produção). */
export class EmailConfirmationUnavailableError extends DomainError {
  readonly code = 'email_confirmation_unavailable';
}

/** SPEC-003: conta só com Google não tem senha para trocar, nem cria uma. */
export class PasswordChangeNotAllowedError extends DomainError {
  readonly code = 'password_change_not_allowed';
}
