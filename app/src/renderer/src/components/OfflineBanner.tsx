import { WifiSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReconnectResult } from '../../../shared/auth-ipc';
import { OFFLINE_HINT_ID } from '../connection';
import { formatDate } from '../format';

/**
 * Faixa do modo consulta (SPEC-032 §4.2): sem conexão, os dados são os guardados neste computador,
 * com a data da leitura mais antiga da tela, e o botão Tentar agora.
 */
export function OfflineBanner({
  dataFrom,
  onRetry,
}: {
  /** O `savedAt` mais antigo entre as leituras da tela; nulo enquanto nenhuma chegou. */
  dataFrom: string | null;
  onRetry: () => Promise<ReconnectResult>;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<'idle' | 'retrying' | 'still-offline'>('idle');

  const retry = () => {
    setState('retrying');
    onRetry()
      .then((result) => setState(result === 'offline' ? 'still-offline' : 'idle'))
      .catch(() => setState('still-offline'));
  };

  return (
    <section className="offline-banner" aria-labelledby="titulo-sem-conexao">
      <span className="offline-icon" aria-hidden="true">
        <WifiSlash weight="bold" />
      </span>
      <div className="offline-text">
        <p>
          <strong id="titulo-sem-conexao">{t('offline.title')}</strong> {t('offline.body')}
        </p>
        {dataFrom && (
          <p className="offline-date">
            {t('offline.dataFrom', { date: formatDate(dataFrom, i18n.language, true) })}
          </p>
        )}
        {state === 'still-offline' && <p className="offline-still">{t('offline.stillOffline')}</p>}
        <span id={OFFLINE_HINT_ID} className="visually-hidden">
          {t('offline.needsConnection')}
        </span>
      </div>
      <button
        type="button"
        className="pill pill-small offline-retry"
        onClick={retry}
        disabled={state === 'retrying'}
      >
        {state === 'retrying' ? t('offline.retrying') : t('offline.retry')}
      </button>
    </section>
  );
}
