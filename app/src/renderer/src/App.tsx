import type { PublicUser } from '@simulador/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../shared/auth-ipc';
import { AppShell } from './components/AppShell';
import { AuthLanding } from './components/AuthLanding';
import { CollaboratorLoginForm } from './components/CollaboratorLoginForm';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { Home } from './components/Home';
import { LoginForm } from './components/LoginForm';
import { Profile } from './components/Profile';
import { RegisterForm } from './components/RegisterForm';

/** Volta da recuperação de senha (SPEC-004): e-mail preenchido e aviso de senha redefinida. */
interface AfterReset {
  email?: string;
  passwordReset?: boolean;
}

type View =
  | { kind: 'loading' }
  | ({ kind: 'login'; notice?: ClientAuthError } & AfterReset)
  | { kind: 'register' }
  | ({ kind: 'collaborator-login' } & AfterReset)
  | { kind: 'forgot-password'; origin: 'user' | 'collaborator'; email: string }
  | { kind: 'home'; user: PublicUser }
  | { kind: 'profile'; user: PublicUser };

/** Fluxo de telas da SPEC-002 (§5.3), da SPEC-003 (Meu perfil) e da SPEC-004 (recuperar senha). */
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
  const sessionExpired = useCallback(
    () => setView({ kind: 'login', notice: 'invalid_refresh_token' }),
    [],
  );
  const userChanged = useCallback(
    ({ id, name, email, role }: PublicUser) =>
      setView({ kind: 'profile', user: { id, name, email, role } }),
    [],
  );

  if (view.kind === 'home' || view.kind === 'profile') {
    const { user } = view;
    return (
      <AppShell
        user={user}
        current={view.kind}
        onHome={() => setView({ kind: 'home', user })}
        onProfile={() => setView({ kind: 'profile', user })}
        onLogout={logout}
      >
        {view.kind === 'home' ? (
          <Home user={user} onOpenProfile={() => setView({ kind: 'profile', user })} />
        ) : (
          <Profile onUserChanged={userChanged} onSessionExpired={sessionExpired} />
        )}
      </AppShell>
    );
  }

  // Telas de entrada: a página de apresentação envolve o formulário da tela atual.
  return (
    <AuthLanding
      onCreateAccount={() => setView({ kind: 'register' })}
      onSignIn={() => setView({ kind: 'login' })}
    >
      {view.kind === 'loading' && (
        <p className="loading" aria-live="polite">
          {t('loading')}
        </p>
      )}
      {view.kind === 'login' && (
        <LoginForm
          notice={view.notice}
          initialEmail={view.email}
          passwordReset={view.passwordReset}
          onSuccess={signedIn}
          onForgotPassword={(email) => setView({ kind: 'forgot-password', origin: 'user', email })}
          onGoToRegister={() => setView({ kind: 'register' })}
          onGoToCollaborator={() => setView({ kind: 'collaborator-login' })}
        />
      )}
      {view.kind === 'register' && (
        <RegisterForm onSuccess={signedIn} onGoToLogin={() => setView({ kind: 'login' })} />
      )}
      {view.kind === 'collaborator-login' && (
        <CollaboratorLoginForm
          initialEmail={view.email}
          passwordReset={view.passwordReset}
          onSuccess={signedIn}
          onForgotPassword={(email) =>
            setView({ kind: 'forgot-password', origin: 'collaborator', email })
          }
          onBack={() => setView({ kind: 'login' })}
        />
      )}
      {view.kind === 'forgot-password' && (
        <ForgotPasswordForm
          initialEmail={view.email}
          origin={view.origin}
          onDone={(email) => setView({ kind: entryView(view.origin), email, passwordReset: true })}
          onBack={() => setView({ kind: entryView(view.origin), email: view.email })}
        />
      )}
    </AuthLanding>
  );
}

/** Tela de entrada de cada tipo de conta. */
function entryView(origin: 'user' | 'collaborator'): 'login' | 'collaborator-login' {
  return origin === 'collaborator' ? 'collaborator-login' : 'login';
}
