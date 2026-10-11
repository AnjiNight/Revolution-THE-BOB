import type { ConsentList, PublicUser } from '@simulador/shared';
import {
  ArrowUpRight,
  ClockCounterClockwise,
  Database,
  Lightning,
  Pulse,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTermsOutdated, TermsUpdateNotice } from './Profile';

interface HomeProps {
  user: PublicUser;
  onOpenProfile: () => void;
}

/** O que vem nas próximas versões: carteiras para o usuário, ferramentas para o colaborador. */
const UPCOMING: Record<
  PublicUser['role'],
  ReadonlyArray<{ title: string; text: string; icon: Icon }>
> = {
  user: [
    {
      title: 'landing.portfolios.live.title',
      text: 'landing.portfolios.live.text',
      icon: Lightning,
    },
    {
      title: 'landing.portfolios.historic.title',
      text: 'landing.portfolios.historic.text',
      icon: ClockCounterClockwise,
    },
  ],
  collaborator: [
    {
      title: 'home.collabTools.assets.title',
      text: 'home.collabTools.assets.text',
      icon: Database,
    },
    {
      title: 'home.collabTools.ingestion.title',
      text: 'home.collabTools.ingestion.text',
      icon: Pulse,
    },
  ],
};

export function Home({ user, onOpenProfile }: HomeProps) {
  const { t } = useTranslation();
  const [consents, setConsents] = useState<ConsentList | null>(null);
  const [accepting, setAccepting] = useState(false);

  // SPEC-003: se os termos mudaram desde o último aceite, pede um novo aceite ao entrar.
  useEffect(() => {
    if (user.role !== 'user') return;
    void window.api.profile.listConsents().then((result) => result.ok && setConsents(result.data));
  }, [user.role]);

  const accept = async () => {
    setAccepting(true);
    const result = await window.api.profile.acceptTerms();
    if (result.ok) {
      const list = await window.api.profile.listConsents();
      if (list.ok) setConsents(list.data);
    }
    setAccepting(false);
  };

  return (
    <div className={`home-view home-${user.role}`}>
      {consents && isTermsOutdated(consents) && (
        <TermsUpdateNotice submitting={accepting} onAccept={() => void accept()} />
      )}

      <header className="page-hero">
        <p className={user.role === 'collaborator' ? 'eyebrow eyebrow-warn' : 'eyebrow'}>
          {t(`profile.roleName.${user.role}`)}
        </p>
        <h1>{t('home.greeting', { name: user.name })}</h1>
        <p className="lead">
          {user.role === 'collaborator' ? t('home.collaboratorNext') : t('home.next')}
        </p>
        <button type="button" className="pill pill-primary" onClick={onOpenProfile}>
          {t('home.profile')}
          <span className="pill-icon" aria-hidden="true">
            <ArrowUpRight weight="bold" />
          </span>
        </button>
      </header>

      <section className="upcoming" aria-labelledby="upcoming-title">
        <h2 id="upcoming-title" className="section-label">
          {t('home.upcomingTitle')}
        </h2>
        <ul className="upcoming-grid">
          {UPCOMING[user.role].map(({ title, text, icon: ItemIcon }) => (
            <li key={title} className="bezel">
              <div className="bezel-core upcoming-card">
                <div className="upcoming-head">
                  <span className="round-icon" aria-hidden="true">
                    <ItemIcon weight="light" />
                  </span>
                  <span className="soon-badge">{t('home.soon')}</span>
                </div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
