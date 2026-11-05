import {
  ASSET_DETAIL_REFRESH_MINUTES,
  DEFAULT_PRICE_HISTORY_PERIOD,
  FREE_QUOTE_DELAY_MINUTES,
  PRICE_HISTORY_PERIODS,
  showsIntradayQuote,
  type AssetDetail,
  type AssetSession,
  type PriceHistory,
  type PriceHistoryPeriod,
} from '@simulador/shared';
import { ArrowLeft, Info, Question, Warning } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import '../asset-detail.css';
import '../assets.css';
import {
  formatCalendarDay,
  formatChange,
  formatCompactMoney,
  formatCount,
  formatDate,
  formatMoney,
  quoteMoment,
} from '../format';
import { useSectorName } from './AssetFields';
import { AssetLogo } from './AssetLogo';
import { DividendsPanel, FundamentalsPanel } from './FundamentalsPanels';
import { PriceChart } from './PriceChart';
import { changeDirection } from './QuoteText';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; asset: AssetDetail; refreshFailed: boolean }
  | { status: 'failed'; error: ClientAuthError };

interface AssetDetailPageProps {
  assetId: string;
  onBack: () => void;
  onSessionExpired: () => void;
}

/**
 * Ficha do ativo (SPEC-010 §5.2): dados, última cotação com horário ou data, último pregão da B3 e
 * o gráfico dos fechamentos, sempre com o aviso de preços sem ajuste. Com a ficha aberta, a cotação
 * do topo é pedida de novo a cada 5 minutos; se falhar, a ficha continua com o que tinha (QA02).
 */
export function AssetDetailPage({ assetId, onBack, onSessionExpired }: AssetDetailPageProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const announced = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => {
      void window.api.assets.detail(assetId).then((result) => {
        if (!active) return;
        if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        setState((previous) => {
          if (result.ok) return { status: 'ready', asset: result.data, refreshFailed: false };
          if (previous.status === 'ready' && result.error !== 'asset_not_found') {
            return { ...previous, refreshFailed: true };
          }
          return { status: 'failed', error: result.error };
        });
      });
    };
    load();
    const timer = setInterval(load, ASSET_DETAIL_REFRESH_MINUTES * 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [assetId, attempt, onSessionExpired]);

  // A ficha abriu: o foco vai para o ticker, e o leitor de tela começa por ele.
  useEffect(() => {
    if (state.status !== 'ready' || announced.current) return;
    announced.current = true;
    heading.current?.focus();
  }, [state.status]);

  const back = (
    <button type="button" className="link asset-detail-back" onClick={onBack}>
      <ArrowLeft weight="bold" aria-hidden="true" />
      {t('detail.back')}
    </button>
  );

  if (state.status === 'loading') {
    return (
      <div className="asset-detail">
        {back}
        <p className="loading" role="status">
          {t('detail.loading')}
        </p>
      </div>
    );
  }

  if (state.status === 'failed') {
    const notFound = state.error === 'asset_not_found';
    return (
      <div className="asset-detail">
        {back}
        <p className="form-error" role="alert">
          {notFound ? t('detail.notFound') : t('detail.loadFailed')}
        </p>
        {!notFound && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}
          >
            {t('detail.retry')}
          </button>
        )}
      </div>
    );
  }

  const { asset } = state;
  return (
    <div className="asset-detail">
      {back}
      <DetailHeader asset={asset} headingRef={heading} />
      {state.refreshFailed && (
        <p className="catalog-capacity" role="status">
          <Warning weight="fill" aria-hidden="true" />
          {t('detail.refreshFailed', { minutes: ASSET_DETAIL_REFRESH_MINUTES })}
        </p>
      )}
      <SessionPanel session={asset.lastSession} />
      <FundamentalsPanel
        assetId={asset.id}
        ticker={asset.ticker}
        onSessionExpired={onSessionExpired}
      />
      <HistoryPanel asset={asset} onSessionExpired={onSessionExpired} />
      <DividendsPanel assetId={asset.id} onSessionExpired={onSessionExpired} />
    </div>
  );
}

/** Logo, ticker, nome, classe e setor; à direita, o preço do topo (SPEC-010 §4.2). */
function DetailHeader({
  asset,
  headingRef,
}: {
  asset: AssetDetail;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const sectorName = useSectorName();
  return (
    <header className="asset-detail-head">
      <div className="asset-detail-identity">
        <AssetLogo asset={asset} large />
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            {asset.ticker}
          </h1>
          <p className="asset-detail-name">{asset.name}</p>
          <p className="asset-detail-tags">
            <span className={`class-badge class-${asset.class}`}>
              {t(`assets.class.${asset.class}`)}
            </span>
            <span>{sectorName(asset.class, asset.sector)}</span>
          </p>
          {!asset.active && asset.deactivatedAt && (
            <p className="catalog-capacity">
              <Warning weight="fill" aria-hidden="true" />
              {t('detail.deactivated', { date: formatDate(asset.deactivatedAt, i18n.language) })}
            </p>
          )}
        </div>
      </div>
      <PriceHeadline asset={asset} />
    </header>
  );
}

/**
 * O preço mais recente: a cotação do pregão quando ela é de um dia depois do último fechamento da
 * B3; senão, o fechamento, que é o oficial. Nunca "tempo real" (DA16).
 */
function PriceHeadline({ asset }: { asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const session = asset.lastSession;

  let price: string;
  let change: string | null;
  let when: string;
  if (showsIntradayQuote(asset.quote, session)) {
    const moment = quoteMoment(asset.quote.at, language);
    price = asset.quote.price;
    change = asset.quote.change;
    when = moment.today
      ? t('assets.quote.today', { time: moment.time, delay: FREE_QUOTE_DELAY_MINUTES })
      : t('assets.quote.otherDay', { date: moment.date, time: moment.time });
  } else if (session) {
    price = session.close;
    change = session.change;
    when = t('detail.closeOf', { date: formatCalendarDay(session.date, language) });
  } else {
    return <p className="asset-headline quote-none">{t('assets.quote.none')}</p>;
  }

  return (
    <div className="asset-headline">
      <p className="asset-headline-price">
        <span>{formatMoney(price, language)}</span>
        {change !== null && (
          <span className={`quote-change is-${changeDirection(change)}`}>
            {formatChange(change, language)}
          </span>
        )}
      </p>
      <p className="quote-time">{when}</p>
    </div>
  );
}

const SESSION_TERMS = ['open', 'high', 'low', 'close', 'trades', 'volume'] as const;
type SessionTerm = (typeof SESSION_TERMS)[number];

/** Último pregão da B3, com uma explicação curta de cada termo (QA13). */
function SessionPanel({ session }: { session: AssetSession | null }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();

  const value = (term: SessionTerm, current: AssetSession): string => {
    if (term === 'trades') {
      return current.trades === null ? '—' : formatCount(current.trades, language);
    }
    if (term === 'volume') {
      return current.volume === null ? '—' : formatCompactMoney(current.volume, language);
    }
    return formatMoney(current[term], language);
  };

  return (
    <section className="profile-panel asset-session" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h2 id={titleId}>{t('detail.session.title')}</h2>
        {session && (
          <p className="field-hint">
            {t('detail.session.date', { date: formatCalendarDay(session.date, language) })}
          </p>
        )}
      </div>
      {session ? (
        <dl className="session-grid">
          {SESSION_TERMS.map((term) => (
            <SessionItem key={term} term={term} value={value(term, session)} />
          ))}
        </dl>
      ) : (
        <p className="assets-empty">{t('detail.session.none')}</p>
      )}
    </section>
  );
}

function SessionItem({ term, value }: { term: SessionTerm; value: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const helpId = useId();
  const label = t(`detail.terms.${term}`);
  return (
    <div className="session-item">
      <dt>
        <span>{label}</span>
        <button
          type="button"
          className="term-help-button"
          aria-label={t('detail.helpLabel', { term: label })}
          aria-expanded={open}
          aria-controls={helpId}
          onClick={() => setOpen((current) => !current)}
        >
          <Question weight="bold" aria-hidden="true" />
        </button>
      </dt>
      <dd>
        <span className="session-value">{value}</span>
        <span id={helpId} className="term-help" hidden={!open}>
          {t(`detail.terms.${term}Help`)}
        </span>
      </dd>
    </div>
  );
}

/**
 * Histórico de cotações: período (abre em 1 ano), resumo, gráfico, saltos e o aviso fixo. Cada
 * período é pedido uma vez; quando chega um fechamento novo da B3, os períodos são pedidos de novo.
 */
function HistoryPanel({
  asset,
  onSessionExpired,
}: {
  asset: AssetDetail;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [period, setPeriod] = useState<PriceHistoryPeriod>(DEFAULT_PRICE_HISTORY_PERIOD);
  // SPEC-042: abre ajustado pelos desdobramentos e grupamentos.
  const [adjusted, setAdjusted] = useState(true);
  const [histories, setHistories] = useState<Record<string, PriceHistory>>({});
  const [failure, setFailure] = useState<{ key: string; error: ClientAuthError } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const loaded = asset.history.status === 'loaded';
  const key = `${period}|${adjusted ? 'a' : 'b3'}|${asset.lastSession?.date ?? ''}`;
  const shown = histories[key];

  useEffect(() => {
    if (!loaded || shown) return;
    let active = true;
    void window.api.assets.history(asset.id, period, adjusted).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      if (result.ok) setHistories((previous) => ({ ...previous, [key]: result.data }));
      else setFailure({ key, error: result.error });
    });
    return () => {
      active = false;
    };
  }, [asset.id, period, adjusted, key, loaded, shown, attempt, onSessionExpired]);

  let content: ReactNode;
  if (asset.history.status === 'pending') {
    content = <p className="assets-empty">{t('detail.history.pending')}</p>;
  } else if (asset.history.status === 'not_found') {
    content = <p className="assets-empty">{t('detail.history.notFound')}</p>;
  } else if (failure?.key === key && !shown) {
    content = (
      <div className="chart-placeholder">
        <p className="form-error" role="alert">
          {t('detail.history.failed')}
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setFailure(null);
            setAttempt((value) => value + 1);
          }}
        >
          {t('detail.retry')}
        </button>
      </div>
    );
  } else if (!shown) {
    content = (
      <p className="chart-placeholder" role="status">
        {t('detail.history.loading')}
      </p>
    );
  } else {
    content = (
      <HistoryContent
        ticker={asset.ticker}
        history={shown}
        periodLabel={t(`detail.history.periods.${period}`)}
      />
    );
  }

  return (
    <section className="profile-panel asset-history" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h2 id={titleId}>{t('detail.history.title')}</h2>
        {loaded && (
          <div className="period-buttons" role="group" aria-label={t('detail.history.periodLabel')}>
            {PRICE_HISTORY_PERIODS.map((option) => (
              <button
                key={option}
                type="button"
                className="period-button"
                aria-pressed={option === period}
                onClick={() => setPeriod(option)}
              >
                {t(`detail.history.periods.${option}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {loaded && (
        <div className="period-buttons" role="group" aria-label={t('detail.history.priceMode')}>
          <button
            type="button"
            className="period-button"
            aria-pressed={adjusted}
            onClick={() => setAdjusted(true)}
          >
            {t('detail.history.adjusted')}
          </button>
          <button
            type="button"
            className="period-button"
            aria-pressed={!adjusted}
            onClick={() => setAdjusted(false)}
          >
            {t('detail.history.asPublished')}
          </button>
        </div>
      )}
      {content}
      <p className="assets-note chart-notice">
        <Info weight="fill" aria-hidden="true" />
        <span>{adjusted ? t('detail.history.noticeAdjusted') : t('detail.history.notice')}</span>
      </p>
      {loaded && asset.history.to && (
        <p className="field-hint">
          {t('detail.history.source', { date: formatCalendarDay(asset.history.to, language) })}
        </p>
      )}
    </section>
  );
}

function HistoryContent({
  ticker,
  history,
  periodLabel,
}: {
  ticker: string;
  history: PriceHistory;
  periodLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { summary } = history;
  const day = (date: string) => formatCalendarDay(date, language);

  return (
    <>
      {summary && (
        <dl className="period-summary">
          <div>
            <dt>{t('detail.history.change')}</dt>
            <dd>
              {summary.change !== null ? (
                <span className={`quote-change is-${changeDirection(summary.change)}`}>
                  {formatChange(summary.change, language)}
                </span>
              ) : (
                <span className="summary-note">{t('detail.history.changeNotCalculated')}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('detail.history.min')}</dt>
            <dd>
              {formatMoney(summary.min.price, language)}{' '}
              <span className="summary-note">
                {t('detail.history.on', { date: day(summary.min.date) })}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t('detail.history.max')}</dt>
            <dd>
              {formatMoney(summary.max.price, language)}{' '}
              <span className="summary-note">
                {t('detail.history.on', { date: day(summary.max.date) })}
              </span>
            </dd>
          </div>
        </dl>
      )}
      {history.shorterThanPeriod && history.from && (
        <p className="field-hint">{t('detail.history.since', { date: day(history.from) })}</p>
      )}
      {history.points.length >= 2 ? (
        <PriceChart
          points={history.points}
          jumps={history.jumps}
          label={t('detail.history.chartLabel', { ticker, period: periodLabel })}
        />
      ) : (
        <p className="chart-placeholder">{t('detail.history.tooFew')}</p>
      )}
      {history.jumps.length > 0 && (
        <div className="chart-jumps">
          <h3>{t('detail.history.jumpsTitle')}</h3>
          <ul>
            {history.jumps.map((jump) => (
              <li key={jump.date}>
                <Warning weight="fill" aria-hidden="true" />
                {t('detail.history.jump', {
                  date: day(jump.date),
                  change: formatChange(jump.change, language),
                })}
              </li>
            ))}
          </ul>
          <p>{t('detail.history.jumpsExplain')}</p>
        </div>
      )}
      {history.events.length > 0 && (
        <div className="chart-events">
          <h3>{t('detail.history.eventsTitle')}</h3>
          <ul>
            {history.events.map((event) => (
              <li key={`${event.kind}-${event.date}`}>
                {t(`detail.history.event.${event.kind}`, {
                  date: day(event.date),
                  multiplier: new Intl.NumberFormat(language, { maximumFractionDigits: 6 }).format(
                    Number(event.multiplier),
                  ),
                })}
              </li>
            ))}
          </ul>
          <p className="field-hint">{t('detail.history.eventsSource')}</p>
        </div>
      )}
    </>
  );
}
