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

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends TokenPair {
  user: PublicUser;
}

/** Códigos de erro por campo, traduzidos pelo app. */
export type FieldErrorCode =
  'required' | 'too_short' | 'too_long' | 'invalid_email' | 'terms_not_accepted';

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
  | 'google_email_not_verified';

const FIELD_ERROR_CODES: readonly FieldErrorCode[] = [
  'required',
  'too_short',
  'too_long',
  'invalid_email',
  'terms_not_accepted',
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

export const registerSchema = z.object({
  name: z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .min(NAME_MIN, { error: 'too_short' })
    .max(NAME_MAX, { error: 'too_long' }),
  email: emailField.regex(EMAIL_PATTERN, { error: 'invalid_email' }),
  password: z
    .string({ error: 'required' })
    .min(1, { error: 'required' })
    .min(PASSWORD_MIN, { error: 'too_short' })
    .max(PASSWORD_MAX, { error: 'too_long' }),
  acceptedTerms: z.literal(true, { error: 'terms_not_accepted' }),
});

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ error: 'required' })
    .min(1, { error: 'required' })
    .max(PASSWORD_MAX, { error: 'too_long' }),
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
