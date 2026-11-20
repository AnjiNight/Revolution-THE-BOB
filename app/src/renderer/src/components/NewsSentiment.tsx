import {
  CALENDAR_TIME_ZONE,
  NEWS_SENTIMENTS,
  SENTIMENT_MIN_F1,
  SENTIMENT_MIN_TEST,
  type NewsSentiment,
  type NewsToLabel,
  type SentimentSummary,
} from '@simulador/shared';
import { CheckCircle, Info, Minus, TrendDown, TrendUp } from '@phosphor-icons/react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import '../sentiment.css';

/** Tamanho da amostra que a equipe busca rotular (§4.1, decisão 3). */
const LABEL_GOAL = 150;

const KEYS: Record<string, NewsSentiment> = { '1': 'positive', '2': 'neutral', '3': 'negative' };

/** O tom com ícone e texto, nunca só pela cor (RNF04). Também usado na ficha do ativo. */
export function SentimentTag({ sentiment }: { sentiment: NewsSentiment }) {
  const { t } = useTranslation();
  const Icon = sentiment === 'positive' ? TrendUp : sentiment === 'negative' ? TrendDown : Minus;
  return (
    <span className={`sentiment-tag is-${sentiment}`}>
      <Icon weight="bold" aria-hidden="true" />
      {t('sentiment.tag', { value: t(`sentiment.values.${sentiment}`) })}
    </span>
  );
}

type SummaryState =
  | { status: 'loading' }
  | { status: 'ready'; data: SentimentSummary }
  | { status: 'failed'; error: ClientAuthError };

/**
 * SPEC-044 §5.2: na tela Notícias do colaborador, a versão do modelo, a avaliação contra a amostra
 * rotulada, se o usuário vê o sentimento, o painel de rotular e os últimos rotulados.
 */
export function SentimentPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [state, setState] = useState<SummaryState>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const [evaluating, setEvaluating] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void window.api.news.sentiment().then((result) => {
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
  }, [onSessionExpired, version]);

  const evaluate = async () => {
    setEvaluating(true);
    setNotice(null);
    const result = await window.api.news.evaluate();
    setEvaluating(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setNotice({ kind: 'error', text: t(`authErrors.${result.error}`) });
    }
    setNotice({ kind: 'ok', text: t('sentiment.evaluated') });
    reload();
  };

  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const score = (value: number) =>
    new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      value,
    );
  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: CALENDAR_TIME_ZONE,
    }).format(new Date(iso));

  const data = state.status === 'ready' ? state.data : null;
  const evaluation = data?.current?.evaluation ?? null;

  return (
    <section className="profile-panel sentiment-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('sentiment.title')}</h2>
      <p className="field-hint">{t('sentiment.definition')}</p>
      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('sentiment.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {data && (
        <>
          <dl className="sentiment-stats">
            <div>
              <dt>{t('sentiment.model')}</dt>
              <dd>
                {data.current
                  ? t('sentiment.modelName', {
                      name: t(`sentiment.models.${data.current.name}`, {
                        defaultValue: data.current.name,
                      }),
                      number: data.current.number,
                    })
                  : t('sentiment.noModel')}
              </dd>
            </div>
            <div>
              <dt>{t('sentiment.classified')}</dt>
              <dd>
                {t('sentiment.classifiedValue', {
                  classified: number(data.classified),
                  total: number(data.total),
                })}
              </dd>
            </div>
            <div>
              <dt>{t('sentiment.sample')}</dt>
              <dd>
                {t('sentiment.sampleValue', {
                  count: data.labels.total,
                  total: number(data.labels.total),
                  tuning: number(data.labels.tuning),
                  test: number(data.labels.test),
                  goal: number(LABEL_GOAL),
                })}
              </dd>
            </div>
            <div>
              <dt>{t('sentiment.evaluation')}</dt>
              <dd>
                {evaluation
                  ? t('sentiment.evaluationValue', {
                      f1: score(evaluation.macroF1),
                      accuracy: score(evaluation.accuracy),
                      count: evaluation.testSize,
                      date: dateTime(evaluation.evaluatedAt),
                    })
                  : data.current
                    ? t('sentiment.notEvaluated')
                    : '—'}
              </dd>
            </div>
          </dl>

          <p className={data.visible ? 'form-success' : 'assets-note'}>
            {data.visible ? (
              <CheckCircle weight="fill" aria-hidden="true" />
            ) : (
              <Info weight="fill" aria-hidden="true" />
            )}
            <span>
              {data.visible
                ? t('sentiment.visible')
                : t(`sentiment.hidden.${data.hiddenReason ?? 'no_model'}`, {
                    count: evaluation?.testSize ?? 0,
                    min: SENTIMENT_MIN_TEST,
                    f1: evaluation ? score(evaluation.macroF1) : '',
                    minF1: score(SENTIMENT_MIN_F1),
                  })}
            </span>
          </p>

          {evaluation && (
            <div className="positions-scroll">
              <table className="sentiment-matrix">
                <caption>{t('sentiment.matrix.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('sentiment.matrix.corner')}</th>
                    {NEWS_SENTIMENTS.map((s) => (
                      <th key={s} scope="col">
                        {t('sentiment.matrix.predicted', { value: t(`sentiment.values.${s}`) })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NEWS_SENTIMENTS.map((label, row) => (
                    <tr key={label}>
                      <th scope="row">
                        {t('sentiment.matrix.labeled', { value: t(`sentiment.values.${label}`) })}
                      </th>
                      {NEWS_SENTIMENTS.map((s, column) => (
                        <td key={s} className={row === column ? 'is-hit' : undefined}>
                          {number(evaluation.matrix[row]?.[column] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="sentiment-actions">
            <button
              type="button"
              className="pill pill-ghost"
              disabled={evaluating || !data.current}
              onClick={() => void evaluate()}
            >
              {t(evaluating ? 'sentiment.evaluating' : 'sentiment.evaluate')}
            </button>
            {notice && (
              <p className={notice.kind === 'ok' ? 'form-success' : 'form-error'} role="status">
                {notice.text}
              </p>
            )}
          </div>

          <LabelingPanel onLabeled={reload} onSessionExpired={onSessionExpired} />
          <RecentLabels
            labels={data.recentLabels}
            onChanged={reload}
            onSessionExpired={onSessionExpired}
          />
        </>
      )}
    </section>
  );
}

type NextState =
  | { status: 'loading' }
  | { status: 'ready'; news: NewsToLabel | null }
  | { status: 'failed'; error: ClientAuthError };

/**
 * Uma notícia por vez, sem o que o modelo disse (para não influenciar). Teclas 1, 2, 3 e 0 com o
 * foco no painel.
 */
function LabelingPanel({
  onLabeled,
  onSessionExpired,
}: {
  onLabeled: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const [state, setState] = useState<NextState>({ status: 'loading' });
  const [skip, setSkip] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLabel, setLastLabel] = useState<NewsSentiment | null>(null);
  const titleRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Depois de rotular ou pular, o foco vai para a próxima notícia, para as teclas continuarem
  // valendo; sem próxima, para o painel.
  const refocus = useRef(false);

  useEffect(() => {
    let active = true;
    void window.api.news.nextToLabel(skip).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', news: result.data.news }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [onSessionExpired, skip]);

  const current = state.status === 'ready' ? state.news : null;
  const ready = state.status === 'ready';

  useEffect(() => {
    if (!ready || !refocus.current) return;
    refocus.current = false;
    (titleRef.current ?? panelRef.current)?.focus();
  }, [ready, current?.id]);

  const next = (extraSkip: string | null) => {
    refocus.current = true;
    setState({ status: 'loading' });
    setSkip((list) => (extraSkip ? [...list, extraSkip].slice(-50) : [...list]));
  };

  const label = async (sentiment: NewsSentiment) => {
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    const result = await window.api.news.label(current.id, sentiment);
    setSaving(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setError(t(`authErrors.${result.error}`));
    }
    setLastLabel(sentiment);
    onLabeled();
    next(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const sentiment = KEYS[event.key];
    if (sentiment) {
      event.preventDefault();
      void label(sentiment);
    } else if (event.key === '0' && current && !saving) {
      event.preventDefault();
      next(current.id);
    }
  };

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: CALENDAR_TIME_ZONE,
    }).format(new Date(iso));

  return (
    <section
      ref={panelRef}
      className="sentiment-labeling"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <h3 id={titleId}>{t('sentiment.label.title')}</h3>
      <p className="field-hint">{t('sentiment.label.hint')}</p>
      {lastLabel && (
        <p className="visually-hidden" role="status">
          {t('sentiment.label.saved', { value: t(`sentiment.values.${lastLabel}`) })}
        </p>
      )}
      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('sentiment.label.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {state.status === 'ready' && !current && (
        <p className="assets-empty">{t('sentiment.label.done')}</p>
      )}
      {current && (
        <article className="sentiment-card">
          <a ref={titleRef} href={current.url} target="_blank" rel="noreferrer" lang="pt-BR">
            {current.title}
          </a>
          <span className="position-name">
            {current.source} · {dateTime(current.publishedAt)}
          </span>
          {current.summary && (
            <p className="sentiment-summary" lang="pt-BR">
              {current.summary}
            </p>
          )}
          <p className="field-hint">
            {current.principal.length > 0
              ? t('sentiment.label.principal', { tickers: current.principal.join(', ') })
              : t('sentiment.label.market')}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="sentiment-buttons" role="group" aria-label={t('sentiment.label.group')}>
            {NEWS_SENTIMENTS.map((sentiment, i) => (
              <button
                key={sentiment}
                type="button"
                className={`pill pill-small sentiment-button is-${sentiment}`}
                disabled={saving}
                onClick={() => void label(sentiment)}
              >
                {t(`sentiment.values.${sentiment}`)}
                <kbd aria-hidden="true">{i + 1}</kbd>
              </button>
            ))}
            <button
              type="button"
              className="pill pill-ghost pill-small"
              disabled={saving}
              onClick={() => next(current.id)}
            >
              {t('sentiment.label.skip')}
              <kbd aria-hidden="true">0</kbd>
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

/** Os últimos rotulados, para trocar ou apagar o rótulo. */
function RecentLabels({
  labels,
  onChanged,
  onSessionExpired,
}: {
  labels: SentimentSummary['recentLabels'];
  onChanged: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (id: string, sentiment: NewsSentiment | null) => {
    setBusy(id);
    setError(null);
    const result = sentiment
      ? await window.api.news.label(id, sentiment)
      : await window.api.news.unlabel(id);
    setBusy(null);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setError(t(`authErrors.${result.error}`));
    }
    onChanged();
  };

  if (labels.length === 0) return null;
  return (
    <section className="sentiment-recent" aria-labelledby={titleId}>
      <h3 id={titleId}>{t('sentiment.recent.title')}</h3>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ol className="latest-news-list">
        {labels.map((item) => (
          <li key={item.id}>
            <a href={item.url} target="_blank" rel="noreferrer" lang="pt-BR">
              {item.title}
            </a>
            <div className="sentiment-recent-actions">
              <select
                className="sentiment-select"
                value={item.label}
                disabled={busy !== null}
                aria-label={t('sentiment.recent.change', { title: item.title })}
                onChange={(event) => void change(item.id, event.target.value as NewsSentiment)}
              >
                {NEWS_SENTIMENTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sentiment.values.${s}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pill pill-ghost pill-small"
                disabled={busy !== null}
                aria-label={t('sentiment.recent.removeLabel', { title: item.title })}
                onClick={() => void change(item.id, null)}
              >
                {t('sentiment.recent.remove')}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
