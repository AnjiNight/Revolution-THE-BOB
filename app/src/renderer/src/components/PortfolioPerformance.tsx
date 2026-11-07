import {
  isoDateInBrasilia,
  PERFORMANCE_PERIODS,
  type FieldErrors,
  type PerformancePeriod,
  type PerformancePoint,
  type PerformanceQuery,
  type Portfolio,
  type PortfolioPerformance as PerformanceData,
} from '@simulador/shared';
import { Warning } from '@phosphor-icons/react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import {
  formatAxisPrice,
  formatCalendarDay,
  formatChange,
  formatMoney,
  formatTickDate,
} from '../format';
import { chartLayout, cursorAfterKey, nearestIndex, spaceTicks, timeTicks } from '../price-chart';
import { changeDirection } from './QuoteText';
import { TextField } from './TextField';

type PerformanceState =
  | { status: 'loading' }
  | { status: 'ready'; data: PerformanceData }
  | { status: 'failed'; error: ClientAuthError; fields?: FieldErrors };

const HEIGHT = 240;
const MIN_TICK_GAP = 58;
const TOOLTIP_HALF = 90;
const TOOLTIP_HEIGHT = 64;

/**
 * Rentabilidade e evolução patrimonial (SPEC-019 §5.2): períodos, os três números (rentabilidade
 * da cota, resultado e patrimônio) e o gráfico do patrimônio e do total aportado, com os avisos.
 */
export function PortfolioPerformance({
  portfolio,
  version,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  /** Muda a cada lançamento novo: a conta é pedida de novo. */
  version: number;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [query, setQuery] = useState<PerformanceQuery>({ period: 'all' });
  const [custom, setCustom] = useState(false);
  const today = isoDateInBrasilia(new Date());
  const [from, setFrom] = useState(portfolio.startDate);
  const [to, setTo] = useState(today);
  const [state, setState] = useState<PerformanceState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void window.api.portfolios.performance(portfolio.id, query).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : {
              status: 'failed',
              error: result.error,
              ...(result.fields ? { fields: result.fields } : {}),
            },
      );
    });
    return () => {
      active = false;
    };
  }, [portfolio.id, query, onSessionExpired, version]);

  // O "Calculando…" aparece ao trocar o período; ao recarregar por um lançamento novo, os números
  // de antes ficam até chegarem os novos.
  const choose = (period: PerformancePeriod) => {
    setCustom(false);
    setState({ status: 'loading' });
    setQuery({ period });
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setState({ status: 'loading' });
    setQuery({ from, to });
  };

  const data = state.status === 'ready' ? state.data : null;
  const fields = state.status === 'failed' ? state.fields : undefined;
  const selected = 'period' in query && !custom ? query.period : null;

  return (
    <section className="profile-panel performance-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('portfolios.performance.title')}</h2>
      <div
        className="period-buttons"
        role="group"
        aria-label={t('portfolios.performance.periodLabel')}
      >
        {PERFORMANCE_PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            className="period-button"
            aria-pressed={selected === period}
            onClick={() => choose(period)}
          >
            {t(`portfolios.performance.periods.${period}`)}
          </button>
        ))}
        <button
          type="button"
          className="period-button"
          aria-pressed={custom}
          aria-expanded={custom}
          onClick={() => setCustom(true)}
        >
          {t('portfolios.performance.periods.custom')}
        </button>
      </div>

      {custom && (
        <form className="performance-custom" onSubmit={apply} noValidate>
          <TextField
            label={t('portfolios.performance.from')}
            type="date"
            value={from}
            onChange={setFrom}
            autoComplete="off"
            min={portfolio.startDate}
            max={today}
            error={fields?.from}
          />
          <TextField
            label={t('portfolios.performance.to')}
            type="date"
            value={to}
            onChange={setTo}
            autoComplete="off"
            min={portfolio.startDate}
            max={today}
            error={fields?.to}
          />
          <button type="submit" className="pill pill-primary">
            {t('portfolios.performance.apply')}
          </button>
        </form>
      )}

      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('portfolios.performance.loading')}
        </p>
      )}
      {state.status === 'failed' && !fields && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {data?.empty && <p className="assets-empty">{t('portfolios.performance.empty')}</p>}

      {data && !data.empty && (
        <>
          <p className="field-hint">
            {t('portfolios.performance.range', {
              from: formatCalendarDay(data.from, language),
              to: formatCalendarDay(data.to, language),
            })}
          </p>
          <dl className="positions-totals performance-totals">
            <div>
              <dt>{t('portfolios.performance.return')}</dt>
              <dd className={`quote-change is-${changeDirection(data.return)}`}>
                {formatChange(data.return, language)}
              </dd>
            </div>
            <div>
              <dt>{t('portfolios.performance.result')}</dt>
              <dd className={`quote-change is-${changeDirection(data.result)}`}>
                {signed(data.result)}
                {formatMoney(data.result, language)}
              </dd>
            </div>
            <div>
              <dt>{t('portfolios.performance.equity')}</dt>
              <dd>{formatMoney(data.endValue, language)}</dd>
            </div>
          </dl>
          <p className="field-hint">
            {t('portfolios.performance.flows', {
              start: formatMoney(data.startValue, language),
              flows: formatMoney(data.netFlows, language),
            })}
          </p>

          {data.series.length > 1 && (
            <>
              <EquityChart points={data.series} label={t('portfolios.performance.chartLabel')} />
              <p className="performance-legend">
                <span className="legend-equity">{t('portfolios.performance.legendEquity')}</span>
                <span className="legend-invested">
                  {t('portfolios.performance.legendInvested')}
                </span>
              </p>
            </>
          )}
          <p className="field-hint">
            {data.weekly && `${t('portfolios.performance.weekly')} `}
            {t('portfolios.performance.note')}
          </p>

          {data.warnings.map((warning) => (
            <p
              key={`${warning.kind}${warning.assetId}${warning.kind === 'unexplained_jump' ? warning.date : warning.until}`}
              className="assets-note is-warning"
            >
              <Warning weight="fill" aria-hidden="true" />
              <span>
                {warning.kind === 'unexplained_jump'
                  ? t('portfolios.performance.jump', {
                      ticker: warning.ticker,
                      date: formatCalendarDay(warning.date, language),
                    })
                  : t('portfolios.performance.noClose', {
                      ticker: warning.ticker,
                      date: formatCalendarDay(warning.until, language),
                    })}
              </span>
            </p>
          ))}
        </>
      )}
    </section>
  );
}

function signed(value: string): string {
  return !value.startsWith('-') && value !== '0.00' ? '+' : '';
}

/**
 * Patrimônio (linha cheia, com área) e total aportado (tracejada), no mesmo eixo. Como o gráfico
 * da ficha (SPEC-010): mouse, toque e teclado (setas, Page Up/Down, Home e End).
 */
function EquityChart({ points, label }: { points: PerformancePoint[]; label: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const hintId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [cursor, setCursor] = useState<{ points: PerformancePoint[]; index: number } | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const invested = points.map((point) => Number(point.invested));
  const layout = chartLayout(
    points.map((point) => ({ date: point.date, close: point.equity })),
    width,
    HEIGHT,
    invested,
  );
  const { box, axis, x, y } = layout;
  const investedLine = invested
    .map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`)
    .join('');
  const ticks = spaceTicks(timeTicks(points.map((point) => point.date)), x, MIN_TICK_GAP);
  const last = points.length - 1;
  const index = cursor?.points === points ? cursor.index : null;
  const describe = (point: PerformancePoint | undefined) =>
    point
      ? t('portfolios.performance.cursor', {
          date: formatCalendarDay(point.date, language),
          equity: formatMoney(point.equity, language),
          invested: formatMoney(point.invested, language),
          return: formatChange(point.return, language),
        })
      : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = cursorAfterKey(event.key, index, points.length);
    if (next === null) return;
    event.preventDefault();
    setCursor({ points, index: next });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor({ points, index: nearestIndex(event.clientX - rect.left, points.length, box) });
  };

  const point = index !== null ? points[index] : undefined;
  const pointX = index !== null ? x(index) : 0;
  const pointY = point ? y(Number(point.equity)) : 0;
  const tooltipTop = pointY > TOOLTIP_HEIGHT + 12 ? pointY - TOOLTIP_HEIGHT - 10 : pointY + 12;

  return (
    <div className="price-chart" ref={wrapper}>
      <div
        className="price-chart-surface"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index ?? last}
        aria-valuetext={describe(points[index ?? last])}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (index === null) setCursor({ points, index: last });
        }}
        onBlur={() => setCursor(null)}
        onPointerMove={onPointerMove}
        onPointerLeave={(event) => {
          if (document.activeElement !== event.currentTarget) setCursor(null);
        }}
      >
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          aria-hidden="true"
          focusable="false"
        >
          {axis.ticks.map((value) => (
            <g key={value}>
              <line
                className="chart-grid"
                x1={box.left}
                x2={box.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text className="chart-axis" x={box.right + 8} y={y(value)} dominantBaseline="middle">
                {formatAxisPrice(value, axis.step, language)}
              </text>
            </g>
          ))}
          {ticks.map((tick) => (
            <text
              key={tick.index}
              className="chart-axis"
              x={x(tick.index)}
              y={HEIGHT - 6}
              textAnchor={x(tick.index) - box.left < 24 ? 'start' : 'middle'}
            >
              {formatTickDate(tick.date, tick.unit, language)}
            </text>
          ))}
          <path className="chart-area" d={layout.area} />
          <path className="chart-invested" d={investedLine} />
          <path className="chart-line" d={layout.line} />
          {point && (
            <g>
              <line className="chart-cursor" x1={pointX} x2={pointX} y1={box.top} y2={box.bottom} />
              <circle className="chart-dot" cx={pointX} cy={pointY} r={4.5} />
            </g>
          )}
        </svg>
        {point && (
          <div
            className="chart-tooltip"
            aria-hidden="true"
            style={{
              left: Math.min(Math.max(pointX, TOOLTIP_HALF), width - TOOLTIP_HALF),
              top: tooltipTop,
            }}
          >
            <strong>{formatMoney(point.equity, language)}</strong>
            <span>
              {t('portfolios.performance.tooltipInvested', {
                amount: formatMoney(point.invested, language),
              })}
            </span>
            <span>
              {formatCalendarDay(point.date, language)} · {formatChange(point.return, language)}
            </span>
          </div>
        )}
      </div>
      <p id={hintId} className="visually-hidden">
        {t('detail.history.chartHint')}
      </p>
    </div>
  );
}
