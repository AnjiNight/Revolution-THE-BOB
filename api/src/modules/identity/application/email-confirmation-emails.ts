import {
  EMAIL_CODE_TTL_MINUTES,
  formatEmailCode,
  PENDING_ACCOUNT_DAYS,
  type EmailLocale,
} from '@simulador/shared';
import type { EmailMessage } from './ports.js';

/** Textos dos e-mails da confirmação de e-mail (SPEC-039 §5.3). Texto simples, sem links. */

type Draft = Omit<EmailMessage, 'to'>;

const SIGNATURE: Record<EmailLocale, string> = {
  'pt-BR': '— Simulador de Investimentos (projeto acadêmico, Universidade Presbiteriana Mackenzie)',
  en: '— Investment Simulator (academic project, Mackenzie Presbyterian University)',
};

/** `ana.souza@gmail.com` → `a***@gmail.com`: o aviso não entrega o e-mail novo inteiro. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export function signupCodeEmail(locale: EmailLocale, name: string, code: string): Draft {
  const formatted = formatEmailCode(code);
  if (locale === 'en') {
    return {
      subject: 'Confirm your email',
      text: [
        `Hi, ${name},`,
        '',
        'Use this code to confirm the email of your new Investment Simulator account:',
        '',
        `    ${formatted}`,
        '',
        `It is valid for ${EMAIL_CODE_TTL_MINUTES} minutes. Type it in the app, on the "Confirm your email" screen.`,
        '',
        `If you didn't create this account, ignore this email: it will be deleted in ${PENDING_ACCOUNT_DAYS} days.`,
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Confirme seu e-mail',
    text: [
      `Olá, ${name},`,
      '',
      'Use este código para confirmar o e-mail da sua nova conta no Simulador de Investimentos:',
      '',
      `    ${formatted}`,
      '',
      `Ele vale por ${EMAIL_CODE_TTL_MINUTES} minutos. Digite-o no app, na tela "Confirme seu e-mail".`,
      '',
      `Se você não criou esta conta, ignore este e-mail: ela será apagada em ${PENDING_ACCOUNT_DAYS} dias.`,
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}

export function emailChangeCodeEmail(locale: EmailLocale, name: string, code: string): Draft {
  const formatted = formatEmailCode(code);
  if (locale === 'en') {
    return {
      subject: 'Confirm your new email',
      text: [
        `Hi, ${name},`,
        '',
        'Use this code to confirm this address as the new email of your Investment Simulator account:',
        '',
        `    ${formatted}`,
        '',
        `It is valid for ${EMAIL_CODE_TTL_MINUTES} minutes. Type it in the app, on the "My profile" screen.`,
        '',
        "If you didn't ask for this change, ignore this email.",
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Confirme seu novo e-mail',
    text: [
      `Olá, ${name},`,
      '',
      'Use este código para confirmar este endereço como o novo e-mail da sua conta no Simulador de Investimentos:',
      '',
      `    ${formatted}`,
      '',
      `Ele vale por ${EMAIL_CODE_TTL_MINUTES} minutos. Digite-o no app, na tela "Meu perfil".`,
      '',
      'Se você não pediu esta troca, ignore este e-mail.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}

/** Vai para o e-mail antigo depois da troca: se não foi a pessoa, ela fica sabendo. */
export function emailChangedNotice(
  locale: EmailLocale,
  name: string,
  maskedNewEmail: string,
  at: Date,
): Draft {
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(at);
  if (locale === 'en') {
    return {
      subject: 'The email of your account was changed',
      text: [
        `Hi, ${name},`,
        '',
        `The email of your Investment Simulator account was changed to ${maskedNewEmail} on ${when} (Brasília time).`,
        '',
        "If it wasn't you, someone may have accessed your account: let the project team know right away.",
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'O e-mail da sua conta foi trocado',
    text: [
      `Olá, ${name},`,
      '',
      `O e-mail da sua conta no Simulador de Investimentos foi trocado para ${maskedNewEmail} em ${when} (horário de Brasília).`,
      '',
      'Se não foi você, alguém pode ter entrado na sua conta: avise a equipe do projeto o quanto antes.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}
