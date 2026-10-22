import type { PublicUser } from '@simulador/shared';
import { ChartLineUp, SignOut } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { initials } from '../format';
import '../shell.css';
import { ServerStatusPanel } from './ServerStatusPanel';

interface AppShellProps {
  user: PublicUser;
  current: 'home' | 'profile' | 'calendar';
  onHome: () => void;
  onProfile: () => void;
  /** SPEC-005: só na Área do colaborador. */
  onCalendar: () => void;
  onLogout: () => void;
  children: ReactNode;
}

/**
 * Moldura das telas depois do login (Início, Meu perfil e, para o colaborador, o Calendário): a
 * mesma navegação flutuante da página de entrada, com a pessoa conectada e o botão Sair, e a
 * situação do servidor no rodapé.
 */
export function AppShell({
  user,
  current,
  onHome,
  onProfile,
  onCalendar,
  onLogout,
  children,
}: AppShellProps) {
  const { t } = useTranslation();
  const ariaCurrent = (view: AppShellProps['current']) => (current === view ? 'page' : undefined);

  return (
    <div className={`shell shell-${user.role}`}>
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
            {user.role === 'collaborator' && (
              <li>
                <button type="button" aria-current={ariaCurrent('calendar')} onClick={onCalendar}>
                  {t('shell.calendar')}
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
            <button type="button" className="pill pill-ghost pill-small" onClick={onLogout}>
              {t('home.logout')}
              <span className="pill-icon" aria-hidden="true">
                <SignOut weight="bold" />
              </span>
            </button>
          </div>
        </nav>
      </header>

      <main id="conteudo" className="shell-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="shell-footer">
        <div className="status-dock">
          <ServerStatusPanel />
        </div>
        <p className="disclaimer">{t('disclaimer')}</p>
      </footer>
    </div>
  );
}
