import type { PublicUser } from '@simulador/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../shared/auth-ipc';
import { CollaboratorLoginForm } from './components/CollaboratorLoginForm';
import { Home } from './components/Home';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { ServerStatusPanel } from './components/ServerStatusPanel';

type View =
  | { kind: 'loading' }
  | { kind: 'login'; notice?: ClientAuthError }
  | { kind: 'register' }
  | { kind: 'collaborator-login' }
  | { kind: 'home'; user: PublicUser };

/** Fluxo de telas da SPEC-002 (§5.3). */
export function App() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    window.api.auth
      .getSession()
      .then((result) => {
        if (result.ok) setView({ kind: 'home', user: result.user });
        else if (result.error === 'unauthorized') setView({ kind: 'login' });
        else setView({ kind: 'login', notice: result.error });
      })
      .catch(() => setView({ kind: 'login', notice: 'unexpected' }));
  }, []);

  const signedIn = (user: PublicUser) => setView({ kind: 'home', user });
  const logout = () => {
    void window.api.auth.logout().finally(() => setView({ kind: 'login' }));
  };

  // Só apresentação: as telas de entrada usam o layout dividido (painel da marca + formulário).
  const authLayout = view.kind !== 'home';

  return (
    <main className={authLayout ? 'page page-auth' : 'page'}>
      <header className="page-header">
        <h1>{t('app.title')}</h1>
        <p className="subtitle">{t('app.subtitle')}</p>
      </header>

      <div className="page-content">
        {view.kind === 'loading' && (
          <p className="loading" aria-live="polite">
            {t('loading')}
          </p>
        )}
        {view.kind === 'login' && (
          <LoginForm
            notice={view.notice}
            onSuccess={signedIn}
            onGoToRegister={() => setView({ kind: 'register' })}
            onGoToCollaborator={() => setView({ kind: 'collaborator-login' })}
          />
        )}
        {view.kind === 'register' && (
          <RegisterForm onSuccess={signedIn} onGoToLogin={() => setView({ kind: 'login' })} />
        )}
        {view.kind === 'collaborator-login' && (
          <CollaboratorLoginForm onSuccess={signedIn} onBack={() => setView({ kind: 'login' })} />
        )}
        {view.kind === 'home' && <Home user={view.user} onLogout={logout} />}

        <ServerStatusPanel />
      </div>
      <footer className="disclaimer">{t('disclaimer')}</footer>
    </main>
  );
}
