import { describe, expect, it } from 'vitest';
import { accountDeletedEmail, deletionCodeEmail } from './account-deletion-emails.js';

describe('e-mails da exclusão (SPEC-034 §5.4)', () => {
  it('nos dois idiomas, sem links; o código aparece formatado', () => {
    const at = new Date('2026-10-13T15:30:00Z');
    const drafts = (['pt-BR', 'en'] as const).flatMap((locale) => [
      deletionCodeEmail(locale, 'Ana', 'K7QM4XPD'),
      accountDeletedEmail(locale, 'Ana', at),
    ]);
    for (const draft of drafts) expect(draft.text).not.toMatch(/https?:\/\//);
    expect(deletionCodeEmail('pt-BR', 'Ana', 'K7QM4XPD').text).toContain('K7QM-4XPD');
    expect(deletionCodeEmail('en', 'Ana', 'K7QM4XPD').subject).toBe('Code to delete your account');
    expect(accountDeletedEmail('pt-BR', 'Ana', at).text).toContain('13 de outubro de 2026');
  });
});
