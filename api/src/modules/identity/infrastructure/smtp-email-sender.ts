import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { AppConfig, SmtpConfig } from '../../../config.js';
import type { EmailMessage, EmailSender } from '../application/ports.js';

/**
 * Opções da conexão SMTP. Porta 465: TLS desde o início. Outras portas: STARTTLS, obrigatório em
 * produção (RNF09 vale também para o e-mail que sai do servidor). No desenvolvimento, o Mailpit
 * (porta 1025) não usa TLS.
 */
export function smtpTransportOptions(
  smtp: SmtpConfig,
  env: AppConfig['env'],
): SMTPTransport.Options {
  const secure = smtp.port === 465;
  return {
    host: smtp.host,
    port: smtp.port,
    secure,
    requireTLS: env === 'production' && !secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
    // Sem resposta do servidor de e-mail, desiste em vez de segurar a tarefa para sempre.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/** Envio de e-mail por SMTP (SPEC-004): qualquer provedor serve, trocando só a configuração. */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(
    private readonly smtp: SmtpConfig,
    env: AppConfig['env'],
  ) {
    this.transport = nodemailer.createTransport(smtpTransportOptions(smtp, env));
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.smtp.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
