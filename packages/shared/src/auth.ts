import { z } from 'zod';

/** Rotas de autenticação (SPEC-002, §5.1). */
export const AUTH_PATHS = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  collaboratorLogin: '/api/auth/collaborator/login',
  google: '/api/auth/google',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
  me: '/api/me',
} as const;

/** Rotas do perfil da pessoa conectada (SPEC-003, §5.1). */
export const PROFILE_PATHS = {
  profile: '/api/me',
  email: '/api/me/email',
  password: '/api/me/password',
  consents: '/api/me/consents',
} as const;

/** Versão vigente dos termos de uso e da política de privacidade (RNF11). */
export const TERMS_VERSION = '1';

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * Tipo de conta. "user" se cadastra pelo app; "collaborator" (equipe) só é criado pela própria
 * equipe e entra pela Área do colaborador (SPEC-002, §4).
 */
export type Role = 'user' | 'collaborator';

/** Dados do usuário que podem sair do servidor (nunca a senha ou o hash). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Perfil completo da pessoa conectada (SPEC-003): formas de acesso e data de criação. */
export interface UserProfile extends PublicUser {
  hasPassword: boolean;
  hasGoogle: boolean;
  /** ISO 8601. */
  createdAt: string;
}

/** Tipos de consentimento. Hoje só o aceite dos termos de uso e da política de privacidade. */
export type ConsentType = 'terms';

export interface Consent {
  type: ConsentType;
  version: string;
  /** ISO 8601. */
  acceptedAt: string;
}

export interface ConsentList {
  consents: Consent[];
  /** Versão vigente dos termos; se a última aceita for outra, o app pede um novo aceite. */
  currentVersion: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends TokenPair {
  user: PublicUser;
}

/** Códigos de erro por campo, traduzidos pelo app. */
export type FieldErrorCode =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'invalid_email'
  | 'terms_not_accepted'
  | 'same_password'
  | 'invalid_version';

export type FieldErrors = Partial<Record<string, FieldErrorCode>>;

/** Códigos de erro das rotas de autenticação. */
export type AuthErrorCode =
  | 'validation_error'
  | 'email_in_use'
  | 'invalid_credentials'
  | 'invalid_refresh_token'
  | 'unauthorized'
  | 'rate_limited'
  | 'wrong_account_type'
  | 'terms_required'
  | 'google_login_unavailable'
  | 'google_token_invalid'
  | 'google_email_not_verified'
  | 'invalid_password'
  | 'email_change_not_allowed'
  | 'password_change_not_allowed';

const FIELD_ERROR_CODES: readonly FieldErrorCode[] = [
  'required',
  'too_short',
  'too_long',
  'invalid_email',
  'terms_not_accepted',
  'same_password',
  'invalid_version',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const emailField = z
  .string({ error: 'required' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'required' })
  .max(EMAIL_MAX, { error: 'too_long' });

const nameField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .min(NAME_MIN, { error: 'too_short' })
  .max(NAME_MAX, { error: 'too_long' });

const newEmailField = emailField.regex(EMAIL_PATTERN, { error: 'invalid_email' });

/** Senha nova: mesmas regras do cadastro (SPEC-002 §5.2). */
const newPasswordField = z
  .string({ error: 'required' })
  .min(1, { error: 'required' })
  .min(PASSWORD_MIN, { error: 'too_short' })
  .max(PASSWORD_MAX, { error: 'too_long' });

/** Senha já existente: só exige que venha preenchida. */
const existingPasswordField = z
  .string({ error: 'required' })
  .min(1, { error: 'required' })
  .max(PASSWORD_MAX, { error: 'too_long' });

export const registerSchema = z.object({
  name: nameField,
  email: newEmailField,
  password: newPasswordField,
  acceptedTerms: z.literal(true, { error: 'terms_not_accepted' }),
});

export const loginSchema = z.object({
  email: emailField,
  password: existingPasswordField,
});

/** SPEC-003: editar o nome. */
export const updateNameSchema = z.object({ name: nameField });

/** SPEC-003: trocar o e-mail, confirmando com a senha atual. */
export const changeEmailSchema = z.object({
  email: newEmailField,
  currentPassword: existingPasswordField,
});

/** SPEC-003: trocar a senha. A nova não pode ser igual à atual. */
export const changePasswordSchema = z
  .object({ currentPassword: existingPasswordField, newPassword: newPasswordField })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ['newPassword'],
    error: 'same_password',
  });

/** SPEC-003: aceitar a versão vigente dos termos. */
export const acceptConsentSchema = z.object({
  type: z.literal('terms', { error: 'required' }),
  version: z.literal(TERMS_VERSION, { error: 'invalid_version' }),
});

/** Login com Google: o app envia o ID token recebido do Google (DA24). */
export const googleLoginSchema = z.object({
  idToken: z.string({ error: 'required' }).min(1, { error: 'required' }).max(4096),
  acceptedTerms: z.boolean().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string({ error: 'required' }).min(1, { error: 'required' }).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type UpdateNameInput = z.infer<typeof updateNameSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AcceptConsentInput = z.infer<typeof acceptConsentSchema>;

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; fields: FieldErrors };

/** Valida a entrada e devolve o primeiro problema de cada campo como código traduzível. */
export function validate<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return { success: true, data: result.data };
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '_');
    if (fields[field]) continue;
    const code = issue.message as FieldErrorCode;
    fields[field] = FIELD_ERROR_CODES.includes(code) ? code : 'required';
  }
  return { success: false, fields };
}
