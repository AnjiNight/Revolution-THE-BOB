import type { PublicUser } from '@simulador/shared';
import { useTranslation } from 'react-i18next';

interface HomeProps {
  user: PublicUser;
  onLogout: () => void;
}

export function Home({ user, onLogout }: HomeProps) {
  const { t } = useTranslation();
  return (
    <section className={`card home home-${user.role}`}>
      <h2>{t('home.greeting', { name: user.name })}</h2>
      <p className="status-detail">{t(`home.role.${user.role}`)}</p>
      <p>{user.role === 'collaborator' ? t('home.collaboratorNext') : t('home.next')}</p>
      <button type="button" className="secondary" onClick={onLogout}>
        {t('home.logout')}
      </button>
    </section>
  );
}
