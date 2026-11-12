import {
  isoDateInBrasilia,
  PERFORMANCE_PERIODS,
  type BenchmarkCode,
  type FieldErrors,
  type PerformancePeriod,
  type PerformancePoint,
  type PerformanceQuery,
  type Portfolio,
  type PortfolioPerformance as PerformanceData,
} from '@simulador/shared';
import { ChartLine, Warning } from '@phosphor-icons/react';
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
  // SPEC-020: o gráfico em reais (o da SPEC-019, o padrão) ou em % com as referências.
  const [chartMode, setChartMode] = useState<'money' | 'percent'>('money');
  // SPEC-020: as linhas dos índices nos dois gráficos, ligadas pelo botão "Comparar".
  const [compare, setCompare] = useState(false);

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
  const shown = compare && data ? data.benchmarks.map((benchmark) => benchmark.code) : [];

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

          <Benchmarks data={data} />

          {data.series.length > 1 && (
            <>
              <div className="chart-toolbar">
                <div
                  className="period-buttons chart-mode"
                  role="group"
                  aria-label={t('portfolios.performance.chartMode')}
                >
                  {(['money', 'percent'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="period-button"
                      aria-pressed={chartMode === mode}
                      onClick={() => setChartMode(mode)}
                    >
                      {t(`portfolios.performance.chartModes.${mode}`)}
                    </button>
                  ))}
                </div>
                {data.benchmarks.length > 0 && (
                  <button
                    type="button"
                    className="period-button compare-toggle"
                    aria-pressed={compare}
                    onClick={() => setCompare((current) => !current)}
                  >
                    <ChartLine aria-hidden="true" />
                    {t('portfolios.performance.compare')}
                  </button>
                )}
              </div>
              {chartMode === 'money' ? (
                <>
                  <EquityChart
                    points={data.series}
                    label={t('portfolios.performance.chartLabel')}
                    codes={shown}
                  />
                  <p className="performance-legend">
                    <span className="legend-equity">
                      {t('portfolios.performance.legendEquity')}
                    </span>
                    <span className="legend-invested">
                      {t('portfolios.performance.legendInvested')}
                    </span>
                    {shown.map((code) => (
                      <span key={code} className={`legend-${code}`}>
                        {t(`portfolios.performance.sameMoney.${code}`)}
                      </span>
                    ))}
                  </p>
                </>
              ) : (
                <>
                  <ReturnChart points={data.series} codes={shown} />
                  <p className="performance-legend">
                    <span className="legend-equity">
                      {t('portfolios.performance.legendPortfolio')}
                    </span>
                    {shown.map((code) => (
                      <span key={code} className={`legend-${code}`}>
                        {t(`portfolios.performance.benchmarks.${code}`)}
                      </span>
                    ))}
                  </p>
                </>
              )}
              {chartMode === 'money' && compare && (
                <p className="field-hint">{t('portfolios.performance.sameMoneyNote')}</p>
              )}
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

export function signed(value: string): string {
  return !value.startsWith('-') && value !== '0.00' ? '+' : '';
}

/**
 * SPEC-020: as referências no mesmo período (CDI, Ibovespa e, com FII, IFIX), o "% do CDI" e as
 * fontes. A referência que para antes do último ponto diz até quando; a que ainda não foi carregada
 * diz isso, sem quebrar o painel.
 */
function Benchmarks({ data }: { data: PerformanceData }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  if (data.benchmarks.length === 0) return null;
  const lastPoint = data.series.at(-1)?.date ?? data.to;
  return (
    <div className="performance-benchmarks">
      <h3>{t('portfolios.performance.benchmarks.title')}</h3>
      <ul>
        {data.benchmarks.map((benchmark) => (
          <li key={benchmark.code}>
            <span className="benchmark-name">
              {t(`portfolios.performance.benchmarks.${benchmark.code}`)}
            </span>
            {benchmark.return === null ? (
              <span className="benchmark-missing">
                {t(`portfolios.performance.benchmarks.notLoaded.${benchmark.source}`)}
              </span>
            ) : (
              <>
                <span className={`quote-change is-${changeDirection(benchmark.return)}`}>
                  {formatChange(benchmark.return, language)}
                </span>
                {benchmark.endValue && (
                  <span className="benchmark-value">
                    {t('portfolios.performance.benchmarks.wouldHave', {
                      amount: formatMoney(benchmark.endValue, language),
                    })}
                  </span>
                )}
                {benchmark.until && benchmark.until < lastPoint && (
                  <span className="benchmark-until">
                    {t('portfolios.performance.benchmarks.until', {
                      date: formatCalendarDay(benchmark.until, language),
                    })}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {data.cdiShare && (
        <p className="benchmark-share">
          {t('portfolios.performance.benchmarks.share', {
            share: new Intl.NumberFormat(language).format(Number(data.cdiShare)),
          })}
        </p>
      )}
      <p className="field-hint">
        {t(
          data.benchmarks.some((benchmark) => benchmark.code === 'ifix')
            ? 'portfolios.performance.benchmarks.noteIfix'
            : 'portfolios.performance.benchmarks.note',
          {
            date: data.baseDate ? formatCalendarDay(data.baseDate, language) : '',
          },
        )}
      </p>
    </div>
  );
}

/** Largura do gráfico e cursor pelo mouse, pelo toque e pelo teclado (como o da ficha, SPEC-010). */
export function useChartCursor<T>(points: readonly T[]) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [cursor, setCursor] = useState<{ points: readonly T[]; index: number } | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const last = points.length - 1;
  const index = cursor?.points === points ? cursor.index : null;
  const handlers = (box: Parameters<typeof nearestIndex>[2]) => ({
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      const next = cursorAfterKey(event.key, index, points.length);
      if (next === null) return;
      event.preventDefault();
      setCursor({ points, index: next });
    },
    onFocus: () => {
      if (index === null) setCursor({ points, index: last });
    },
    onBlur: () => setCursor(null),
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setCursor({ points, index: nearestIndex(event.clientX - rect.left, points.length, box) });
    },
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
      if (document.activeElement !== event.currentTarget) setCursor(null);
    },
  });
  return { wrapper, width, index, last, handlers };
}

/**
 * Patrimônio (linha cheia, com área) e total aportado (tracejada), no mesmo eixo. Como o gráfico
 * da ficha (SPEC-010): mouse, toque e teclado (setas, Page Up/Down, Home e End).
 */
function EquityChart({
  points,
  label,
  codes,
}: {
  points: PerformancePoint[];
  label: string;
  /** SPEC-020: "o mesmo dinheiro" nos índices, com o botão "Comparar" ligado. */
  codes: BenchmarkCode[];
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const hintId = useId();
  const { wrapper, width, index, last, handlers } = useChartCursor(points);

  const invested = points.map((point) => Number(point.invested));
  const benchmarkValues = codes.flatMap((code) =>
    points.flatMap((point) => {
      const value = point.benchmarkValues[code];
      return value === null ? [] : [Number(value)];
    }),
  );
  const layout = chartLayout(
    points.map((point) => ({ date: point.date, close: point.equity })),
    width,
    HEIGHT,
    [...invested, ...benchmarkValues],
  );
  const sameMoney = (point: PerformancePoint, code: BenchmarkCode) => {
    const value = point.benchmarkValues[code];
    const amount =
      value === null ? t('portfolios.performance.noData') : formatMoney(value, language);
    return `${t(`portfolios.performance.sameMoney.${code}`)} ${amount}`;
  };
  const { box, axis, x, y } = layout;
  const investedLine = invested
    .map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`)
    .join('');
  const ticks = spaceTicks(timeTicks(points.map((point) => point.date)), x, MIN_TICK_GAP);
  const describe = (point: PerformancePoint | undefined) =>
    point
      ? t('portfolios.performance.cursor', {
          date: formatCalendarDay(point.date, language),
          equity: formatMoney(point.equity, language),
          invested: formatMoney(point.invested, language),
          return: formatChange(point.return, language),
        }) + codes.map((code) => `, ${sameMoney(point, code)}`).join('')
      : undefined;

  const point = index !== null ? points[index] : undefined;
  const pointX = index !== null ? x(index) : 0;
  const pointY = point ? y(Number(point.equity)) : 0;
  const tooltipHeight = TOOLTIP_HEIGHT + 16 * codes.length;
  const tooltipTop = pointY > tooltipHeight + 12 ? pointY - tooltipHeight - 10 : pointY + 12;

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
        {...handlers(box)}
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
          {codes.map((code) => (
            <path
              key={code}
              className={`chart-benchmark is-${code}`}
              d={pathOf(
                points.map((item) => item.benchmarkValues[code]),
                x,
                y,
              )}
            />
          ))}
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
            {codes.map((code) => (
              <span key={code}>{sameMoney(point, code)}</span>
            ))}
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

/** Caminho de uma linha que pode ter buracos (`null`: a referência sem dado naquele ponto). */
export function pathOf(
  values: ReadonlyArray<string | null>,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = '';
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)} ${y(Number(value)).toFixed(1)}`;
    drawing = true;
  });
  return path;
}

/** Eixo em %: "+12%", "−3,5%". */
export function formatAxisPercent(value: number, step: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: step >= 1 ? 0 : 1,
    signDisplay: 'exceptZero',
  }).format(value / 100);
}

/**
 * SPEC-020: a rentabilidade da cota (linha cheia, na cor de destaque) e as referências (traços
 * diferentes, não só cores), na mesma régua desde o dia-base, com a linha do zero. O cursor lê
 * todas no leitor de tela.
 */
function ReturnChart({ points, codes }: { points: PerformancePoint[]; codes: BenchmarkCode[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const hintId = useId();
  const { wrapper, width, index, last, handlers } = useChartCursor(points);

  const extra = codes.flatMap((code) =>
    points.flatMap((point) => {
      const value = point.benchmarks[code];
      return value === null ? [] : [Number(value)];
    }),
  );
  const layout = chartLayout(
    points.map((point) => ({ date: point.date, close: point.return })),
    width,
    HEIGHT,
    [0, ...extra],
  );
  const { box, axis, x, y } = layout;
  const ticks = spaceTicks(timeTicks(points.map((point) => point.date)), x, MIN_TICK_GAP);
  const name = (code: BenchmarkCode) => t(`portfolios.performance.benchmarks.${code}`);
  const value = (change: string | null) =>
    change === null ? t('portfolios.performance.noData') : formatChange(change, language);
  const describe = (point: PerformancePoint | undefined) =>
    point
      ? t('portfolios.performance.returnCursor', {
          date: formatCalendarDay(point.date, language),
          values: [
            `${t('portfolios.performance.legendPortfolio')} ${formatChange(point.return, language)}`,
            ...codes.map((code) => `${name(code)} ${value(point.benchmarks[code])}`),
          ].join(', '),
        })
      : undefined;

  const point = index !== null ? points[index] : undefined;
  const pointX = index !== null ? x(index) : 0;
  const pointY = point ? y(Number(point.return)) : 0;
  const tooltipHeight = TOOLTIP_HEIGHT + 16 * codes.length;
  const tooltipTop = pointY > tooltipHeight + 12 ? pointY - tooltipHeight - 10 : pointY + 12;

  return (
    <div className="price-chart" ref={wrapper}>
      <div
        className="price-chart-surface"
        role="slider"
        tabIndex={0}
        aria-label={t('portfolios.performance.returnChartLabel')}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index ?? last}
        aria-valuetext={describe(points[index ?? last])}
        {...handlers(box)}
      >
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          aria-hidden="true"
          focusable="false"
        >
          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line className="chart-grid" x1={box.left} x2={box.right} y1={y(tick)} y2={y(tick)} />
              <text className="chart-axis" x={box.right + 8} y={y(tick)} dominantBaseline="middle">
                {formatAxisPercent(tick, axis.step, language)}
              </text>
            </g>
          ))}
          <line className="chart-zero" x1={box.left} x2={box.right} y1={y(0)} y2={y(0)} />
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
          {codes.map((code) => (
            <path
              key={code}
              className={`chart-benchmark is-${code}`}
              d={pathOf(
                points.map((item) => item.benchmarks[code]),
                x,
                y,
              )}
            />
          ))}
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
            <strong>
              {t('portfolios.performance.legendPortfolio')} {formatChange(point.return, language)}
            </strong>
            {codes.map((code) => (
              <span key={code}>
                {name(code)} {value(point.benchmarks[code])}
              </span>
            ))}
            <span>{formatCalendarDay(point.date, language)}</span>
          </div>
        )}
      </div>
      <p id={hintId} className="visually-hidden">
        {t('detail.history.chartHint')}
      </p>
    </div>
  );
}
