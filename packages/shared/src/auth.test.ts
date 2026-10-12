import { describe, expect, it } from 'vitest';
import {
  acceptConsentSchema,
  changeEmailSchema,
  changePasswordSchema,
  formatResetCode,
  googleLoginSchema,
  loginSchema,
  normalizeEmail,
  normalizeResetCode,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  RESET_CODE_ALPHABET,
  TERMS_VERSION,
  updateNameSchema,
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

describe('esquemas do perfil (SPEC-003)', () => {
  it('updateNameSchema usa as mesmas regras do cadastro', () => {
    expect(validate(updateNameSchema, { name: '  Ana Lima ' })).toEqual({
      success: true,
      data: { name: 'Ana Lima' },
    });
    expect(validate(updateNameSchema, { name: 'A' })).toEqual({
      success: false,
      fields: { name: 'too_short' },
    });
  });

  it('changeEmailSchema normaliza o e-mail e exige a senha atual', () => {
    expect(
      validate(changeEmailSchema, { email: ' Ana@X.com ', currentPassword: 'qualquer' }),
    ).toEqual({ success: true, data: { email: 'ana@x.com', currentPassword: 'qualquer' } });
    expect(validate(changeEmailSchema, { email: 'x', currentPassword: '' })).toEqual({
      success: false,
      fields: { email: 'invalid_email', currentPassword: 'required' },
    });
  });

  it('changePasswordSchema recusa senha nova curta ou igual à atual', () => {
    expect(
      validate(changePasswordSchema, { currentPassword: 'atual-123', newPassword: 'curta' }),
    ).toEqual({ success: false, fields: { newPassword: 'too_short' } });
    expect(
      validate(changePasswordSchema, {
        currentPassword: 'mesma-senha',
        newPassword: 'mesma-senha',
      }),
    ).toEqual({ success: false, fields: { newPassword: 'same_password' } });
  });

  it('acceptConsentSchema só aceita a versão vigente dos termos', () => {
    expect(validate(acceptConsentSchema, { type: 'terms', version: TERMS_VERSION }).success).toBe(
      true,
    );
    expect(validate(acceptConsentSchema, { type: 'terms', version: '0' })).toEqual({
      success: false,
      fields: { version: 'invalid_version' },
    });
  });
});

describe('recuperação de senha (SPEC-004)', () => {
  it('o alfabeto do código não tem I, L, O nem U', () => {
    expect(RESET_CODE_ALPHABET).toHaveLength(32);
    expect(RESET_CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it('normaliza o código como a pessoa costuma digitar (CA10)', () => {
    expect(normalizeResetCode(' k7qm-4xpd ')).toBe('K7QM4XPD');
    expect(normalizeResetCode('O1IL 2345')).toBe('01112345');
    expect(formatResetCode('K7QM4XPD')).toBe('K7QM-4XPD');
  });

  it('passwordResetRequestSchema valida o e-mail e cai para português com idioma desconhecido', () => {
    expect(validate(passwordResetRequestSchema, { email: ' Ana@X.com ', locale: 'en' })).toEqual({
      success: true,
      data: { email: 'ana@x.com', locale: 'en' },
    });
    expect(validate(passwordResetRequestSchema, { email: 'ana@x.com', locale: 'fr' })).toEqual({
      success: true,
      data: { email: 'ana@x.com', locale: 'pt-BR' },
    });
    expect(validate(passwordResetRequestSchema, { email: 'ana@x.com' })).toEqual({
      success: true,
      data: { email: 'ana@x.com', locale: 'pt-BR' },
    });
    expect(validate(passwordResetRequestSchema, { email: 'sem-arroba' })).toEqual({
      success: false,
      fields: { email: 'invalid_email' },
    });
  });

  it('passwordResetConfirmSchema normaliza o código e aplica as regras da senha nova', () => {
    const ok = validate(passwordResetConfirmSchema, {
      email: 'ana@x.com',
      code: 'k7qm-4xpd',
      newPassword: 'senha-nova-longa',
    });
    expect(ok).toEqual({
      success: true,
      data: {
        email: 'ana@x.com',
        code: 'K7QM4XPD',
        newPassword: 'senha-nova-longa',
        locale: 'pt-BR',
      },
    });
    expect(
      validate(passwordResetConfirmSchema, {
        email: 'ana@x.com',
        code: 'ABC',
        newPassword: 'curta',
      }),
    ).toEqual({ success: false, fields: { code: 'invalid_code', newPassword: 'too_short' } });
    expect(
      validate(passwordResetConfirmSchema, {
        email: 'ana@x.com',
        code: ' - ',
        newPassword: 'x'.repeat(8),
      }),
    ).toEqual({ success: false, fields: { code: 'required' } });
    expect(
      validate(passwordResetConfirmSchema, {
        email: 'ana@x.com',
        code: 'K7QM4XPU',
        newPassword: 'x'.repeat(8),
      }),
    ).toEqual({ success: false, fields: { code: 'invalid_code' } });
  });
});
