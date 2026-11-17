import {
  CALENDAR_TIME_ZONE,
  type AssetNewsDay,
  type AssetNewsItem,
  type AssetNewsPage,
  type AssetNewsQuery,
  type PricePoint,
  type PriceHistoryPeriod,
} from '@simulador/shared';
import { X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay, formatChange } from '../format';
import { priceReaction, REACTION_SESSIONS, sessionRange } from '../news-chart';
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

/** Uma notícia: título com link, fonte, data, a relação com o ativo, resumo e "Ler no …". */
function NewsItem({ item, ticker }: { item: AssetNewsItem; ticker: string }) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: CALENDAR_TIME_ZONE,
  }).format(new Date(item.publishedAt));
  return (
    <li className="asset-news-item">
      <a className="asset-news-title" href={item.url} target="_blank" rel="noreferrer" lang="pt-BR">
        {item.title}
      </a>
      <p className="position-name">
        {item.source} · {when} ·{' '}
        <span className={`news-link is-${item.relevance}`}>
          {t(`detail.news.relevance.${item.relevance}`, { ticker })}
        </span>
      </p>
      {item.summary && (
        <p className="asset-news-summary" lang="pt-BR">
          {item.summary}
        </p>
      )}
      <a className="asset-news-read" href={item.url} target="_blank" rel="noreferrer">
        {item.source === 'Investidor10'
          ? t('detail.news.readParent')
          : t('detail.news.read', { source: item.source })}
        <span className="visually-hidden">: {item.title}</span>
      </a>
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

  return (
    <section className="profile-panel asset-news" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h2 id={titleId}>{t('detail.news.title')}</h2>
        <PortugueseBadge />
      </div>
      <NewsList
        assetId={assetId}
        ticker={ticker}
        query={{ group: 'main' }}
        empty={t('detail.news.empty', { ticker })}
        onFirstPage={(page) => setListTotal(page.listTotal)}
        onSessionExpired={onSessionExpired}
      />
      {listTotal > 0 && (
        <div className="asset-news-lists">
          <button
            type="button"
            className="link"
            aria-expanded={listsOpen}
            aria-controls={listsId}
            onClick={() => setListsOpen((open) => !open)}
          >
            {t('detail.news.lists', { count: listTotal })}
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
      <p className="field-hint">{t('detail.news.source')}</p>
    </section>
  );
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
  onClose,
  onSessionExpired,
}: {
  assetId: string;
  ticker: string;
  points: readonly PricePoint[];
  index: number;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const range = sessionRange(points, index);
  const reaction = priceReaction(points, index);

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
