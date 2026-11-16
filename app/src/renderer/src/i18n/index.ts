import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isAppLanguage, type AppLanguage } from '../../../shared/auth-ipc';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

export const resources = {
  'pt-BR': { translation: ptBR },
  en: { translation: en },
} as const satisfies Record<AppLanguage, unknown>;

/**
 * SPEC-035: o nome de cada idioma escrito nele mesmo ("English", não "Inglês"). Não se traduz: é
 * o nome que a pessoa procura no botão.
 */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  'pt-BR': 'Português',
  en: 'English',
};

/** SPEC-035: onde a escolha do idioma fica neste computador. */
export const LANGUAGE_STORAGE_KEY = 'simulador.idioma';

/**
 * A escolha guardada neste computador (SPEC-035); sem ela, o idioma do sistema: inglês quando ele
 * começa com "en", português nos outros casos (RNF20). Um valor guardado estranho é ignorado.
 */
export function pickLanguage(
  saved: string | null | undefined,
  systemLanguage: string | undefined,
): AppLanguage {
  if (isAppLanguage(saved)) return saved;
  return systemLanguage?.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';
}

/** O idioma em uso, sempre um dos dois. */
export function currentLanguage(): AppLanguage {
  return i18n.language === 'en' ? 'en' : 'pt-BR';
}

/** O armazenamento local pode não existir ou recusar o acesso: nesse caso, nada fica guardado. */
function savedLanguage(): string | null {
  try {
    return globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Troca o idioma na hora, sem recarregar, e guarda a escolha neste computador (SPEC-035). Sem
 * armazenamento, a troca vale até fechar o app.
 */
export async function changeLanguage(language: AppLanguage): Promise<void> {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Sem armazenamento: a troca vale só até fechar o app.
  }
  await i18n.changeLanguage(language);
}

/**
 * O `<html lang>` (leitores de tela e hifenização) e o título da janela acompanham o idioma, e o
 * processo principal fica sabendo dele (a página do login com Google e o nome do arquivo de
 * exportação, SPEC-035).
 */
function followLanguage(): void {
  const language = currentLanguage();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.title = i18n.t('app.title');
  }
  void globalThis.window?.api?.setLanguage?.(language);
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: pickLanguage(savedLanguage(), globalThis.navigator?.language),
    fallbackLng: 'pt-BR',
    interpolation: { escapeValue: false },
  })
  .then(() => {
    followLanguage();
    i18n.on('languageChanged', followLanguage);
  });

export default i18n;
