import {
  CALENDAR_TIME_ZONE,
  NEWS_SENTIMENTS,
  type AssetNewsDay,
  type AssetNewsItem,
  type AssetNewsPage,
  type AssetNewsQuery,
  type PricePoint,
  type PriceHistoryPeriod,
  type SentimentCounts,
  type SentimentModelName,
} from '@simulador/shared';
import { ArrowSquareOut, CaretDown, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay, formatChange } from '../format';
import { priceReaction, REACTION_SESSIONS, sessionRange } from '../news-chart';
import { SentimentTag } from './NewsSentiment';
import { changeDirection } from './QuoteText';

type ListQuery = Omit<AssetNewsQuery, 'offset'>;

type ListState =
  | { status: 'loading'; news: AssetNewsItem[] }
  | { status: 'ready'; news: AssetNewsItem[]; total: number }
  | { status: 'failed'; news: AssetNewsItem[]; error: ClientAuthError };

/**
 * Lista de notícias do ativo, 10 por vez com "Ver mais" (SPEC-029 §4.2): o grupo principal, o das
 * listas ou as de um pregão. A primeira página é avisada a quem usa a lista (`onFirstPage`).
 */
function NewsList({
  assetId,
  ticker,
  query,
  empty,
  onFirstPage,
  onSessionExpired,
}: {
  assetId: string;
  ticker: string;
  query: ListQuery;
  empty: string;
  onFirstPage?: (page: AssetNewsPage) => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ListState>({ status: 'loading', news: [] });
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const { group, after, until } = query;
  // O aviso da primeira página não refaz a leitura quando quem usa a lista muda a função.
  const firstPage = useRef(onFirstPage);
  useEffect(() => {
    firstPage.current = onFirstPage;
  });
  // "Ver mais" e "Tentar de novo" mantêm o que já está na tela enquanto carregam.
  const load = (next: () => void) => {
    setState((previous) => ({ status: 'loading', news: previous.news }));
    next();
  };

  useEffect(() => {
    let active = true;
    void window.api.assets
      .news(assetId, { group, offset, ...(after && until ? { after, until } : {}) })
      .then((result) => {
        if (!active) return;
        if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        if (!result.ok) {
          setState((previous) => ({ status: 'failed', news: previous.news, error: result.error }));
          return;
        }
        if (offset === 0) firstPage.current?.(result.data);
        setState((previous) => ({
          status: 'ready',
          news: [...(offset === 0 ? [] : previous.news), ...result.data.news],
          total: result.data.total,
        }));
      });
    return () => {
      active = false;
    };
  }, [assetId, group, after, until, offset, attempt, onSessionExpired]);

  const { news } = state;
  return (
    <>
      {news.length > 0 && (
        <ul className="asset-news-list">
          {news.map((item) => (
            <NewsItem key={item.id} item={item} ticker={ticker} />
          ))}
        </ul>
      )}
      {state.status === 'loading' && news.length === 0 && (
        <p className="loading" role="status">
          {t('detail.news.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <div className="asset-news-failed">
          <p className="form-error" role="alert">
            {t(`authErrors.${state.error}`)}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => load(() => setAttempt((v) => v + 1))}
          >
            {t('detail.retry')}
          </button>
        </div>
      )}
      {state.status === 'ready' && news.length === 0 && <p className="assets-empty">{empty}</p>}
      {/* Carregando a página seguinte, o botão fica no lugar, desativado: o clique duplo não cai
          no que estiver embaixo dele. */}
      {state.status === 'loading' && news.length > 0 && (
        <button type="button" className="secondary" disabled>
          {t('detail.news.loading')}
        </button>
      )}
      {state.status === 'ready' && news.length < state.total && (
        <button
          type="button"
          className="secondary"
          onClick={() => load(() => setOffset(news.length))}
        >
          {t('detail.news.more', { count: state.total - news.length })}
        </button>
      )}
    </>
  );
}

/**
 * Uma notícia, num cartão: a relação com o ativo e o tom em etiquetas no topo, o título (o link
 * para a matéria), o resumo em duas linhas e, no rodapé, a fonte, quando saiu e "Ler no …".
 */
function NewsItem({ item, ticker }: { item: AssetNewsItem; ticker: string }) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CALENDAR_TIME_ZONE,
  }).format(new Date(item.publishedAt));
  return (
    <li className="asset-news-item">
      <div className="asset-news-tags">
        <span className={`news-link is-${item.relevance}`}>
          {t(`detail.news.relevance.${item.relevance}`, { ticker })}
        </span>
        {/* SPEC-044: só quando a versão do modelo passou na avaliação. */}
        {item.sentiment && <SentimentTag sentiment={item.sentiment} />}
      </div>
      <a className="asset-news-title" href={item.url} target="_blank" rel="noreferrer" lang="pt-BR">
        {item.title}
      </a>
      {item.summary && (
        <p className="asset-news-summary" lang="pt-BR">
          {item.summary}
        </p>
      )}
      <div className="asset-news-foot">
        <span className="asset-news-meta">
          {item.source} · <time dateTime={item.publishedAt}>{when}</time>
        </span>
        <a className="asset-news-read" href={item.url} target="_blank" rel="noreferrer">
          {item.source === 'Investidor10'
            ? t('detail.news.readParent')
            : t('detail.news.read', { source: item.source })}
          <span className="visually-hidden">: {item.title}</span>
          <ArrowSquareOut weight="bold" aria-hidden="true" />
        </a>
      </div>
      {/* SPEC-047: a mesma matéria em outras fontes, uma notícia só na lista. */}
      {item.alsoIn.length > 0 && (
        <p className="asset-news-also">
          {t('detail.news.alsoIn')}{' '}
          {item.alsoIn.map((copy, index) => (
            <span key={copy.url}>
              {index > 0 && ', '}
              <a href={copy.url} target="_blank" rel="noreferrer">
                {copy.source}
                <span className="visually-hidden">: {item.title}</span>
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

/** "Em português" uma vez na seção, com a interface em inglês (SPEC-035, OPEN-45). */
function PortugueseBadge() {
  const { t, i18n } = useTranslation();
  if (i18n.language.startsWith('pt')) return null;
  return <span className="asset-news-language">{t('detail.news.inPortuguese')}</span>;
}

/**
 * Seção Notícias da ficha (SPEC-029 §5.2): principal e citado, e as listas num grupo fechado.
 * Lida ao abrir a ficha; não se atualiza sozinha.
 */
export function AssetNewsSection({
  assetId,
  ticker,
  onSessionExpired,
}: {
  assetId: string;
  ticker: string;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const listsId = useId();
  const [listTotal, setListTotal] = useState(0);
  const [listsOpen, setListsOpen] = useState(false);
  const [model, setModel] = useState<SentimentModelName | null>(null);

  return (
    <section className="profile-panel asset-news" aria-labelledby={titleId}>
      <div className="asset-panel-head asset-news-head">
        <div>
          <h2 id={titleId}>{t('detail.news.title')}</h2>
          <p className="field-hint">{t('detail.news.intro', { ticker })}</p>
        </div>
        <PortugueseBadge />
      </div>
      <ul className="asset-news-legend" aria-label={t('detail.news.legendLabel')}>
        <li>
          <span className="news-link is-principal">
            {t('detail.news.relevance.principal', { ticker })}
          </span>
          {t('detail.news.legendPrincipal')}
        </li>
        <li>
          <span className="news-link is-citado">
            {t('detail.news.relevance.citado', { ticker })}
          </span>
          {t('detail.news.legendCitado')}
        </li>
      </ul>
      <NewsList
        assetId={assetId}
        ticker={ticker}
        query={{ group: 'main' }}
        empty={t('detail.news.empty', { ticker })}
        onFirstPage={(page) => {
          setListTotal(page.listTotal);
          setModel(page.model);
        }}
        onSessionExpired={onSessionExpired}
      />
      {listTotal > 0 && (
        <div className="asset-news-lists">
          <button
            type="button"
            className="secondary asset-news-lists-toggle"
            aria-expanded={listsOpen}
            aria-controls={listsId}
            onClick={() => setListsOpen((open) => !open)}
          >
            {t('detail.news.lists', { count: listTotal })}
            <CaretDown weight="bold" aria-hidden="true" />
          </button>
          <div id={listsId} hidden={!listsOpen}>
            {listsOpen && (
              <>
                <p className="field-hint">{t('detail.news.listsHint')}</p>
                <NewsList
                  assetId={assetId}
                  ticker={ticker}
                  query={{ group: 'list' }}
                  empty={t('detail.news.empty', { ticker })}
                  onSessionExpired={onSessionExpired}
                />
              </>
            )}
          </div>
        </div>
      )}
      {model && <SentimentNote model={model} />}
      <p className="field-hint">{t('detail.news.source')}</p>
    </section>
  );
}

/** Caráter educacional (DA15): o tom é automático, pode errar e não é recomendação. */
function SentimentNote({ model }: { model: SentimentModelName }) {
  const { t } = useTranslation();
  return (
    <p className="field-hint">
      {t('detail.news.sentimentNote', {
        model: t('sentiment.modelName', {
          name: t(`sentiment.models.${model.name}`, { defaultValue: model.name }),
          number: model.number,
        }),
      })}
    </p>
  );
}

/**
 * As notícias dos dias de referência do pregão por tom, e as ainda sem tom (pendentes); `null` sem
 * modelo visível.
 */
function sessionSentiment(
  days: readonly AssetNewsDay[],
  after: string,
  until: string,
): (SentimentCounts & { pending: number }) | null {
  const counts = { positive: 0, neutral: 0, negative: 0, pending: 0 };
  let found = false;
  for (const day of days) {
    if (day.day <= after || day.day > until || !day.sentiment) continue;
    found = true;
    counts.pending += day.count;
    for (const s of NEWS_SENTIMENTS) {
      counts[s] += day.sentiment[s];
      counts.pending -= day.sentiment[s];
    }
  }
  return found ? counts : null;
}

/**
 * Notícias por dia de referência no período do gráfico (os marcadores). Se a leitura falhar, o
 * gráfico fica sem marcadores; o resto da ficha não muda.
 */
export function useNewsDays(
  assetId: string,
  period: PriceHistoryPeriod,
  enabled: boolean,
  onSessionExpired: () => void,
): AssetNewsDay[] {
  const [days, setDays] = useState<Partial<Record<PriceHistoryPeriod, AssetNewsDay[]>>>({});
  const loaded = days[period];

  useEffect(() => {
    if (!enabled || loaded) return;
    let active = true;
    void window.api.assets.newsDays(assetId, period).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      if (result.ok) setDays((previous) => ({ ...previous, [period]: result.data.days }));
    });
    return () => {
      active = false;
    };
  }, [assetId, period, enabled, loaded, onSessionExpired]);

  return loaded ?? [];
}

/**
 * Painel do marcador (SPEC-029 §4.2): as notícias do pregão e o que o preço fez no pregão e 5
 * pregões depois, com a série do gráfico. O foco vai para o título ao abrir.
 */
export function NewsSessionPanel({
  assetId,
  ticker,
  points,
  index,
  days,
  onClose,
  onSessionExpired,
}: {
  assetId: string;
  ticker: string;
  points: readonly PricePoint[];
  index: number;
  /** SPEC-044: os dias com o tom das notícias, para as contagens do pregão. */
  days: readonly AssetNewsDay[];
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const range = sessionRange(points, index);
  const reaction = priceReaction(points, index);
  const tones = range ? sessionSentiment(days, range.after, range.until) : null;

  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  if (!range) return null;
  const value = (change: string | null, missing: string) =>
    change === null ? (
      <span className="summary-note">{missing}</span>
    ) : (
      <span className={`quote-change is-${changeDirection(change)}`}>
        {formatChange(change, language)}
      </span>
    );

  return (
    <section className="asset-news-session" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h3 id={titleId} ref={heading} tabIndex={-1}>
          {t('detail.news.sessionTitle', { date: formatCalendarDay(range.until, language) })}
        </h3>
        <button
          type="button"
          className="secondary asset-news-close"
          aria-label={t('detail.news.close')}
          onClick={onClose}
        >
          <X weight="bold" aria-hidden="true" />
          {t('detail.news.closeShort')}
        </button>
      </div>
      <dl className="period-summary">
        <div>
          <dt>{t('detail.news.onSession')}</dt>
          <dd>{value(reaction.session, t('detail.news.noPrevious'))}</dd>
        </div>
        <div>
          <dt>{t('detail.news.later', { count: REACTION_SESSIONS })}</dt>
          <dd>{value(reaction.later, t('detail.news.notYet', { count: REACTION_SESSIONS }))}</dd>
        </div>
      </dl>
      <p className="field-hint">{t('detail.news.reactionNote')}</p>
      {tones && (
        <p className="asset-news-tones">
          {t(tones.pending > 0 ? 'detail.news.tonesPending' : 'detail.news.tones', {
            positive: t('detail.news.tonePositive', { count: tones.positive }),
            neutral: t('detail.news.toneNeutral', { count: tones.neutral }),
            negative: t('detail.news.toneNegative', { count: tones.negative }),
            count: tones.pending,
          })}
        </p>
      )}
      <NewsList
        key={range.until}
        assetId={assetId}
        ticker={ticker}
        query={{ group: 'main', after: range.after, until: range.until }}
        empty={t('detail.news.sessionEmpty')}
        onSessionExpired={onSessionExpired}
      />
    </section>
  );
}
