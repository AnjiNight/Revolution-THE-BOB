import { describe, expect, it } from 'vitest';
import {
  googleLoginSchema,
  loginSchema,
  normalizeEmail,
  registerSchema,
  validate,
} from './auth.js';

const valid = {
  name: '  Ana Souza ',
  email: '  Ana.Souza@Exemplo.COM ',
  password: 'senha-bem-longa',
  acceptedTerms: true,
};

describe('registerSchema', () => {
  it('aceita e normaliza um cadastro válido', () => {
    const result = validate(registerSchema, valid);
    expect(result).toEqual({
      success: true,
      data: {
        name: 'Ana Souza',
        email: 'ana.souza@exemplo.com',
        password: 'senha-bem-longa',
        acceptedTerms: true,
      },
    });
  });

  it('não altera a senha (espaços fazem parte dela)', () => {
    const result = validate(registerSchema, { ...valid, password: '  com espaço  ' });
    expect(result.success && result.data.password).toBe('  com espaço  ');
  });

  it.each([
    [{}, { name: 'required', email: 'required', password: 'required' }],
    [{ ...valid, name: '   ' }, { name: 'required' }],
    [{ ...valid, name: 'A' }, { name: 'too_short' }],
    [{ ...valid, name: 'A'.repeat(101) }, { name: 'too_long' }],
    [{ ...valid, email: 'sem-arroba' }, { email: 'invalid_email' }],
    [{ ...valid, email: `${'a'.repeat(250)}@x.com` }, { email: 'too_long' }],
    [{ ...valid, password: '1234567' }, { password: 'too_short' }],
    [{ ...valid, password: 'x'.repeat(129) }, { password: 'too_long' }],
    [{ ...valid, acceptedTerms: false }, { acceptedTerms: 'terms_not_accepted' }],
  ])('recusa %j com o código certo por campo', (input, expected) => {
    const result = validate(registerSchema, input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fields).toMatchObject(expected);
  });

  it('exige o aceite dos termos quando ele não é enviado', () => {
    const { acceptedTerms: _, ...withoutTerms } = valid;
    const result = validate(registerSchema, withoutTerms);
    expect(!result.success && result.fields.acceptedTerms).toBe('terms_not_accepted');
  });
});

describe('loginSchema', () => {
  it('normaliza o e-mail e não exige tamanho mínimo de senha', () => {
    expect(validate(loginSchema, { email: ' A@B.com ', password: 'x' })).toEqual({
      success: true,
      data: { email: 'a@b.com', password: 'x' },
    });
  });

  it('aceita entrada nula sem quebrar', () => {
    const result = validate(loginSchema, null);
    expect(!result.success && result.fields).toEqual({ email: 'required', password: 'required' });
  });
});

describe('normalizeEmail', () => {
  it('remove espaços e passa para minúsculas', () => {
    expect(normalizeEmail('  Ana@X.COM ')).toBe('ana@x.com');
  });
});

describe('googleLoginSchema', () => {
  it('exige o idToken e aceita o aceite dos termos opcional', () => {
    expect(validate(googleLoginSchema, { idToken: 'abc' })).toEqual({
      success: true,
      data: { idToken: 'abc' },
    });
    expect(validate(googleLoginSchema, { idToken: 'abc', acceptedTerms: true }).success).toBe(true);
    expect(validate(googleLoginSchema, {})).toEqual({
      success: false,
      fields: { idToken: 'required' },
    });
  });
});
