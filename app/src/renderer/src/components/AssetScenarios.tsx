import {
  NEWS_SENTIMENTS,
  SCENARIO_HORIZONS,
  SCENARIO_STABLE_LIMIT,
  type AssetScenarios as Scenarios,
  type NewsSentiment,
  type ScenarioCell,
  type ScenarioHorizon,
} from '@simulador/shared';
import { Info } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay } from '../format';
import '../asset-detail.css';
import { SentimentTag } from './NewsSentiment';

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: Scenarios }
  | { status: 'failed'; error: ClientAuthError };

/** Horizonte que a seção abre: 5 pregões depois, como o painel do pregão (SPEC-029). */
const DEFAULT_HORIZON: ScenarioHorizon = 5;

/**
 * SPEC-031 §5.2: os cenários por sentimento na ficha. O que o preço fez depois dos pregões com
 * notícia positiva, neutra ou negativa, ao lado da taxa-base, com o número de ocorrências; abaixo
 * de 30, "dados insuficientes" (RB31). Sempre com as frases fixas (RB18, RB19).
 */
export function AssetScenarios({
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
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [horizon, setHorizon] = useState<ScenarioHorizon>(DEFAULT_HORIZON);

  useEffect(() => {
    let active = true;
    void window.api.assets.scenarios(assetId).then((result) => {
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
  }, [assetId, attempt, onSessionExpired]);

  const data = state.status === 'ready' ? state.data : null;

  return (
    <section className="profile-panel asset-scenarios" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h2 id={titleId}>{t('detail.scenarios.title')}</h2>
      </div>
      <p className="field-hint">{t('detail.scenarios.lead')}</p>

      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('detail.scenarios.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <div className="asset-news-failed">
          <p className="form-error" role="alert">
            {t(`authErrors.${state.error}`)}
          </p>
          <button
            type="button"
            className="pill pill-ghost pill-small"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            {t('detail.scenarios.retry')}
          </button>
        </div>
      )}

      {data && !data.visible && (
        <p className="assets-note">
          <Info weight="fill" aria-hidden="true" />
          <span>{t('detail.scenarios.hidden')}</span>
        </p>
      )}

      {data && data.visible && (
        <ScenarioBody data={data} ticker={ticker} horizon={horizon} onHorizon={setHorizon} />
      )}

      <p className="field-hint">{t('detail.scenarios.notForecast')}</p>
      <p className="field-hint">{t('detail.scenarios.notAdvice')}</p>
    </section>
  );
}

function ScenarioBody({
  data,
  ticker,
  horizon,
  onHorizon,
}: {
  data: Scenarios;
  ticker: string;
  horizon: ScenarioHorizon;
  onHorizon: (horizon: ScenarioHorizon) => void;
}) {
  const { t, i18n } = useTranslation();
  const groupId = useId();
  const index = SCENARIO_HORIZONS.indexOf(horizon);
  const percent = (share: number | null) =>
    new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(
      share ?? 0,
    );
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const today = data.today;
  const todayCell = today && data.bands ? data.bands[today.band][index] : null;

  if (!data.period || !data.bands || !data.base) {
    return <p>{t('detail.scenarios.noNews')}</p>;
  }

  const row = (label: string, cell: ScenarioCell | undefined, band?: NewsSentiment) => (
    <tr key={label} className={band && today?.band === band ? 'is-today' : undefined}>
      <th scope="row" data-label="">
        {label}
        {band && today?.band === band && (
          <span className="position-event">{t('detail.scenarios.todayBand')}</span>
        )}
      </th>
      {cell && !cell.insufficient ? (
        <>
          <td data-label={t('detail.scenarios.down')} className="cash-number">
            {percent(cell.down)}
          </td>
          <td data-label={t('detail.scenarios.flat')} className="cash-number">
            {percent(cell.flat)}
          </td>
          <td data-label={t('detail.scenarios.up')} className="cash-number">
            {percent(cell.up)}
          </td>
        </>
      ) : (
        <td colSpan={3} data-label="" className="scenario-insufficient">
          {t('detail.scenarios.insufficient', { min: data.minOccurrences })}
        </td>
      )}
      <td data-label={t('detail.scenarios.occurrences')} className="cash-number">
        {number(cell?.occurrences ?? 0)}
      </td>
    </tr>
  );

  return (
    <>
      <p className="scenario-today" aria-live="polite">
        {today ? (
          <>
            {t('detail.scenarios.today', { count: today.news })}{' '}
            <SentimentTag sentiment={today.band} />
          </>
        ) : (
          t('detail.scenarios.noNewsToday')
        )}
      </p>

      <div className="scenario-horizons" role="radiogroup" aria-labelledby={groupId}>
        <span id={groupId} className="field-hint">
          {t('detail.scenarios.horizon')}
        </span>
        {SCENARIO_HORIZONS.map((h) => (
          <label key={h} className="scenario-horizon">
            <input
              type="radio"
              name={`${groupId}-horizonte`}
              checked={h === horizon}
              onChange={() => onHorizon(h)}
            />
            {t(`detail.scenarios.horizons.${h}`)}
          </label>
        ))}
      </div>

      {today && todayCell && !todayCell.insufficient && (
        <p className="scenario-sentence">
          {t(`detail.scenarios.sentence.${horizon}`, {
            count: todayCell.occurrences,
            ticker,
            band: t(`detail.scenarios.bandWord.${today.band}`),
            down: percent(todayCell.down),
            flat: percent(todayCell.flat),
            up: percent(todayCell.up),
          })}
        </p>
      )}

      <div className="positions-scroll">
        <table className="cash-statement positions-table scenario-table">
          <caption className="visually-hidden">
            {t('detail.scenarios.caption', { horizon: t(`detail.scenarios.horizons.${horizon}`) })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('detail.scenarios.band')}</th>
              <th scope="col" className="cash-number">
                {t('detail.scenarios.down')}
              </th>
              <th scope="col" className="cash-number">
                {t('detail.scenarios.flat')}
              </th>
              <th scope="col" className="cash-number">
                {t('detail.scenarios.up')}
              </th>
              <th scope="col" className="cash-number">
                {t('detail.scenarios.occurrences')}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...NEWS_SENTIMENTS].map((band) =>
              row(t(`detail.scenarios.bands.${band}`), data.bands?.[band][index], band),
            )}
            {row(t('detail.scenarios.base'), data.base[index])}
          </tbody>
        </table>
      </div>

      <p className="field-hint">
        {t('detail.scenarios.stable', {
          limit: SCENARIO_STABLE_LIMIT[horizon],
          horizon: t(`detail.scenarios.horizons.${horizon}`),
        })}{' '}
        {t('detail.scenarios.period', {
          from: formatCalendarDay(data.period.from, i18n.language),
          sessions: number(data.period.sessions),
          news: number(data.newsSessions),
        })}
      </p>
    </>
  );
}
