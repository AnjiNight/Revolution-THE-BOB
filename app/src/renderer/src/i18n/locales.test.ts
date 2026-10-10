import type { AuthErrorCode, FieldErrorCode } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') result[path] = (v.match(/\{\{\w+\}\}/g) ?? []).sort();
    else if (typeof v === 'object' && v !== null)
      for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k);
  };
  walk(value, '');
  return result;
}

describe('arquivos de idioma (CA13)', () => {
  it('português e inglês têm exatamente as mesmas chaves', () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });

  it('usam as mesmas variáveis de interpolação', () => {
    expect(placeholders(en)).toEqual(placeholders(ptBR));
  });

  it('não têm textos vazios', () => {
    for (const text of Object.values(placeholders(ptBR))) expect(text).toBeDefined();
    const empty = (v: unknown): boolean =>
      typeof v === 'string' ? v.trim() === '' : Object.values(v as object).some(empty);
    expect(empty(ptBR)).toBe(false);
    expect(empty(en)).toBe(false);
  });

  it('traduzem todos os códigos de erro de autenticação e de campo', () => {
    const authErrors: Array<AuthErrorCode | ClientAuthError> = [
      'validation_error',
      'email_in_use',
      'invalid_credentials',
      'invalid_refresh_token',
      'unauthorized',
      'rate_limited',
      'wrong_account_type',
      'terms_required',
      'google_login_unavailable',
      'google_token_invalid',
      'google_email_not_verified',
      'google_cancelled',
      'server_unavailable',
      'invalid_url',
      'unexpected',
    ];
    const fieldErrors: FieldErrorCode[] = [
      'required',
      'too_short',
      'too_long',
      'invalid_email',
      'terms_not_accepted',
    ];
    for (const locale of [ptBR, en]) {
      for (const code of authErrors) expect(locale.authErrors[code]).toBeTruthy();
      for (const code of fieldErrors) expect(locale.fieldErrors[code]).toBeTruthy();
    }
  });
});
