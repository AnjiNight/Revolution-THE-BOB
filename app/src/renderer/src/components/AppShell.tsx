import type { PublicUser } from '@simulador/shared';
import { ChartLineUp, Eye, SignOut } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReconnectResult } from '../../../shared/auth-ipc';
import { stopDisabledClick } from '../connection';
import { initials } from '../format';
import '../shell.css';
import { LanguageSwitch } from './LanguageSwitch';
import { OfflineBanner } from './OfflineBanner';
import { ServerStatusPanel } from './ServerStatusPanel';

/** SPEC-032: a situação da conexão que a moldura mostra. */
export interface ShellConnection {
  offline: boolean;
  /** A data da leitura guardada mais antiga da tela atual. */
  dataFrom: string | null;
  /** A conexão acabou de voltar: mostra o aviso por alguns segundos. */
  reconnected: boolean;
  onRetry: () => Promise<ReconnectResult>;
}

interface AppShellProps {
  connection?: ShellConnection;
  user: PublicUser;
  /** SPEC-011: a tela Tarefas não tem item no menu (abre pelo Início). */
  current: 'home' | 'profile' | 'calendar' | 'assets' | 'portfolios' | 'tasks' | 'news' | 'plan';
  onHome: () => void;
  /** SPEC-012: só para o usuário. */
  onPortfolios: () => void;
  onProfile: () => void;
  /** SPEC-025: a tela Plano, só no menu do usuário. */
  onPlan: () => void;
  /** SPEC-005: só na Área do colaborador. */
  onCalendar: () => void;
  /** SPEC-006: busca (usuário) ou catálogo (colaborador). */
  onAssets: () => void;
  /** SPEC-027: fontes de notícias, só na Área do colaborador. */
  onNews: () => void;
  onLogout: () => void;
  /**
   * SPEC-045: o colaborador está na Visão do usuário (as telas e o menu do usuário, com as
   * carteiras de teste dele).
   */
  userView?: boolean;
  /** SPEC-045: entra ou sai da Visão do usuário; só para o colaborador. */
  onToggleUserView?: () => void;
  children: ReactNode;
}

/**
 * Moldura das telas depois do login (Início, Ativos, Meu perfil e, para o colaborador, o
 * Calendário): a mesma navegação flutuante da página de entrada, com a pessoa conectada e o
 * botão Sair, e a situação do servidor no rodapé.
 */
export function AppShell({
  connection,
  user,
  current,
  onHome,
  onPortfolios,
  onProfile,
  onPlan,
  onCalendar,
  onAssets,
  onNews,
  onLogout,
  userView = false,
  onToggleUserView,
  children,
}: AppShellProps) {
  const { t } = useTranslation();
  /** SPEC-045: na Visão do usuário, o colaborador vê o menu do usuário. */
  const role = userView ? 'user' : user.role;
  const ariaCurrent = (view: AppShellProps['current']) => (current === view ? 'page' : undefined);

  return (
    <div className={`shell shell-${user.role}${userView ? ' shell-user-view' : ''}`}>
      <a className="skip-link" href="#conteudo">
        {t('shell.skip')}
      </a>

      <header className="island-wrap">
        <nav className="island" aria-label={t('shell.navLabel')}>
          <button type="button" className="brand brand-button" onClick={onHome}>
            <span className="brand-mark" aria-hidden="true">
              <ChartLineUp weight="bold" />
            </span>
            <span className="brand-name">{t('app.title')}</span>
          </button>

          <ul className="island-links">
            <li>
              <button type="button" aria-current={ariaCurrent('home')} onClick={onHome}>
                {t('shell.home')}
              </button>
            </li>
            {role === 'user' && (
              <li>
                <button
                  type="button"
                  aria-current={ariaCurrent('portfolios')}
                  onClick={onPortfolios}
                >
                  {t('shell.portfolios')}
                </button>
              </li>
            )}
            {role === 'collaborator' && (
              <li>
                <button type="button" aria-current={ariaCurrent('calendar')} onClick={onCalendar}>
                  {t('shell.calendar')}
                </button>
              </li>
            )}
            <li>
              <button type="button" aria-current={ariaCurrent('assets')} onClick={onAssets}>
                {t('shell.assets')}
              </button>
            </li>
            {role === 'collaborator' && (
              <li>
                <button type="button" aria-current={ariaCurrent('news')} onClick={onNews}>
                  {t('shell.news')}
                </button>
              </li>
            )}
            {role === 'collaborator' && onToggleUserView && (
              <li>
                <button
                  type="button"
                  className="user-view-button"
                  aria-label={t('shell.userView')}
                  onClick={onToggleUserView}
                >
                  <span className="user-view-icon" aria-hidden="true">
                    <Eye weight="bold" />
                  </span>
                  <span className="user-view-text">{t('shell.userView')}</span>
                </button>
              </li>
            )}
            {role === 'user' && (
              <li>
                <button type="button" aria-current={ariaCurrent('plan')} onClick={onPlan}>
                  {t('shell.plan')}
                </button>
              </li>
            )}
            <li>
              <button type="button" aria-current={ariaCurrent('profile')} onClick={onProfile}>
                {t('home.profile')}
              </button>
            </li>
          </ul>

          <div className="shell-account">
            <span className="avatar" aria-hidden="true" title={user.name}>
              {initials(user.name)}
            </span>
            <button
              type="button"
              className="pill pill-ghost pill-small logout-button"
              aria-label={t('shell.logoutLabel')}
              onClick={onLogout}
            >
              <span className="logout-text">{t('home.logout')}</span>
              <span className="pill-icon" aria-hidden="true">
                <SignOut weight="bold" />
              </span>
            </button>
          </div>
        </nav>
      </header>

      <main
        id="conteudo"
        className="shell-main"
        tabIndex={-1}
        // SPEC-032: no modo consulta, nenhum botão de escrita faz nada.
        {...(connection?.offline ? { onClickCapture: stopDisabledClick } : {})}
      >
        {/* SPEC-032: anunciado uma vez a cada mudança, também para o leitor de tela. */}
        <p className="visually-hidden" role="status">
          {connection?.offline
            ? t('offline.announce')
            : connection?.reconnected
              ? t('offline.back')
              : ''}
        </p>
        {userView && onToggleUserView && (
          <div className="user-view-banner" role="status">
            <p>
              <strong>{t('shell.userViewBannerTitle')}</strong> {t('shell.userViewBannerText')}
            </p>
            <button
              type="button"
              className="pill pill-primary pill-small"
              onClick={onToggleUserView}
            >
              {t('shell.backToCollaborator')}
            </button>
          </div>
        )}
        {connection?.offline && (
          <OfflineBanner dataFrom={connection.dataFrom} onRetry={connection.onRetry} />
        )}
        {connection && !connection.offline && connection.reconnected && (
          <p className="connection-back" aria-hidden="true">
            {t('offline.back')}
          </p>
        )}
        {children}
      </main>

      <footer className="shell-footer">
        <div className="status-dock">
          <ServerStatusPanel />
        </div>
        {/* SPEC-035: em todas as telas; na barra do topo não cabe a 480 px. */}
        <div className="footer-language">
          <LanguageSwitch />
        </div>
        <p className="disclaimer">{t('disclaimer')}</p>
      </footer>
    </div>
  );
}
