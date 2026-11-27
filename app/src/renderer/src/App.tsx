import type { PublicUser } from '@simulador/shared';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../shared/auth-ipc';
import { AppShell, type ShellConnection } from './components/AppShell';
import { AssetCatalog } from './components/AssetCatalog';
import { AssetDetailPage } from './components/AssetDetailPage';
import { AssetSearch } from './components/AssetSearch';
import { AuthLanding } from './components/AuthLanding';
import { CollaboratorLoginForm } from './components/CollaboratorLoginForm';
import { NewsSources } from './components/NewsSources';
import { MySources, UserNews } from './components/UserNews';
import { ConfirmEmailForm } from './components/ConfirmEmailForm';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { Home } from './components/Home';
import { LoginForm } from './components/LoginForm';
import { PortfolioComparison } from './components/PortfolioComparison';
import { PortfolioPage, Portfolios, type CopiedCounts } from './components/Portfolios';
import type { TradeAsset } from './components/TradeForm';
import { Profile } from './components/Profile';
import { RegisterForm } from './components/RegisterForm';
import { Tasks } from './components/Tasks';
import { TradingCalendar } from './components/TradingCalendar';
import { ConnectionContext } from './connection';
import { useVariationNotices } from './useVariationNotices';

/** SPEC-032: por quanto tempo o aviso "Conexão de volta" fica na tela. */
const RECONNECTED_NOTICE_MS = 8000;

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
  /** SPEC-011: as tarefas de dados (colaborador), abertas pelo Início. */
  | { kind: 'tasks'; user: PublicUser }
  /** SPEC-027: fontes de notícias (colaborador). */
  | { kind: 'news'; user: PublicUser }
  /** SPEC-030: a tela Notícias do usuário; `sources` abre a Minhas fontes. */
  | { kind: 'user-news'; user: PublicUser; sources?: boolean }
  /**
   * `assetId`: a ficha do ativo aberta por cima da lista (SPEC-010). `returnTo`: a ficha foi aberta
   * por uma carteira (SPEC-014), e o Voltar leva de volta a ela.
   */
  | { kind: 'assets'; user: PublicUser; assetId?: string; returnTo?: string }
  /**
   * SPEC-012: `portfolioId` abre a carteira; `creating` abre já com o formulário de nova. SPEC-014:
   * `buyAsset` abre a carteira já comprando o ativo escolhido na ficha. SPEC-022: `compare` abre a
   * comparação das carteiras escolhidas; `fromComparison`, a carteira aberta por ela, que volta
   * para ela.
   */
  | {
      kind: 'portfolios';
      user: PublicUser;
      portfolioId?: string;
      creating?: boolean;
      buyAsset?: TradeAsset;
      compare?: string[];
      fromComparison?: string[];
      /** SPEC-023: a carteira aberta acabou de ser copiada de outra, com estes lançamentos. */
      copied?: CopiedCounts;
    };

/**
 * Fluxo de telas da SPEC-002 (§5.3), da SPEC-003 (Meu perfil), da SPEC-004 (recuperar senha), da
 * SPEC-039 (confirmar o e-mail antes de entrar), da SPEC-005 (calendário de pregão, colaborador),
 * da SPEC-006 (ativos: busca do usuário e catálogo do colaborador) e da SPEC-010 (ficha do ativo).
 */
export function App() {
  const { t } = useTranslation();
  const [view, setViewState] = useState<View>({ kind: 'loading' });
  /**
   * SPEC-045: o colaborador está na Visão do usuário. Só na tela: o servidor autoriza pelo dono de
   * cada carteira. Não fica guardado entre as sessões: ao entrar, ele começa na Área do colaborador.
   */
  const [userView, setUserView] = useState(false);
  // SPEC-032: o modo consulta, a data da leitura guardada mais antiga da tela atual e o aviso de
  // que a conexão voltou.
  const [offline, setOffline] = useState(false);
  const [dataFrom, setDataFrom] = useState<string | null>(null);
  const [reconnected, setReconnected] = useState(false);
  /** Muda quando a conexão volta: a tela atual é montada de novo e relê tudo do servidor. */
  const [screenVersion, setScreenVersion] = useState(0);
  /** Cada tela começa sem data: as leituras dela é que dizem de quando são os dados. */
  const setView = useCallback((next: View) => {
    setDataFrom(null);
    setViewState(next);
  }, []);
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
        if (result.ok) {
          // SPEC-032: sem conexão, o app abre em modo consulta com a cópia local.
          setOffline(result.offline === true);
          setView({ kind: 'home', user: result.user });
        } else if (result.error === 'unauthorized') setView({ kind: 'login' });
        else setView({ kind: 'login', notice: result.error });
      })
      .catch(() => setView({ kind: 'login', notice: 'unexpected' }));
  }, [setView]);

  // SPEC-032: o processo principal avisa quando o app entra ou sai do modo consulta, e a data de
  // cada leitura que veio da cópia local.
  useEffect(() => {
    const stopChanges = window.api.connection.onChange((event) => {
      if (event.status === 'offline') {
        setOffline(true);
        setReconnected(false);
      } else if (event.status === 'online') {
        setOffline(false);
        setDataFrom(null);
        setReconnected(true);
        setScreenVersion((version) => version + 1);
        setViewState((current) => ('user' in current ? { ...current, user: event.user } : current));
      } else {
        setOffline(false);
        setReconnected(false);
        setView({ kind: 'login', notice: 'invalid_refresh_token' });
      }
    });
    const stopSavedAt = window.api.connection.onSavedAt((savedAt) =>
      setDataFrom((current) => (current === null || savedAt < current ? savedAt : current)),
    );
    return () => {
      stopChanges();
      stopSavedAt();
    };
  }, [setView]);

  useEffect(() => {
    if (!reconnected) return;
    const timer = setTimeout(() => setReconnected(false), RECONNECTED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [reconnected]);

  const connectionValue = useMemo(() => ({ offline }), [offline]);

  // SPEC-033: avisos de variação, só para a conta de usuário. O clique no aviso abre a ficha do
  // ativo (ou Carteiras, no aviso agrupado); o processo principal já trouxe a janela para a frente.
  const noticeUser = 'user' in view && view.user.role === 'user' ? view.user : null;
  useVariationNotices(noticeUser?.id ?? null, offline);
  useEffect(() => {
    if (!noticeUser) return;
    return window.api.notifications.onClick((target) =>
      setView(
        target.kind === 'asset'
          ? { kind: 'assets', user: noticeUser, assetId: target.assetId }
          : { kind: 'portfolios', user: noticeUser },
      ),
    );
  }, [noticeUser, setView]);

  const signedIn = (user: PublicUser) => {
    setUserView(false);
    setOffline(false);
    setReconnected(false);
    setView({ kind: 'home', user });
  };
  const logout = () => {
    void window.api.auth.logout().finally(() => {
      setUserView(false);
      setOffline(false);
      setReconnected(false);
      setView({ kind: 'login' });
    });
  };
  const sessionExpired = useCallback(() => {
    setUserView(false);
    setOffline(false);
    setView({ kind: 'login', notice: 'invalid_refresh_token' });
  }, [setView]);
  const userChanged = useCallback(
    ({ id, name, email, role }: PublicUser) =>
      setView({ kind: 'profile', user: { id, name, email, role } }),
    [setView],
  );

  if (
    view.kind === 'home' ||
    view.kind === 'profile' ||
    view.kind === 'calendar' ||
    view.kind === 'news' ||
    view.kind === 'user-news' ||
    view.kind === 'assets' ||
    view.kind === 'portfolios' ||
    view.kind === 'tasks'
  ) {
    const { user } = view;
    /** SPEC-045: o papel das telas; na Visão do usuário, o colaborador vê as do usuário. */
    const inUserView = userView && user.role === 'collaborator';
    const shownRole: PublicUser['role'] = inUserView ? 'user' : user.role;
    const toggleUserView = () => {
      setUserView(!inUserView);
      setView({ kind: 'home', user });
      // O foco vai para o conteúdo da tela nova (RNF18).
      requestAnimationFrame(() => document.getElementById('conteudo')?.focus());
    };
    const openCalendar = (year?: number) =>
      setView({ kind: 'calendar', user, ...(year ? { year } : {}) });
    const openAsset = (assetId: string, opener: HTMLElement) => {
      assetOpener.current = opener;
      setView({ kind: 'assets', user, assetId });
    };
    // SPEC-032: só a conta de usuário tem modo consulta.
    const shellConnection: ShellConnection | undefined =
      user.role === 'user'
        ? { offline, dataFrom, reconnected, onRetry: () => window.api.connection.retry() }
        : undefined;
    return (
      <ConnectionContext.Provider value={connectionValue}>
        <AppShell
          {...(shellConnection ? { connection: shellConnection } : {})}
          user={user}
          current={view.kind}
          onHome={() => setView({ kind: 'home', user })}
          onPortfolios={() => setView({ kind: 'portfolios', user })}
          onProfile={() => setView({ kind: 'profile', user })}
          onCalendar={() => openCalendar()}
          onAssets={() => setView({ kind: 'assets', user })}
          onNews={() => setView({ kind: 'news', user })}
          onUserNews={() => setView({ kind: 'user-news', user })}
          onLogout={logout}
          userView={inUserView}
          {...(user.role === 'collaborator' ? { onToggleUserView: toggleUserView } : {})}
        >
          {/* SPEC-032: quando a conexão volta, a tela é montada de novo e relê tudo. */}
          <Fragment key={screenVersion}>
            {view.kind === 'news' && <NewsSources onSessionExpired={sessionExpired} />}
            {view.kind === 'user-news' &&
              (view.sources ? (
                <MySources
                  onBack={() => setView({ kind: 'user-news', user })}
                  onSessionExpired={sessionExpired}
                />
              ) : (
                <UserNews
                  onOpenSources={() => setView({ kind: 'user-news', user, sources: true })}
                  onOpenAsset={openAsset}
                  onSessionExpired={sessionExpired}
                />
              ))}
            {view.kind === 'home' && (
              <Home
                user={{ ...user, role: shownRole }}
                userView={inUserView}
                onOpenProfile={() => setView({ kind: 'profile', user })}
                onOpenCalendar={openCalendar}
                onOpenAssets={() => setView({ kind: 'assets', user })}
                onOpenPortfolios={(creating) =>
                  setView({ kind: 'portfolios', user, ...(creating ? { creating: true } : {}) })
                }
                onOpenTasks={() => setView({ kind: 'tasks', user })}
              />
            )}
            {view.kind === 'tasks' && (
              <Tasks
                onBack={() => setView({ kind: 'home', user })}
                onSessionExpired={sessionExpired}
              />
            )}
            {view.kind === 'portfolios' &&
              (view.compare ? (
                <PortfolioComparison
                  key={view.compare.join(',')}
                  ids={view.compare}
                  onBack={() => setView({ kind: 'portfolios', user })}
                  onOpen={(portfolioId) =>
                    setView({
                      kind: 'portfolios',
                      user,
                      portfolioId,
                      ...(view.compare ? { fromComparison: view.compare } : {}),
                    })
                  }
                  onSessionExpired={sessionExpired}
                />
              ) : view.portfolioId ? (
                <PortfolioPage
                  key={view.portfolioId}
                  portfolioId={view.portfolioId}
                  buyAsset={view.buyAsset ?? null}
                  {...(view.fromComparison
                    ? { backLabel: t('portfolios.comparison.backToComparison') }
                    : {})}
                  onBack={() =>
                    setView(
                      view.fromComparison
                        ? { kind: 'portfolios', user, compare: view.fromComparison }
                        : { kind: 'portfolios', user },
                    )
                  }
                  onOpenAsset={(assetId) =>
                    setView({
                      kind: 'assets',
                      user,
                      assetId,
                      ...(view.portfolioId ? { returnTo: view.portfolioId } : {}),
                    })
                  }
                  justCopied={view.copied ?? null}
                  onOpenPortfolio={(portfolioId, copied) =>
                    setView({
                      kind: 'portfolios',
                      user,
                      portfolioId,
                      ...(copied ? { copied } : {}),
                    })
                  }
                  onCompare={(ids) => setView({ kind: 'portfolios', user, compare: ids })}
                  onSessionExpired={sessionExpired}
                />
              ) : (
                <Portfolios
                  startCreating={view.creating === true}
                  onOpen={(portfolioId, copied) =>
                    setView({
                      kind: 'portfolios',
                      user,
                      portfolioId,
                      ...(copied ? { copied } : {}),
                    })
                  }
                  onCompare={(ids) => setView({ kind: 'portfolios', user, compare: ids })}
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
                  {shownRole === 'collaborator' ? (
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
                    // SPEC-014: só a conta de usuário compra (e o colaborador na Visão do usuário,
                    // SPEC-045); abre a carteira escolhida já comprando.
                    {...(shownRole === 'user'
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
          </Fragment>
        </AppShell>
      </ConnectionContext.Provider>
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
