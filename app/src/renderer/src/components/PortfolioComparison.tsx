import {
  isoDateInBrasilia,
  PERFORMANCE_PERIODS,
  PORTFOLIO_HISTORY_START,
  type BenchmarkCode,
  type ComparedPortfolio,
  type ComparisonPeriod,
  type ComparisonQuery,
  type FieldErrors,
  type IsoDate,
  type PortfolioComparison as ComparisonData,
  type PortfolioType,
} from '@simulador/shared';
import { ArrowLeft, ChartLine, Warning } from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import {
  alignSeries,
  compositionRows,
  markerSpots,
  SERIES_SHAPES,
  type SeriesShape,
} from '../comparison';
import { formatCalendarDay, formatChange, formatMoney, formatTickDate } from '../format';
import '../portfolios.css';
import { chartLayout, spaceTicks, timeTicks } from '../price-chart';
import { formatShare } from './PortfolioAllocation';
import { formatAxisPercent, pathOf, signed, useChartCursor } from './PortfolioPerformance';
import { changeDirection } from './QuoteText';
import { TextField } from './TextField';

type Period = { period: ComparisonPeriod } | { from: IsoDate; to: IsoDate };

const HEIGHT = 260;
const MIN_TICK_GAP = 58;
const TOOLTIP_HALF = 110;

/**
 * Comparação de carteiras (SPEC-022 §4.2): de 2 a 4 carteiras no mesmo período. A rentabilidade da
 * cota num gráfico em % (com os índices, se a pessoa quiser), o resumo em reais, a composição de
 * hoje e, com uma histórica, a nota da DA17. Cada carteira tem uma cor e um marcador.
 */
export function PortfolioComparison({
  ids,
  onBack,
  onOpen,
  onSessionExpired,
}: {
  /** Na ordem em que foram escolhidas. */
  ids: readonly string[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const heading = useRef<HTMLHeadingElement>(null);
  const returnTitleId = useId();
  const key = ids.join(',');
  const today = isoDateInBrasilia(new Date());
  const [period, setPeriod] = useState<Period>({ period: 'common' });
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  // Ao trocar o período, os números de antes ficam (esmaecidos) até chegarem os novos.
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ error: ClientAuthError; fields?: FieldErrors } | null>(
    null,
  );
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    const query = { ids: key.split(','), ...period } as ComparisonQuery;
    void window.api.portfolios.comparison(query).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setLoading(false);
      if (result.ok) {
        setData(result.data);
        setFailure(null);
      } else {
        setFailure({ error: result.error, ...(result.fields ? { fields: result.fields } : {}) });
      }
    });
    return () => {
      active = false;
    };
  }, [key, period, onSessionExpired]);

  const choose = (next: ComparisonPeriod) => {
    setCustom(false);
    setLoading(true);
    setPeriod({ period: next });
  };

  const openCustom = () => {
    if (data) {
      setFrom(data.from);
      setTo(data.to);
    }
    setCustom(true);
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setPeriod({ from, to });
  };

  const fields = failure?.fields;
  const selected = 'period' in period && !custom ? period.period : null;
  const shown: BenchmarkCode[] = compare && data ? data.benchmarks.map((item) => item.code) : [];
  const earliest =
    (data ? data.portfolios.map((item) => item.startDate).sort()[0] : undefined) ??
    PORTFOLIO_HISTORY_START;
  const historical = data?.portfolios.some((item) => item.type === 'historical') ?? false;

  return (
    <div className="portfolio-page comparison-page">
      <button type="button" className="link asset-detail-back" onClick={onBack}>
        <ArrowLeft weight="bold" aria-hidden="true" />
        {t('portfolios.back')}
      </button>
      <header className="page-hero">
        <h1 ref={heading} tabIndex={-1}>
          {t('portfolios.comparison.title')}
        </h1>
        <p className="lead">{t('portfolios.comparison.lead')}</p>
        {data && (
          <ul className="comparison-portfolios" aria-label={t('portfolios.comparison.listLabel')}>
            {data.portfolios.map((item, index) => (
              <li key={item.id}>
                <SeriesBadge index={index} />
                <button
                  type="button"
                  className="link portfolio-open"
                  aria-label={t('portfolios.comparison.open', { name: item.name })}
                  onClick={() => onOpen(item.id)}
                >
                  {item.name}
                </button>
                <ShortType type={item.type} />
              </li>
            ))}
          </ul>
        )}
      </header>

      <section
        className="profile-panel performance-panel comparison-panel"
        aria-labelledby={returnTitleId}
        aria-busy={loading}
      >
        <h2 id={returnTitleId}>{t('portfolios.comparison.returnTitle')}</h2>
        <div
          className="period-buttons"
          role="group"
          aria-label={t('portfolios.performance.periodLabel')}
        >
          <button
            type="button"
            className="period-button"
            aria-pressed={selected === 'common'}
            onClick={() => choose('common')}
          >
            {t('portfolios.comparison.common')}
          </button>
          {PERFORMANCE_PERIODS.map((item) => (
            <button
              key={item}
              type="button"
              className="period-button"
              aria-pressed={selected === item}
              onClick={() => choose(item)}
            >
              {t(`portfolios.performance.periods.${item}`)}
            </button>
          ))}
          <button
            type="button"
            className="period-button"
            aria-pressed={custom}
            aria-expanded={custom}
            onClick={openCustom}
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
              min={earliest}
              max={today}
              error={fields?.from}
            />
            <TextField
              label={t('portfolios.performance.to')}
              type="date"
              value={to}
              onChange={setTo}
              autoComplete="off"
              min={earliest}
              max={today}
              error={fields?.to}
            />
            <button type="submit" className="pill pill-primary">
              {t('portfolios.performance.apply')}
            </button>
          </form>
        )}

        {loading && (
          <p className="loading" role="status">
            {t('portfolios.comparison.loading')}
          </p>
        )}
        {failure && !fields?.from && !fields?.to && (
          <p className="form-error" role="alert">
            {failure.fields?.ids
              ? t(`fieldErrors.${failure.fields.ids}`)
              : t(`authErrors.${failure.error}`)}
          </p>
        )}

        {data && (
          <div className={loading ? 'is-stale' : undefined}>
            <p className="field-hint">
              {t('portfolios.performance.range', {
                from: formatCalendarDay(data.from, language),
                to: formatCalendarDay(data.to, language),
              })}
              {selected === 'common' && ` ${t('portfolios.comparison.commonHint')}`}
            </p>
            {data.benchmarkSeries.length > 1 ? (
              <>
                {data.benchmarks.length > 0 && (
                  <div className="chart-toolbar">
                    <button
                      type="button"
                      className="period-button compare-toggle"
                      aria-pressed={compare}
                      onClick={() => setCompare((current) => !current)}
                    >
                      <ChartLine aria-hidden="true" />
                      {t('portfolios.performance.compare')}
                    </button>
                  </div>
                )}
                <ComparisonChart data={data} codes={shown} />
                <ul className="comparison-legend">
                  {data.portfolios.map((item, index) => (
                    <li key={item.id}>
                      <SeriesBadge index={index} />
                      {item.name}
                    </li>
                  ))}
                </ul>
                {shown.length > 0 && (
                  <p className="performance-legend">
                    {shown.map((code) => (
                      <span key={code} className={`legend-${code}`}>
                        {t(`portfolios.performance.benchmarks.${code}`)}
                      </span>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <p className="assets-empty">{t('portfolios.comparison.noChart')}</p>
            )}
            <Benchmarks data={data} />
            <p className="field-hint">
              {data.weekly && `${t('portfolios.performance.weekly')} `}
              {t('portfolios.comparison.note')}
            </p>
          </div>
        )}
      </section>

      {data && (
        <div className={loading ? 'is-stale' : undefined}>
          <SummaryTable data={data} onOpen={onOpen} />
          <CompositionTable portfolios={data.portfolios} />
          {historical && <p className="assets-note">{t('portfolios.comparison.historicalNote')}</p>}
        </div>
      )}
    </div>
  );
}

/** O rótulo curto do tipo, ao lado do nome; a nota completa da DA17 fica no fim da tela. */
function ShortType({ type }: { type: PortfolioType }) {
  const { t } = useTranslation();
  return (
    <span className={`portfolio-type portfolio-type-${type}`}>
      {t(`portfolios.comparison.types.${type}`)}
    </span>
  );
}

/** O marcador de uma carteira, na cor dela (só desenho: o nome vem ao lado). */
function SeriesBadge({ index }: { index: number }) {
  const shape = SERIES_SHAPES[index % SERIES_SHAPES.length] as SeriesShape;
  return (
    <svg
      className={`series-badge is-series-${index + 1}`}
      width="26"
      height="14"
      viewBox="0 0 26 14"
      aria-hidden="true"
      focusable="false"
    >
      <line className="comparison-line" x1="1" x2="25" y1="7" y2="7" />
      <SeriesMarker shape={shape} x={13} y={7} size={4} />
    </svg>
  );
}

function SeriesMarker({
  shape,
  x,
  y,
  size = 4,
}: {
  shape: SeriesShape;
  x: number;
  y: number;
  size?: number;
}) {
  switch (shape) {
    case 'circle':
      return <circle className="comparison-marker" cx={x} cy={y} r={size} />;
    case 'square':
      return (
        <rect
          className="comparison-marker"
          x={x - size * 0.9}
          y={y - size * 0.9}
          width={size * 1.8}
          height={size * 1.8}
        />
      );
    case 'triangle': {
      const s = size * 1.2;
      return (
        <path
          className="comparison-marker"
          d={`M${x} ${y - s}L${x + s} ${y + s * 0.8}L${x - s} ${y + s * 0.8}Z`}
        />
      );
    }
    case 'diamond': {
      const s = size * 1.25;
      return (
        <path
          className="comparison-marker"
          d={`M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`}
        />
      );
    }
  }
}

/**
 * Uma linha contínua por carteira, cada uma com a cor e o marcador dela; os índices tracejados,
 * como na SPEC-020. Como o gráfico da rentabilidade: mouse, toque e teclado, e o cursor lê o dia e
 * a % de cada carteira (RNF18).
 */
function ComparisonChart({ data, codes }: { data: ComparisonData; codes: BenchmarkCode[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const hintId = useId();
  const days = useMemo(() => data.benchmarkSeries.map((point) => point.date), [data]);
  const lines = useMemo(
    () => data.portfolios.map((item) => alignSeries(days, item.performance.series)),
    [data, days],
  );
  const { wrapper, width, index, last, handlers } = useChartCursor(days);

  const benchmark = (code: BenchmarkCode) =>
    data.benchmarkSeries.map((point) => point.benchmarks[code]);
  const numbers = [...lines.flat(), ...codes.flatMap(benchmark)].flatMap((value) =>
    value === null ? [] : [Number(value)],
  );
  const layout = chartLayout(
    days.map((date) => ({ date, close: '0' })),
    width,
    HEIGHT,
    numbers,
  );
  const { box, axis, x, y } = layout;
  const ticks = spaceTicks(timeTicks(days), x, MIN_TICK_GAP);
  const shapeOf = (series: number) => SERIES_SHAPES[series % SERIES_SHAPES.length] as SeriesShape;
  const value = (change: string | null | undefined) =>
    change === null || change === undefined
      ? t('portfolios.performance.noData')
      : formatChange(change, language);
  const describe = (at: number) => {
    const date = days[at];
    if (date === undefined) return undefined;
    return t('portfolios.comparison.cursor', {
      date: formatCalendarDay(date, language),
      values: [
        ...data.portfolios.map((item, series) => `${item.name} ${value(lines[series]?.[at])}`),
        ...codes.map(
          (code) =>
            `${t(`portfolios.performance.benchmarks.${code}`)} ${value(data.benchmarkSeries[at]?.benchmarks[code])}`,
        ),
      ].join(', '),
    });
  };

  const pointX = index !== null ? x(index) : 0;
  return (
    <div className="price-chart" ref={wrapper}>
      <div
        className="price-chart-surface"
        role="slider"
        tabIndex={0}
        aria-label={t('portfolios.comparison.chartLabel')}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index ?? last}
        aria-valuetext={describe(index ?? last)}
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
              d={pathOf(benchmark(code), x, y)}
            />
          ))}
          {lines.map((values, series) => (
            <g key={data.portfolios[series]?.id} className={`is-series-${series + 1}`}>
              <path className="comparison-line" d={pathOf(values, x, y)} />
              {markerSpots(values, series, lines.length).map((spot) => (
                <SeriesMarker
                  key={spot}
                  shape={shapeOf(series)}
                  x={x(spot)}
                  y={y(Number(values[spot]))}
                />
              ))}
            </g>
          ))}
          {index !== null && (
            <g>
              <line className="chart-cursor" x1={pointX} x2={pointX} y1={box.top} y2={box.bottom} />
              {lines.map((values, series) => {
                const at = values[index];
                if (at === null || at === undefined) return null;
                return (
                  <g key={series} className={`is-series-${series + 1}`}>
                    <SeriesMarker shape={shapeOf(series)} x={pointX} y={y(Number(at))} size={5.5} />
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        {index !== null && days[index] !== undefined && (
          <div
            className="chart-tooltip comparison-tooltip"
            aria-hidden="true"
            style={{
              left: Math.min(Math.max(pointX, TOOLTIP_HALF), width - TOOLTIP_HALF),
              top: box.top,
            }}
          >
            <strong>{formatCalendarDay(days[index] as IsoDate, language)}</strong>
            {data.portfolios.map((item, series) => (
              <span key={item.id}>
                <SeriesBadge index={series} /> {item.name} {value(lines[series]?.[index])}
              </span>
            ))}
            {codes.map((code) => (
              <span key={code}>
                {t(`portfolios.performance.benchmarks.${code}`)}{' '}
                {value(data.benchmarkSeries[index]?.benchmarks[code])}
              </span>
            ))}
          </div>
        )}
      </div>
      <p id={hintId} className="visually-hidden">
        {t('detail.history.chartHint')}
      </p>
    </div>
  );
}

/** SPEC-020: as referências no período, do mesmo dia-base para todas as carteiras. */
function Benchmarks({ data }: { data: ComparisonData }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  if (data.benchmarks.length === 0) return null;
  const lastPoint = data.benchmarkSeries.at(-1)?.date ?? data.to;
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
      <p className="field-hint">
        {t(
          data.benchmarks.some((benchmark) => benchmark.code === 'ifix')
            ? 'portfolios.comparison.benchmarksNoteIfix'
            : 'portfolios.comparison.benchmarksNote',
          { date: data.baseDate ? formatCalendarDay(data.baseDate, language) : '' },
        )}
      </p>
    </div>
  );
}

/** "—" na tela; para o leitor de tela, o que ele quer dizer. */
function Dash({ meaning }: { meaning: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{meaning}</span>
    </>
  );
}

/** As carteiras como colunas: a cor, o marcador e o nome, com o link para ela. */
function PortfolioColumns({
  portfolios,
  onOpen,
}: {
  portfolios: readonly ComparedPortfolio[];
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {portfolios.map((item, index) => (
        <th key={item.id} scope="col">
          <span className="comparison-column">
            <SeriesBadge index={index} />
            {onOpen ? (
              <button
                type="button"
                className="link"
                aria-label={t('portfolios.comparison.open', { name: item.name })}
                onClick={() => onOpen(item.id)}
              >
                {item.name}
              </button>
            ) : (
              item.name
            )}
          </span>
        </th>
      ))}
    </>
  );
}

/**
 * O resumo em reais (§4.2): uma linha por número, uma coluna por carteira, na ordem escolhida. É
 * também a alternativa em texto ao gráfico. Embaixo, os avisos da rentabilidade de cada carteira.
 */
function SummaryTable({ data, onOpen }: { data: ComparisonData; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const none = <Dash meaning={t('portfolios.comparison.summary.none')} />;
  const rows: Array<[string, (item: ComparedPortfolio) => ReactNode]> = [
    ['type', (item) => <ShortType type={item.type} />],
    ['start', (item) => formatCalendarDay(item.startDate, language)],
    [
      'endValue',
      ({ performance }) =>
        performance.empty ? (
          <span className="comparison-empty">{t('portfolios.comparison.summary.empty')}</span>
        ) : (
          formatMoney(performance.endValue, language)
        ),
    ],
    [
      'netFlows',
      ({ performance }) => (performance.empty ? none : formatMoney(performance.netFlows, language)),
    ],
    [
      'result',
      ({ performance }) =>
        performance.empty ? (
          none
        ) : (
          <span className={`quote-change is-${changeDirection(performance.result)}`}>
            {signed(performance.result)}
            {formatMoney(performance.result, language)}
          </span>
        ),
    ],
    [
      'return',
      ({ performance }) =>
        performance.empty ? (
          none
        ) : (
          <>
            <span className={`quote-change is-${changeDirection(performance.return)}`}>
              {formatChange(performance.return, language)}
            </span>
            {performance.from > data.from && (
              <span className="comparison-started">
                {t('portfolios.comparison.summary.startedOn', {
                  date: formatCalendarDay(performance.from, language),
                })}
              </span>
            )}
          </>
        ),
    ],
    [
      'cdiShare',
      ({ performance }) =>
        performance.cdiShare
          ? t('portfolios.comparison.summary.cdiShareValue', {
              share: new Intl.NumberFormat(language).format(Number(performance.cdiShare)),
            })
          : none,
    ],
  ];
  const warnings = data.portfolios.flatMap((item) =>
    item.performance.warnings.map((warning) => ({ item, warning })),
  );

  return (
    <section className="profile-panel comparison-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('portfolios.comparison.summary.title')}</h2>
      <div className="comparison-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
        <table className="comparison-table">
          <thead>
            <tr>
              <td />
              <PortfolioColumns portfolios={data.portfolios} onOpen={onOpen} />
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, cell]) => (
              <tr key={name}>
                <th scope="row">{t(`portfolios.comparison.summary.${name}`)}</th>
                {data.portfolios.map((item) => (
                  <td key={item.id}>{cell(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {warnings.map(({ item, warning }) => (
        <p
          key={`${item.id}${warning.kind}${warning.assetId}${warning.kind === 'unexplained_jump' ? warning.date : warning.until}`}
          className="assets-note is-warning"
        >
          <Warning weight="fill" aria-hidden="true" />
          <span>
            <strong>{item.name}:</strong>{' '}
            {warning.kind === 'unexplained_jump'
              ? t('portfolios.performance.jump', {
                  ticker: warning.ticker,
                  date: formatCalendarDay(warning.date, language),
                })
              : t('portfolios.performance.noClose', {
                  ticker: warning.ticker,
                  date: formatCalendarDay(warning.until, language),
                })}{' '}
            <button type="button" className="link" onClick={() => onOpen(item.id)}>
              {t('portfolios.comparison.open', { name: item.name })}
            </button>
          </span>
        </p>
      ))}
    </section>
  );
}

/** §4.1, decisão 5: a composição de hoje, em % de cada carteira; "—" onde ela não tem nada. */
function CompositionTable({ portfolios }: { portfolios: readonly ComparedPortfolio[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const rows = compositionRows(portfolios.map((item) => item.allocation));
  return (
    <section className="profile-panel comparison-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('portfolios.comparison.composition.title')}</h2>
      {rows.length === 0 ? (
        <p className="assets-empty">{t('portfolios.comparison.composition.empty')}</p>
      ) : (
        <div className="comparison-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
          <table className="comparison-table">
            <thead>
              <tr>
                <td />
                <PortfolioColumns portfolios={portfolios} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.kind === 'class' ? row.assetClass : `${row.assetClass}:${row.sector}`}
                  className={row.kind === 'class' ? 'is-class' : 'is-sector'}
                >
                  <th scope="row">
                    {row.kind === 'class'
                      ? t(`portfolios.allocation.classes.${row.assetClass}`)
                      : t(`assets.sectors.${row.assetClass}.${row.sector}`)}
                  </th>
                  {row.values.map((value, column) => (
                    <td key={portfolios[column]?.id ?? column}>
                      {value === null ? (
                        <Dash meaning={t('portfolios.comparison.composition.none')} />
                      ) : (
                        formatShare(value, language)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="field-hint">{t('portfolios.comparison.composition.note')}</p>
    </section>
  );
}
