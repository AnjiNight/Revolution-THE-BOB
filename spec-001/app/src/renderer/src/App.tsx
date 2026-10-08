import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerStatus } from '../../shared/server-status';

type ViewState = { kind: 'checking' } | ServerStatus;

const MESSAGE_KEY: Record<ViewState['kind'], string> = {
  checking: 'server.checking',
  connected: 'server.connected',
  degraded: 'server.degraded',
  unavailable: 'server.unavailable',
  'invalid-url': 'server.invalidUrl',
};

export function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<ViewState>({ kind: 'checking' });

  const load = useCallback(() => {
    window.api
      .checkServerHealth()
      .then(setState)
      .catch(() => setState({ kind: 'unavailable' }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setState({ kind: 'checking' });
    load();
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>{t('app.title')}</h1>
        <p className="subtitle">{t('app.subtitle')}</p>
      </header>

      <section className={`card status status-${state.kind}`} aria-live="polite">
        <h2>{t('server.heading')}</h2>
        <p className="status-message">
          <span className="status-dot" aria-hidden="true" />
          {t(MESSAGE_KEY[state.kind])}
        </p>
        {'version' in state && (
          <p className="status-detail">{t('server.version', { version: state.version })}</p>
        )}
        <button type="button" onClick={retry} disabled={state.kind === 'checking'}>
          {t('server.retry')}
        </button>
      </section>

      <footer className="disclaimer">{t('disclaimer')}</footer>
    </main>
  );
}
