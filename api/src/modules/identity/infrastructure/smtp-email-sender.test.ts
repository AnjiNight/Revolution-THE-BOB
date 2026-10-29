import { describe, expect, it } from 'vitest';
import { smtpTransportOptions } from './smtp-email-sender.js';

const smtp = { host: 'smtp.exemplo.com', port: 587, user: null, password: null, from: 'a@x.com' };

describe('conexão SMTP (SPEC-004)', () => {
  it('em produção exige TLS: STARTTLS na 587 e TLS direto na 465 (RNF09)', () => {
    expect(smtpTransportOptions(smtp, 'production')).toMatchObject({
      secure: false,
      requireTLS: true,
    });
    expect(smtpTransportOptions({ ...smtp, port: 465 }, 'production')).toMatchObject({
      secure: true,
      requireTLS: false,
    });
  });

  it('no desenvolvimento aceita o Mailpit, sem TLS e sem usuário', () => {
    const options = smtpTransportOptions({ ...smtp, host: 'localhost', port: 1025 }, 'development');
    expect(options).toMatchObject({
      host: 'localhost',
      port: 1025,
      secure: false,
      requireTLS: false,
    });
    expect(options.auth).toBeUndefined();
  });

  it('usa usuário e senha quando informados', () => {
    expect(
      smtpTransportOptions({ ...smtp, user: 'conta', password: 'segredo' }, 'production').auth,
    ).toEqual({ user: 'conta', pass: 'segredo' });
  });
});
