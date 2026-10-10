import type { ConsentList, PublicUser } from '@simulador/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTermsOutdated, TermsUpdateNotice } from './Profile';

interface HomeProps {
  user: PublicUser;
  onLogout: () => void;
  onOpenProfile: () => void;
}

export function Home({ user, onLogout, onOpenProfile }: HomeProps) {
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
    <section className={`card home home-${user.role}`}>
      {consents && isTermsOutdated(consents) && (
        <TermsUpdateNotice submitting={accepting} onAccept={() => void accept()} />
      )}
      <h2>{t('home.greeting', { name: user.name })}</h2>
      <p className="status-detail">{t(`home.role.${user.role}`)}</p>
      <p>{user.role === 'collaborator' ? t('home.collaboratorNext') : t('home.next')}</p>
      <div className="home-actions">
        <button type="button" onClick={onOpenProfile}>
          {t('home.profile')}
        </button>
        <button type="button" className="secondary" onClick={onLogout}>
          {t('home.logout')}
        </button>
      </div>
    </section>
  );
}
