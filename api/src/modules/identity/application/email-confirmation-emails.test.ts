import { describe, expect, it } from 'vitest';
import {
  emailChangeCodeEmail,
  emailChangedNotice,
  maskEmail,
  signupCodeEmail,
} from './email-confirmation-emails.js';

describe('e-mails da confirmação (SPEC-039 §5.3)', () => {
  it('esconde o e-mail novo no aviso ao endereço antigo', () => {
    expect(maskEmail('ana.souza@gmail.com')).toBe('a***@gmail.com');
    expect(maskEmail('x@y.com')).toBe('x***@y.com');
    expect(maskEmail('sem-arroba')).toBe('***');
  });

  it('os três e-mails, nos dois idiomas, têm o código formatado e nenhum link', () => {
    const at = new Date('2026-10-12T15:30:00Z');
    const drafts = (['pt-BR', 'en'] as const).flatMap((locale) => [
      signupCodeEmail(locale, 'Ana', 'K7QM4XPD'),
      emailChangeCodeEmail(locale, 'Ana', 'K7QM4XPD'),
      emailChangedNotice(locale, 'Ana', 'a***@gmail.com', at),
    ]);
    for (const draft of drafts) expect(draft.text).not.toMatch(/https?:\/\//);
    expect(drafts.filter((d) => d.text.includes('K7QM-4XPD'))).toHaveLength(4);
    expect(signupCodeEmail('pt-BR', 'Ana', 'K7QM4XPD').text).toContain('apagada em 7 dias');
    expect(emailChangedNotice('pt-BR', 'Ana', 'a***@gmail.com', at).text).toContain(
      '12 de outubro de 2026',
    );
  });
});
