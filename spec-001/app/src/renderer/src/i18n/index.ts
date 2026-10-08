import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

export const resources = {
  'pt-BR': { translation: ptBR },
  en: { translation: en },
} as const;

/** Português é o padrão; inglês quando o sistema estiver em inglês (RNF20). */
export function pickLanguage(systemLanguage: string | undefined): keyof typeof resources {
  return systemLanguage?.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: pickLanguage(globalThis.navigator?.language),
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

export default i18n;
