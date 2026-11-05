import {
  calendarYearsToCheck,
  isoDateInBrasilia,
  yearOf,
  type CdiStatus,
  type ConsentList,
  type Investidor10Status,
  type PublicUser,
} from '@simulador/shared';
import {
  ArrowUpRight,
  CalendarBlank,
  ClockCounterClockwise,
  Database,
  Lightning,
  MagnifyingGlass,
  Pulse,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCalendarDay, formatDate } from '../format';
import { isTermsOutdated, TermsUpdateNotice } from './Profile';

interface HomeProps {
  user: PublicUser;
  onOpenProfile: () => void;
  /** SPEC-005: abre o calendário de pregão (no ano do aviso, se vier de um). */
  onOpenCalendar: (year?: number) => void;
  /** SPEC-006: busca (usuário) ou catálogo (colaborador). */
  onOpenAssets: () => void;
}

type Tool = 'search' | 'calendar' | 'assets';

/** O que já funciona: a busca para o usuário; o calendário e o catálogo para o colaborador. */
const AVAILABLE: Record<PublicUser['role'], ReadonlyArray<{ tool: Tool; icon: Icon }>> = {
  user: [{ tool: 'search', icon: MagnifyingGlass }],
  collaborator: [
    { tool: 'calendar', icon: CalendarBlank },
    { tool: 'assets', icon: Database },
  ],
};

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
      title: 'home.collabTools.ingestion.title',
      text: 'home.collabTools.ingestion.text',
      icon: Pulse,
    },
  ],
};

export function Home({ user, onOpenProfile, onOpenCalendar, onOpenAssets }: HomeProps) {
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
      {user.role === 'collaborator' && <CdiStatusPanel />}
      {user.role === 'collaborator' && <Investidor10Panel />}

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

      <section className="upcoming available" aria-labelledby="available-title">
        <h2 id="available-title" className="section-label">
          {t('home.availableTitle')}
        </h2>
        <ul className="upcoming-grid">
          {AVAILABLE[user.role].map(({ tool, icon: ItemIcon }) => {
            const title = t(`home.tools.${tool}.title`);
            return (
              <li key={tool} className="bezel">
                <div className="bezel-core upcoming-card available-card">
                  <div className="upcoming-head">
                    <span className="round-icon" aria-hidden="true">
                      <ItemIcon weight="light" />
                    </span>
                  </div>
                  <h3>{title}</h3>
                  <p>{t(`home.tools.${tool}.text`)}</p>
                  <button
                    type="button"
                    className="pill pill-ghost pill-small"
                    aria-label={`${t('home.open')}: ${title}`}
                    onClick={() => (tool === 'calendar' ? onOpenCalendar() : onOpenAssets())}
                  >
                    {t('home.open')}
                    <span className="pill-icon" aria-hidden="true">
                      <ArrowUpRight weight="bold" />
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

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
 * SPEC-007 (§5.3): até que dia a série do CDI está carregada e a última atualização. Os problemas
 * (série parada, falha, pregões sem CDI) aparecem em âmbar. Falha na consulta não mostra nada.
 */
function CdiStatusPanel() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<CdiStatus | null>(null);

  useEffect(() => {
    let current = true;
    void window.api.indexes.cdi().then((result) => current && result.ok && setStatus(result.data));
    return () => {
      current = false;
    };
  }, []);

  if (!status) return null;
  const day = (date: string) => formatCalendarDay(date, i18n.language);
  const summary =
    status.from && status.to
      ? t('home.cdi.loaded', { from: day(status.from), to: day(status.to) }) +
        (status.lastRun
          ? ` · ${t('home.cdi.updated', { at: formatDate(status.lastRun.at, i18n.language, true) })}`
          : '')
      : t('home.cdi.loading');
  const warnings = [
    status.stale && status.to ? t('home.cdi.stale', { date: day(status.to) }) : null,
    status.lastRun?.status === 'falha'
      ? t('home.cdi.failed', { at: formatDate(status.lastRun.at, i18n.language, true) })
      : null,
    status.missingTradingDays > 0
      ? t('home.cdi.missing', { count: status.missingTradingDays })
      : null,
  ].filter((warning): warning is string => warning !== null);

  if (warnings.length === 0) {
    return (
      <p className="cdi-status" role="status">
        {summary}
      </p>
    );
  }
  return (
    <div className="calendar-reminder" role="status">
      <ul>
        <li>{summary}</li>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * SPEC-041 (§5.3): coleta semanal do Investidor10. Desligada (sem a autorização) ou com a última
 * coleta em falha, o aviso fica em âmbar.
 */
function Investidor10Panel() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Investidor10Status | null>(null);

  useEffect(() => {
    let current = true;
    void window.api.fundamentals
      .collection()
      .then((result) => current && result.ok && setStatus(result.data));
    return () => {
      current = false;
    };
  }, []);

  if (!status) return null;
  if (!status.enabled) {
    return (
      <div className="calendar-reminder" role="status">
        <p>{t('home.investidor10.disabled')}</p>
      </div>
    );
  }
  const summary = status.lastRun
    ? t('home.investidor10.summary', {
        at: formatDate(status.lastRun.at, i18n.language, true),
        collected: status.collected,
        total: status.activeAssets,
      })
    : t('home.investidor10.never');
  if (status.lastRun?.status === 'falha') {
    return (
      <div className="calendar-reminder" role="status">
        <ul>
          <li>{summary}</li>
          <li>{t('home.investidor10.failed')}</li>
        </ul>
      </div>
    );
  }
  return (
    <p className="cdi-status" role="status">
      {summary}
    </p>
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
