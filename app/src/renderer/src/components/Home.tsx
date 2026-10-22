import {
  calendarYearsToCheck,
  isoDateInBrasilia,
  yearOf,
  type ConsentList,
  type PublicUser,
} from '@simulador/shared';
import {
  ArrowUpRight,
  CalendarBlank,
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
  /** SPEC-005: abre o calendário de pregão no ano do aviso. */
  onOpenCalendar: (year: number) => void;
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

export function Home({ user, onOpenProfile, onOpenCalendar }: HomeProps) {
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
      {user.role === 'collaborator' && <CalendarReminder onOpen={onOpenCalendar} />}

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

/**
 * SPEC-005 (CA09): avisa o colaborador do calendário de pregão que falta publicar. O ano atual,
 * sempre (sem ele os lançamentos desse ano ficam bloqueados); o seguinte, desde 1º de dezembro.
 * "Hoje" é o dia em Brasília.
 */
function CalendarReminder({ onOpen }: { onOpen: (year: number) => void }) {
  const { t } = useTranslation();
  const [today] = useState(() => isoDateInBrasilia(new Date()));
  const [missing, setMissing] = useState<number[]>([]);

  useEffect(() => {
    let current = true;
    void Promise.all(
      calendarYearsToCheck(today).map((year) => window.api.calendar.getYear(year)),
    ).then((results) => {
      if (!current) return;
      // Falha na consulta não vira aviso: só ano que o servidor confirmou não estar publicado.
      setMissing(results.flatMap((r) => (r.ok && !r.data.published ? [r.data.year] : [])));
    });
    return () => {
      current = false;
    };
  }, [today]);

  if (missing.length === 0) return null;
  return (
    <div className="calendar-reminder" role="status">
      <ul>
        {missing.map((year) => (
          <li key={year}>
            {year === yearOf(today)
              ? t('home.calendarReminder.missing', { year })
              : t('home.calendarReminder.nextYear', { year })}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="pill pill-ghost pill-small"
        onClick={() => onOpen(missing[0]!)}
      >
        {t('home.calendarReminder.open')}
        <span className="pill-icon" aria-hidden="true">
          <CalendarBlank weight="bold" />
        </span>
      </button>
    </div>
  );
}
