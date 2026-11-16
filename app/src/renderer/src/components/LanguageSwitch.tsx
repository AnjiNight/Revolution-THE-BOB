import { Translate } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, currentLanguage, LANGUAGE_NAMES } from '../i18n';

/**
 * Troca de idioma (SPEC-035 §4.2): o globo e o nome do outro idioma, escrito nele mesmo
 * ("English" com o app em português). A troca é na hora, e a escolha fica neste computador.
 */
export function LanguageSwitch() {
  const { t } = useTranslation();
  const [changed, setChanged] = useState(false);
  const other = currentLanguage() === 'en' ? 'pt-BR' : 'en';

  return (
    <>
      <button
        type="button"
        className="language-switch"
        title={t('language.switchTo')}
        onClick={() => {
          setChanged(true);
          void changeLanguage(other);
        }}
      >
        <Translate weight="bold" aria-hidden="true" />
        {/* O nome no idioma dele: o leitor de tela pronuncia "English" em inglês. */}
        <span lang={other}>{LANGUAGE_NAMES[other]}</span>
      </button>
      {/* Anunciada só depois de uma troca, já no idioma novo. */}
      <span className="visually-hidden" role="status">
        {changed ? t('language.changed') : ''}
      </span>
    </>
  );
}
