import { EMAIL_CODE_ALPHABET, EMAIL_CODE_LENGTH } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { generateEmailCode, EmailCodeHasher } from './email-code.js';

describe('código enviado por e-mail (SPEC-004, SPEC-039)', () => {
  it('tem 8 caracteres do alfabeto e muda a cada sorteio', () => {
    const codes = new Set(Array.from({ length: 200 }, generateEmailCode));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toHaveLength(EMAIL_CODE_LENGTH);
      for (const char of code) expect(EMAIL_CODE_ALPHABET).toContain(char);
    }
  });

  it('o HMAC depende do segredo do servidor e não é o SHA-256 puro do código', () => {
    const a = new EmailCodeHasher('segredo-a-com-mais-de-32-caracteres-aaaa');
    const b = new EmailCodeHasher('segredo-b-com-mais-de-32-caracteres-bbbb');
    expect(a.hash('K7QM4XPD')).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash('K7QM4XPD')).not.toBe(b.hash('K7QM4XPD'));
    expect(a.matches(a.hash('K7QM4XPD'), 'K7QM4XPD')).toBe(true);
    expect(a.matches(a.hash('K7QM4XPD'), 'K7QM4XPE')).toBe(false);
    expect(a.matches(b.hash('K7QM4XPD'), 'K7QM4XPD')).toBe(false);
  });
});
