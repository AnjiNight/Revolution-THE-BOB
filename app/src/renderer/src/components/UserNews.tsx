import {
  ASSET_CLASSES,
  CALENDAR_TIME_ZONE,
  NEWS_FEED_PERIODS,
  NEWS_SENTIMENTS,
  SECTORS_BY_CLASS,
  SOURCE_PRIORITIES,
  newsFeedSectorParam,
  validateNewOwnFeed,
  type FieldErrors,
  type MyNewsSource,
  type MyNewsSources,
  type NewsFeedItem,
  type NewsFeedPage,
  type NewsFeedPeriod,
  type NewsFeedQuery,
  type NewsSentiment,
  type SourcePriority,
} from '@simulador/shared';
import { ArrowLeft, Plus, Sliders, Warning, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { useOffline } from '../connection';
import '../asset-detail.css';
import '../user-news.css';
import { SentimentTag } from './NewsSentiment';
import { SelectField } from './SelectField';
import { TextField } from './TextField';

interface AssetChoice {
  id: string;
  ticker: string;
}

interface Filters {
  period: NewsFeedPeriod;
  asset: AssetChoice | null;
  /** `stock:financeiro`, ou vazio. */
  sector: string;
  sentiment: NewsSentiment | '';
  source: string;
}

const NO_FILTERS: Filters = { period: '30d', asset: null, sector: '', sentiment: '', source: '' };

type FeedState =
  | { status: 'loading'; news: NewsFeedItem[] }
  | { status: 'ready'; page: NewsFeedPage; news: NewsFeedItem[] }
  | { status: 'failed'; news: NewsFeedItem[]; error: ClientAuthError };

function query(filters: Filters, offset: number): Partial<NewsFeedQuery> {
  const [assetClass, code] = filters.sector.split(':');
  return {
    period: filters.period,
    offset,
    ...(filters.asset ? { asset: filters.asset.id } : {}),
    ...(assetClass && code
      ? { sector: { class: assetClass, code } as NonNullable<NewsFeedQuery['sector']> }
      : {}),
    ...(filters.sentiment ? { sentiment: filters.sentiment } : {}),
    ...(filters.source ? { source: filters.source } : {}),
  };
}

interface UserNewsProps {
  onOpenSources: () => void;
  onOpenAsset: (assetId: string, opener: HTMLElement) => void;
  onSessionExpired: () => void;
}

/**
 * SPEC-030 §5.3: a tela Notícias do usuário. As notícias das fontes dele, por dia e, no mesmo
 * dia, pela prioridade da fonte; os filtros; e o tom das notícias ponderado pelas prioridades,
 * sempre marcado como personalizado (DA19) e educacional (RB18, RB19).
 */
export function UserNews({ onOpenSources, onOpenAsset, onSessionExpired }: UserNewsProps) {
  const { t } = useTranslation();
  const offline = useOffline();
  const titleId = useId();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [state, setState] = useState<FeedState>({ status: 'loading', news: [] });
  const [offset, setOffset] = useState(0);
  const [sources, setSources] = useState<MyNewsSource[]>([]);

  useEffect(() => {
    if (offline) return;
    let active = true;
    void window.api.news.mySources().then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      if (result.ok) setSources(result.data.sources.filter((source) => source.active));
    });
    return () => {
      active = false;
    };
  }, [offline, onSessionExpired]);

  useEffect(() => {
    if (offline) return;
    let active = true;
    // O "carregando" é marcado por quem muda o filtro ou pede mais (`change` e `more`).
    void window.api.news.feed(query(filters, offset)).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState((current) =>
        result.ok
          ? {
              status: 'ready',
              page: result.data,
              news: offset === 0 ? result.data.news : [...current.news, ...result.data.news],
            }
          : { status: 'failed', news: current.news, error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [filters, offset, offline, onSessionExpired]);

  const change = (next: Partial<Filters>) => {
    setState({ status: 'loading', news: [] });
    setOffset(0);
    setFilters((current) => ({ ...current, ...next }));
  };
  const more = () => {
    setState((current) => ({ status: 'loading', news: current.news }));
    setOffset(state.news.length);
  };
  const page = state.status === 'ready' ? state.page : null;
  const sentimentVisible = page ? page.model !== null : false;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="page user-news-page">
      <header className="page-hero">
        <h1 id={titleId}>{t('userNews.title')}</h1>
        <p>{t('userNews.subtitle')}</p>
      </header>

      {offline ? (
        <p className="assets-note" role="status">
          <Warning weight="fill" aria-hidden="true" />
          <span>{t('userNews.offline')}</span>
        </p>
      ) : (
        <section className="profile-panel" aria-labelledby={titleId}>
          <div className="user-news-toolbar">
            <button type="button" className="pill pill-ghost pill-small" onClick={onOpenSources}>
              <span className="pill-icon" aria-hidden="true">
                <Sliders weight="bold" />
              </span>
              {t('userNews.mySources')}
            </button>
          </div>

          <form
            className="user-news-filters"
            aria-label={t('userNews.filters')}
            onSubmit={(event) => event.preventDefault()}
          >
            <AssetFilter
              value={filters.asset}
              onChange={(asset) => change({ asset })}
              onSessionExpired={onSessionExpired}
            />
            <SelectField
              label={t('userNews.sector')}
              value={filters.sector}
              onChange={(sector) => change({ sector })}
            >
              <option value="">{t('userNews.allSectors')}</option>
              {ASSET_CLASSES.map((assetClass) => (
                <optgroup key={assetClass} label={t(`userNews.classes.${assetClass}`)}>
                  {SECTORS_BY_CLASS[assetClass].map((code) => (
                    <option key={code} value={newsFeedSectorParam({ class: assetClass, code })}>
                      {t(`assets.sectors.${assetClass}.${code}`)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>
            <SelectField
              label={t('userNews.period')}
              value={filters.period}
              onChange={(period) => change({ period: period as NewsFeedPeriod })}
            >
              {NEWS_FEED_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {t(`userNews.periods.${period}`)}
                </option>
              ))}
            </SelectField>
            {sentimentVisible && (
              <SelectField
                label={t('userNews.sentiment')}
                value={filters.sentiment}
                onChange={(sentiment) => change({ sentiment: sentiment as NewsSentiment | '' })}
              >
                <option value="">{t('userNews.allSentiments')}</option>
                {NEWS_SENTIMENTS.map((sentiment) => (
                  <option key={sentiment} value={sentiment}>
                    {t(`userNews.sentiments.${sentiment}`)}
                  </option>
                ))}
              </SelectField>
            )}
            <SelectField
              label={t('userNews.source')}
              value={filters.source}
              onChange={(source) => change({ source })}
            >
              <option value="">{t('userNews.allSources')}</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </SelectField>
            {filtered && (
              <button
                type="button"
                className="pill pill-ghost pill-small user-news-clear"
                onClick={() => change(NO_FILTERS)}
              >
                {t('userNews.clearFilters')}
              </button>
            )}
          </form>

          {page && <ToneSummary page={page} />}

          {state.status === 'failed' && (
            <p className="form-error" role="alert">
              {t(`authErrors.${state.error}`)}
            </p>
          )}
          <p className="visually-hidden" role="status">
            {state.status === 'loading'
              ? t('userNews.loading')
              : page
                ? t('userNews.total', { count: page.total })
                : ''}
          </p>
          {page && (
            <p className="field-hint" aria-hidden="true">
              {t('userNews.total', { count: page.total })}
            </p>
          )}
          {state.status === 'loading' && state.news.length === 0 && (
            <p className="loading">{t('userNews.loading')}</p>
          )}
          {page && state.news.length === 0 && <p>{t('userNews.empty')}</p>}

          {state.news.length > 0 && (
            <ul className="asset-news-list" lang="pt-BR">
              {state.news.map((item) => (
                <FeedItem key={item.id} item={item} onOpenAsset={onOpenAsset} />
              ))}
            </ul>
          )}
          {page && state.news.length < page.total && (
            <button
              type="button"
              className="pill pill-ghost"
              disabled={state.status !== 'ready'}
              onClick={more}
            >
              {t('userNews.more', { count: page.total - state.news.length })}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** O tom ponderado do filtro, com as duas frases fixas (§4.2), ou o motivo de não aparecer. */
function ToneSummary({ page }: { page: NewsFeedPage }) {
  const { t, i18n } = useTranslation();
  if (page.toneHidden === 'no_model') return null;
  const percent = (value: number) =>
    new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(
      value,
    );
  return (
    <section className="user-news-tone" aria-label={t('userNews.toneTitle')}>
      <h2>{t('userNews.toneTitle')}</h2>
      {page.tone ? (
        <>
          <p className="user-news-tone-values">
            {NEWS_SENTIMENTS.map((sentiment) => (
              <span key={sentiment} className={`sentiment-tag is-${sentiment}`}>
                {t(`userNews.toneValue.${sentiment}`, {
                  value: percent(page.tone?.shares[sentiment] ?? 0),
                })}
              </span>
            ))}
          </p>
          <p className="field-hint">{t('userNews.toneCount', { count: page.tone.classified })}</p>
        </>
      ) : (
        <p className="field-hint">{t('userNews.toneFew')}</p>
      )}
      <p className="field-hint">{t('userNews.tonePersonal')}</p>
      <p className="field-hint">{t('userNews.toneEducational')}</p>
    </section>
  );
}

/** Uma notícia: título com link, fonte (e "Sua fonte"), data, tom, resumo, ativos e "Ler em". */
function FeedItem({
  item,
  onOpenAsset,
}: {
  item: NewsFeedItem;
  onOpenAsset: (assetId: string, opener: HTMLElement) => void;
}) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: CALENDAR_TIME_ZONE,
  }).format(new Date(item.publishedAt));
  return (
    <li className="asset-news-item">
      <a className="asset-news-title" href={item.url} target="_blank" rel="noreferrer">
        {item.title}
      </a>
      <p className="position-name" lang={i18n.language}>
        {item.source}
        {item.ownSource && (
          <>
            {' '}
            <span className="user-news-own">{t('userNews.ownSource')}</span>
          </>
        )}{' '}
        · {when}
        {item.sentiment && (
          <>
            {' '}
            <SentimentTag sentiment={item.sentiment} />
          </>
        )}
      </p>
      {item.summary && <p className="asset-news-summary">{item.summary}</p>}
      {item.assets.length > 0 && (
        <p className="user-news-assets" lang={i18n.language}>
          <span className="visually-hidden">{t('userNews.assets')}</span>
          {item.assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="pill pill-ghost user-news-ticker"
              aria-label={t('userNews.openAsset', { ticker: asset.ticker })}
              onClick={(event) => onOpenAsset(asset.id, event.currentTarget)}
            >
              {asset.ticker}
            </button>
          ))}
        </p>
      )}
      <a
        className="asset-news-read"
        href={item.url}
        target="_blank"
        rel="noreferrer"
        lang={i18n.language}
      >
        {t('userNews.read', { source: item.source })}
        <span className="visually-hidden">: {item.title}</span>
      </a>
    </li>
  );
}

/** O filtro por ativo: busca no catálogo por ticker ou nome; o escolhido vira uma etiqueta. */
function AssetFilter({
  value,
  onChange,
  onSessionExpired,
}: {
  value: AssetChoice | null;
  onChange: (asset: AssetChoice | null) => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [found, setFound] = useState<Array<AssetChoice & { name: string }>>([]);

  useEffect(() => {
    const term = text.trim();
    // Com menos de 2 letras, a lista nem aparece (`shown`).
    if (term.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void window.api.assets.search({ q: term }).then((result) => {
        if (!active) return;
        if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        setFound(
          result.ok
            ? result.data.assets
                .slice(0, 6)
                .map((asset) => ({ id: asset.id, ticker: asset.ticker, name: asset.name }))
            : [],
        );
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [text, onSessionExpired]);

  const shown = text.trim().length >= 2 ? found : [];

  if (value) {
    return (
      <div className="field">
        <span className="user-news-label">{t('userNews.asset')}</span>
        <span className="user-news-chip">
          {value.ticker}
          <button
            type="button"
            className="user-news-chip-remove"
            aria-label={t('userNews.removeAsset', { ticker: value.ticker })}
            onClick={() => onChange(null)}
          >
            <X weight="bold" aria-hidden="true" />
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="field user-news-asset">
      <label htmlFor={id}>{t('userNews.asset')}</label>
      <input
        id={id}
        type="search"
        value={text}
        autoComplete="off"
        placeholder={t('userNews.assetPlaceholder')}
        onChange={(event) => setText(event.target.value)}
      />
      {shown.length > 0 && (
        <ul className="user-news-asset-results" aria-label={t('userNews.assetResults')}>
          {shown.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => {
                  setText('');
                  onChange({ id: asset.id, ticker: asset.ticker });
                }}
              >
                <strong>{asset.ticker}</strong> <span>{asset.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SourcesState =
  | { status: 'loading' }
  | { status: 'ready'; data: MyNewsSources }
  | { status: 'failed'; error: ClientAuthError };

/**
 * SPEC-030 §5.3: Minhas fontes. A fonte principal do app (sem controles, RB29), as fontes do app
 * (ligar e a prioridade) e os feeds próprios (renomear, remover, tentar de novo e adicionar).
 */
export function MySources({
  onBack,
  onSessionExpired,
}: {
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const offline = useOffline();
  const titleId = useId();
  const [state, setState] = useState<SourcesState>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (offline) return;
    let active = true;
    void window.api.news.mySources().then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [offline, onSessionExpired, version]);

  /** Uma mudança; o aviso diz o que mudou, para o leitor de tela também. */
  const run = async (
    id: string,
    action: () => Promise<{ ok: true } | { ok: false; error: ClientAuthError }>,
    done: string,
  ) => {
    setBusy(id);
    setNotice(null);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setError(t(`authErrors.${result.error}`));
    }
    setNotice(done);
    setVersion((v) => v + 1);
  };

  const data = state.status === 'ready' ? state.data : null;
  const parent = data?.sources.filter((source) => source.kind === 'parent') ?? [];
  const curated = data?.sources.filter((source) => source.kind === 'curated') ?? [];
  const own = data?.sources.filter((source) => source.kind === 'own') ?? [];

  return (
    <div className="page user-news-page">
      <button type="button" className="link asset-detail-back" onClick={onBack}>
        <ArrowLeft weight="bold" aria-hidden="true" />
        {t('userNews.backToNews')}
      </button>
      <header className="page-hero">
        <h1 id={titleId}>{t('userNews.sourcesTitle')}</h1>
        <p>{t('userNews.sourcesSubtitle')}</p>
      </header>

      {offline && (
        <p className="assets-note" role="status">
          <Warning weight="fill" aria-hidden="true" />
          <span>{t('userNews.offline')}</span>
        </p>
      )}
      {state.status === 'loading' && !offline && (
        <p className="loading" role="status">
          {t('userNews.sourcesLoading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}

      {data && !offline && (
        <section className="profile-panel" aria-labelledby={titleId}>
          <p className="visually-hidden" role="status">
            {notice ?? ''}
          </p>
          {notice && (
            <p className="form-success" aria-hidden="true">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <h2>{t('userNews.parentGroup')}</h2>
          <ul className="user-sources">
            {parent.map((source) => (
              <li key={source.id} className="user-source">
                <div className="user-source-name">
                  <span className="cash-type">{source.name}</span>
                  <span className="position-name">{t('userNews.parentNote')}</span>
                </div>
              </li>
            ))}
          </ul>

          {curated.length > 0 && (
            <>
              <h2>{t('userNews.curatedGroup')}</h2>
              <ul className="user-sources">
                {curated.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    busy={busy !== null}
                    onToggle={() =>
                      void run(
                        source.id,
                        () => window.api.news.updateMySource(source.id, { active: !source.active }),
                        t(source.active ? 'userNews.turnedOff' : 'userNews.turnedOn', {
                          name: source.name,
                        }),
                      )
                    }
                    onPriority={(priority) =>
                      void run(
                        source.id,
                        () => window.api.news.updateMySource(source.id, { priority }),
                        t('userNews.prioritySaved', {
                          name: source.name,
                          priority: t(`userNews.priorities.${priority}`),
                        }),
                      )
                    }
                  />
                ))}
              </ul>
            </>
          )}

          <h2>{t('userNews.ownGroup', { count: data.ownCount, limit: data.ownLimit })}</h2>
          {own.length === 0 && <p className="field-hint">{t('userNews.noOwn')}</p>}
          <ul className="user-sources">
            {own.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                busy={busy !== null}
                onToggle={() =>
                  void run(
                    source.id,
                    () => window.api.news.updateMySource(source.id, { active: !source.active }),
                    t(source.active ? 'userNews.turnedOff' : 'userNews.turnedOn', {
                      name: source.name,
                    }),
                  )
                }
                onPriority={(priority) =>
                  void run(
                    source.id,
                    () => window.api.news.updateMySource(source.id, { priority }),
                    t('userNews.prioritySaved', {
                      name: source.name,
                      priority: t(`userNews.priorities.${priority}`),
                    }),
                  )
                }
                onRename={(name) =>
                  run(
                    source.id,
                    () => window.api.news.updateMySource(source.id, { name }),
                    t('userNews.renamed', { name }),
                  )
                }
                onRemove={() =>
                  void run(
                    source.id,
                    () => window.api.news.removeFeed(source.id),
                    t('userNews.removed', { name: source.name }),
                  )
                }
                onRetry={() =>
                  void run(
                    source.id,
                    () => window.api.news.retryFeed(source.id),
                    t('userNews.retried', { name: source.name }),
                  )
                }
              />
            ))}
          </ul>

          {data.ownCount < data.ownLimit ? (
            <AddFeedForm
              onAdded={(name, items) => {
                setError(null);
                setNotice(t('userNews.added', { name, count: items }));
                setVersion((v) => v + 1);
              }}
              onTurnOn={(sourceId) =>
                void run(
                  sourceId,
                  () => window.api.news.updateMySource(sourceId, { active: true }),
                  t('userNews.turnedOnInApp'),
                )
              }
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <p className="field-hint">{t('userNews.limitReached', { limit: data.ownLimit })}</p>
          )}
        </section>
      )}
    </div>
  );
}

/** Uma fonte: nome, situação, Ligada/Desligada, prioridade e, no feed próprio, o resto. */
function SourceRow({
  source,
  busy,
  onToggle,
  onPriority,
  onRename,
  onRemove,
  onRetry,
}: {
  source: MyNewsSource;
  busy: boolean;
  onToggle: () => void;
  onPriority: (priority: SourcePriority) => void;
  onRename?: (name: string) => Promise<void>;
  onRemove?: () => void;
  onRetry?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const priorityId = useId();
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(source.name);
  const host = (() => {
    try {
      return new URL(source.url).hostname;
    } catch {
      return source.url;
    }
  })();
  const lastRun = source.lastRunAt
    ? new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: CALENDAR_TIME_ZONE,
      }).format(new Date(source.lastRunAt))
    : null;

  return (
    <li className={`user-source${source.active ? '' : ' is-off'}`}>
      <div className="user-source-name">
        <span className="cash-type">{source.name}</span>
        <span className="position-name">{host}</span>
        {source.status && (
          <span
            className={`position-event${source.status === 'failing' || source.status === 'stopped' ? ' is-warning' : ''}`}
          >
            {(source.status === 'failing' || source.status === 'stopped') && (
              <>
                <Warning weight="fill" aria-hidden="true" />{' '}
              </>
            )}
            {t(`userNews.status.${source.status}`, {
              date: lastRun ?? '',
              count: source.news ?? 0,
            })}
          </span>
        )}
      </div>

      <div className="user-source-controls">
        <button
          type="button"
          className="pill pill-ghost pill-small"
          aria-pressed={source.active}
          disabled={busy}
          aria-label={t(source.active ? 'userNews.turnOffLabel' : 'userNews.turnOnLabel', {
            name: source.name,
          })}
          onClick={onToggle}
        >
          {t(source.active ? 'userNews.on' : 'userNews.off')}
        </button>
        <div className="user-source-priority">
          <label htmlFor={priorityId}>{t('userNews.priority')}</label>
          <select
            id={priorityId}
            value={source.priority ?? 'medium'}
            disabled={busy}
            aria-label={t('userNews.priorityLabel', { name: source.name })}
            onChange={(event) => onPriority(event.target.value as SourcePriority)}
          >
            {SOURCE_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {t(`userNews.priorities.${priority}`)}
              </option>
            ))}
          </select>
        </div>
        {source.status === 'stopped' && onRetry && (
          <button
            type="button"
            className="pill pill-primary pill-small"
            disabled={busy}
            onClick={onRetry}
          >
            {t('userNews.retry')}
          </button>
        )}
        {onRename && !renaming && (
          <button
            type="button"
            className="pill pill-ghost pill-small"
            disabled={busy}
            aria-label={t('userNews.renameLabel', { name: source.name })}
            onClick={() => {
              setName(source.name);
              setRenaming(true);
            }}
          >
            {t('userNews.rename')}
          </button>
        )}
        {onRemove && !confirming && (
          <button
            type="button"
            className="pill pill-ghost pill-small"
            disabled={busy}
            aria-label={t('userNews.removeLabel', { name: source.name })}
            onClick={() => setConfirming(true)}
          >
            {t('userNews.remove')}
          </button>
        )}
      </div>

      {renaming && onRename && (
        <form
          className="user-source-inline"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            void onRename(trimmed).then(() => setRenaming(false));
          }}
        >
          <TextField
            label={t('userNews.newName')}
            type="text"
            value={name}
            onChange={setName}
            autoComplete="off"
          />
          <div className="form-actions">
            <button type="submit" className="pill pill-primary pill-small" disabled={busy}>
              {t('userNews.save')}
            </button>
            <button
              type="button"
              className="pill pill-ghost pill-small"
              onClick={() => setRenaming(false)}
            >
              {t('userNews.cancel')}
            </button>
          </div>
        </form>
      )}
      {confirming && onRemove && (
        <div className="user-source-inline" role="group" aria-label={t('userNews.removeTitle')}>
          <p>{t('userNews.removeConfirm', { name: source.name })}</p>
          <div className="form-actions">
            <button
              type="button"
              className="pill pill-danger pill-small"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onRemove();
              }}
            >
              {t('userNews.removeYes')}
            </button>
            <button
              type="button"
              className="pill pill-ghost pill-small"
              onClick={() => setConfirming(false)}
            >
              {t('userNews.cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Adicionar feed: o servidor lê o feed na hora; recusado, o motivo aparece no campo. */
function AddFeedForm({
  onAdded,
  onTurnOn,
  onSessionExpired,
}: {
  onAdded: (name: string, items: number) => void;
  onTurnOn: (sourceId: string) => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [inApp, setInApp] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const urlField = useRef<HTMLDivElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInApp(null);
    const checked = validateNewOwnFeed({ url, name });
    if (!checked.success) {
      setFields(checked.fields);
      return;
    }
    setFields({});
    setSending(true);
    const result = await window.api.news.addFeed(checked.data);
    setSending(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      if (result.error === 'already_in_app' && result.details?.sourceId) {
        return setInApp(result.details.sourceId);
      }
      if (result.fields) {
        setFields(result.fields);
        requestAnimationFrame(() => urlField.current?.querySelector('input')?.focus());
        return;
      }
      return setError(t(`authErrors.${result.error}`));
    }
    setUrl('');
    setName('');
    onAdded(result.data.source.name, result.data.items);
  };

  return (
    <form className="user-source-add" onSubmit={(event) => void submit(event)} noValidate>
      <h2>{t('userNews.addTitle')}</h2>
      <p className="field-hint">{t('userNews.addHint')}</p>
      <div ref={urlField}>
        <TextField
          label={t('userNews.feedUrl')}
          type="text"
          value={url}
          onChange={setUrl}
          autoComplete="url"
          spellCheck={false}
          error={fields.url}
        />
      </div>
      <TextField
        label={t('userNews.feedName')}
        type="text"
        value={name}
        onChange={setName}
        autoComplete="off"
        hint={t('userNews.feedNameHint')}
        error={fields.name}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {inApp && (
        <div className="assets-note" role="alert">
          <span>{t('userNews.alreadyInApp')}</span>
          <button
            type="button"
            className="pill pill-ghost pill-small"
            onClick={() => {
              setInApp(null);
              onTurnOn(inApp);
            }}
          >
            {t('userNews.turnOn')}
          </button>
        </div>
      )}
      <button type="submit" className="pill pill-primary" disabled={sending}>
        {sending ? t('userNews.adding') : t('userNews.add')}
        <span className="pill-icon" aria-hidden="true">
          <Plus weight="bold" />
        </span>
      </button>
    </form>
  );
}
