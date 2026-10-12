import { formatResetCode, RESET_CODE_TTL_MINUTES, type EmailLocale } from '@simulador/shared';
import type { EmailMessage } from './ports.js';

/**
 * Textos dos e-mails da recuperação de senha (SPEC-004 §5.4). Texto simples, sem links: ninguém
 * consegue imitar o e-mail para levar a pessoa a uma página falsa.
 */

type Draft = Omit<EmailMessage, 'to'>;

const SIGNATURE: Record<EmailLocale, string> = {
  'pt-BR': '— Simulador de Investimentos (projeto acadêmico, Universidade Presbiteriana Mackenzie)',
  en: '— Investment Simulator (academic project, Mackenzie Presbyterian University)',
};

export function resetCodeEmail(locale: EmailLocale, name: string, code: string): Draft {
  const formatted = formatResetCode(code);
  if (locale === 'en') {
    return {
      subject: 'Your code to reset your password',
      text: [
        `Hi, ${name},`,
        '',
        'Use this code to reset the password of your Investment Simulator account:',
        '',
        `    ${formatted}`,
        '',
        `It is valid for ${RESET_CODE_TTL_MINUTES} minutes and can be used only once. Type it in the app, on the "Reset password" screen.`,
        '',
        "If you didn't ask for it, ignore this email: your password stays the same.",
        'We never ask for this code by phone, message or another email.',
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Seu código para redefinir a senha',
    text: [
      `Olá, ${name},`,
      '',
      'Use este código para redefinir a senha da sua conta no Simulador de Investimentos:',
      '',
      `    ${formatted}`,
      '',
      `Ele vale por ${RESET_CODE_TTL_MINUTES} minutos e só pode ser usado uma vez. Digite-o no app, na tela "Recuperar senha".`,
      '',
      'Se você não pediu, ignore este e-mail: sua senha continua a mesma.',
      'Nunca pedimos este código por telefone, mensagem ou outro e-mail.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}

/** Conta só com Google: não há senha para redefinir (decisão da SPEC-003). */
export function googleOnlyEmail(locale: EmailLocale, name: string): Draft {
  if (locale === 'en') {
    return {
      subject: 'Password reset request',
      text: [
        `Hi, ${name},`,
        '',
        'We received a request to reset the password of your Investment Simulator account, but it signs in with Google and has no password.',
        '',
        'To sign in, use the "Continue with Google" button in the app.',
        '',
        "If you didn't make this request, you can ignore this email.",
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Pedido de redefinição de senha',
    text: [
      `Olá, ${name},`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no Simulador de Investimentos, mas ela entra com o Google e não tem senha.',
      '',
      'Para entrar, use o botão "Continuar com o Google" no app.',
      '',
      'Se você não fez esse pedido, pode ignorar este e-mail.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}

/** Aviso depois da troca: se não foi a pessoa, ela fica sabendo na hora. */
export function passwordChangedEmail(locale: EmailLocale, name: string, at: Date): Draft {
  // A B3 e o público do app estão no Brasil: horário de Brasília nos dois idiomas.
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(at);
  if (locale === 'en') {
    return {
      subject: 'Your password was reset',
      text: [
        `Hi, ${name},`,
        '',
        `The password of your Investment Simulator account was reset on ${when} (Brasília time). For your security, every open session was signed out.`,
        '',
        'If it wasn\'t you, ask for a new code on the "Forgot your password?" screen to change the password again, and let the project team know.',
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Sua senha foi redefinida',
    text: [
      `Olá, ${name},`,
      '',
      `A senha da sua conta no Simulador de Investimentos foi redefinida em ${when} (horário de Brasília). Por segurança, todas as sessões abertas foram encerradas.`,
      '',
      'Se não foi você, peça um novo código na tela "Esqueci minha senha" para trocar a senha de novo e avise a equipe do projeto.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}
