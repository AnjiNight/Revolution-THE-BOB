import { EMAIL_CODE_TTL_MINUTES, formatEmailCode, type EmailLocale } from '@simulador/shared';
import type { EmailMessage } from './ports.js';

/** Textos dos e-mails da exclusão de conta (SPEC-034 §5.4). Texto simples, sem links. */

type Draft = Omit<EmailMessage, 'to'>;

const SIGNATURE: Record<EmailLocale, string> = {
  'pt-BR': '— Simulador de Investimentos (projeto acadêmico, Universidade Presbiteriana Mackenzie)',
  en: '— Investment Simulator (academic project, Mackenzie Presbyterian University)',
};

export function deletionCodeEmail(locale: EmailLocale, name: string, code: string): Draft {
  const formatted = formatEmailCode(code);
  if (locale === 'en') {
    return {
      subject: 'Code to delete your account',
      text: [
        `Hi, ${name},`,
        '',
        'Use this code to permanently delete your Investment Simulator account and all its data:',
        '',
        `    ${formatted}`,
        '',
        `It is valid for ${EMAIL_CODE_TTL_MINUTES} minutes. Type it in the app, on the "My profile" screen.`,
        '',
        "If you didn't ask for this, ignore this email and change your password: someone may be using your account.",
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Código para excluir sua conta',
    text: [
      `Olá, ${name},`,
      '',
      'Use este código para excluir de vez sua conta no Simulador de Investimentos e todos os seus dados:',
      '',
      `    ${formatted}`,
      '',
      `Ele vale por ${EMAIL_CODE_TTL_MINUTES} minutos. Digite-o no app, na tela "Meu perfil".`,
      '',
      'Se você não pediu, ignore este e-mail e troque sua senha: alguém pode estar usando sua conta.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}

/** Despedida: enviada para o endereço que a conta tinha, depois de apagar tudo. */
export function accountDeletedEmail(locale: EmailLocale, name: string, at: Date): Draft {
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(at);
  if (locale === 'en') {
    return {
      subject: 'Your account was deleted',
      text: [
        `Hi, ${name},`,
        '',
        `Your Investment Simulator account was deleted on ${when} (Brasília time). Your data was erased.`,
        '',
        'If you want to come back, just create a new account.',
        '',
        SIGNATURE.en,
      ].join('\n'),
    };
  }
  return {
    subject: 'Sua conta foi excluída',
    text: [
      `Olá, ${name},`,
      '',
      `Sua conta no Simulador de Investimentos foi excluída em ${when} (horário de Brasília). Seus dados foram apagados.`,
      '',
      'Se quiser voltar, é só criar uma conta nova.',
      '',
      SIGNATURE['pt-BR'],
    ].join('\n'),
  };
}
