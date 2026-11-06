import type { PublicUser } from '@simulador/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../shared/auth-ipc';
import { AppShell } from './components/AppShell';
import { AssetCatalog } from './components/AssetCatalog';
import { AssetDetailPage } from './components/AssetDetailPage';
import { AssetSearch } from './components/AssetSearch';
import { AuthLanding } from './components/AuthLanding';
import { CollaboratorLoginForm } from './components/CollaboratorLoginForm';
import { ConfirmEmailForm } from './components/ConfirmEmailForm';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { Home } from './components/Home';
import { LoginForm } from './components/LoginForm';
import { PortfolioPage, Portfolios } from './components/Portfolios';
import type { TradeAsset } from './components/TradeForm';
import { Profile } from './components/Profile';
import { RegisterForm } from './components/RegisterForm';
import { TradingCalendar } from './components/TradingCalendar';

/** Volta da recuperação de senha (SPEC-004): e-mail preenchido e aviso de senha redefinida. */
interface AfterReset {
  email?: string;
  passwordReset?: boolean;
}

type View =
  | { kind: 'loading' }
  | ({ kind: 'login'; notice?: ClientAuthError; accountDeleted?: boolean } & AfterReset)
  | { kind: 'register'; name?: string; email?: string }
  | { kind: 'confirm-email'; email: string; name?: string; reason: 'signup' | 'login' }
  | ({ kind: 'collaborator-login' } & AfterReset)
  | { kind: 'forgot-password'; origin: 'user' | 'collaborator'; email: string }
  | { kind: 'home'; user: PublicUser }
  | { kind: 'profile'; user: PublicUser }
  | { kind: 'calendar'; user: PublicUser; year?: number }
  /**
   * `assetId`: a ficha do ativo aberta por cima da lista (SPEC-010). `returnTo`: a ficha foi aberta
   * por uma carteira (SPEC-014), e o Voltar leva de volta a ela.
   */
  | { kind: 'assets'; user: PublicUser; assetId?: string; returnTo?: string }
  /**
   * SPEC-012: `portfolioId` abre a carteira; `creating` abre já com o formulário de nova. SPEC-014:
   * `buyAsset` abre a carteira já comprando o ativo escolhido na ficha.
   */
  | {
      kind: 'portfolios';
      user: PublicUser;
      portfolioId?: string;
      creating?: boolean;
      buyAsset?: TradeAsset;
    };

/**
 * Fluxo de telas da SPEC-002 (§5.3), da SPEC-003 (Meu perfil), da SPEC-004 (recuperar senha), da
 * SPEC-039 (confirmar o e-mail antes de entrar), da SPEC-005 (calendário de pregão, colaborador),
 * da SPEC-006 (ativos: busca do usuário e catálogo do colaborador) e da SPEC-010 (ficha do ativo).
 */
export function App() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ kind: 'loading' });
  /** O botão que abriu a ficha: o foco volta para ele quando a ficha fecha. */
  const assetOpener = useRef<HTMLElement | null>(null);
  const showingList = view.kind === 'assets' && view.assetId === undefined;

  useEffect(() => {
    const opener = assetOpener.current;
    if (!showingList || !opener) return;
    assetOpener.current = null;
    if (opener.isConnected) opener.focus();
  }, [showingList]);

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

  if (
    view.kind === 'home' ||
    view.kind === 'profile' ||
    view.kind === 'calendar' ||
    view.kind === 'assets' ||
    view.kind === 'portfolios'
  ) {
    const { user } = view;
    const openCalendar = (year?: number) =>
      setView({ kind: 'calendar', user, ...(year ? { year } : {}) });
    const openAsset = (assetId: string, opener: HTMLElement) => {
      assetOpener.current = opener;
      setView({ kind: 'assets', user, assetId });
    };
    return (
      <AppShell
        user={user}
        current={view.kind}
        onHome={() => setView({ kind: 'home', user })}
        onPortfolios={() => setView({ kind: 'portfolios', user })}
        onProfile={() => setView({ kind: 'profile', user })}
        onCalendar={() => openCalendar()}
        onAssets={() => setView({ kind: 'assets', user })}
        onLogout={logout}
      >
        {view.kind === 'home' && (
          <Home
            user={user}
            onOpenProfile={() => setView({ kind: 'profile', user })}
            onOpenCalendar={openCalendar}
            onOpenAssets={() => setView({ kind: 'assets', user })}
            onOpenPortfolios={(creating) =>
              setView({ kind: 'portfolios', user, ...(creating ? { creating: true } : {}) })
            }
          />
        )}
        {view.kind === 'portfolios' &&
          (view.portfolioId ? (
            <PortfolioPage
              key={view.portfolioId}
              portfolioId={view.portfolioId}
              buyAsset={view.buyAsset ?? null}
              onBack={() => setView({ kind: 'portfolios', user })}
              onOpenAsset={(assetId) =>
                setView({
                  kind: 'assets',
                  user,
                  assetId,
                  ...(view.portfolioId ? { returnTo: view.portfolioId } : {}),
                })
              }
              onSessionExpired={sessionExpired}
            />
          ) : (
            <Portfolios
              startCreating={view.creating === true}
              onOpen={(portfolioId) => setView({ kind: 'portfolios', user, portfolioId })}
              onSessionExpired={sessionExpired}
            />
          ))}
        {view.kind === 'calendar' && (
          // A chave reabre a tela no ano pedido pelo aviso do Início.
          <TradingCalendar
            key={view.year ?? 'atual'}
            initialYear={view.year}
            onSessionExpired={sessionExpired}
          />
        )}
        {view.kind === 'assets' && (
          <>
            {/* Com a ficha aberta, a lista fica escondida, mas montada: a busca não se perde. */}
            <div hidden={view.assetId !== undefined}>
              {user.role === 'collaborator' ? (
                <AssetCatalog onSessionExpired={sessionExpired} onOpenAsset={openAsset} />
              ) : (
                <AssetSearch onSessionExpired={sessionExpired} onOpenAsset={openAsset} />
              )}
            </div>
            {view.assetId !== undefined && (
              <AssetDetailPage
                key={view.assetId}
                assetId={view.assetId}
                onBack={() =>
                  setView(
                    view.returnTo
                      ? { kind: 'portfolios', user, portfolioId: view.returnTo }
                      : { kind: 'assets', user },
                  )
                }
                // SPEC-014: só a conta de usuário compra; abre a carteira escolhida já comprando.
                {...(user.role === 'user'
                  ? {
                      onBuy: (portfolioId: string, asset: TradeAsset) =>
                        setView({ kind: 'portfolios', user, portfolioId, buyAsset: asset }),
                    }
                  : {})}
                onSessionExpired={sessionExpired}
              />
            )}
          </>
        )}
        {view.kind === 'profile' && (
          <Profile
            onUserChanged={userChanged}
            onSessionExpired={sessionExpired}
            onAccountDeleted={() => setView({ kind: 'login', accountDeleted: true })}
          />
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
          accountDeleted={view.accountDeleted}
          onSuccess={signedIn}
          onForgotPassword={(email) => setView({ kind: 'forgot-password', origin: 'user', email })}
          onConfirmationRequired={(email) =>
            setView({ kind: 'confirm-email', email, reason: 'login' })
          }
          onGoToRegister={() => setView({ kind: 'register' })}
          onGoToCollaborator={() => setView({ kind: 'collaborator-login' })}
        />
      )}
      {view.kind === 'register' && (
        <RegisterForm
          initialName={view.name}
          initialEmail={view.email}
          onRegistered={(email, name) =>
            setView({ kind: 'confirm-email', email, name, reason: 'signup' })
          }
          onSuccess={signedIn}
          onGoToLogin={() => setView({ kind: 'login' })}
        />
      )}
      {view.kind === 'confirm-email' && (
        <ConfirmEmailForm
          email={view.email}
          reason={view.reason}
          onSuccess={signedIn}
          onFixEmail={() =>
            setView({
              kind: 'register',
              email: view.email,
              ...(view.name ? { name: view.name } : {}),
            })
          }
          onBack={() => setView({ kind: 'login', email: view.email })}
        />
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
