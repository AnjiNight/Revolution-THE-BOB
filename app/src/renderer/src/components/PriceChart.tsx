import type { PriceJump, PricePoint } from '@simulador/shared';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { formatAxisPrice, formatCalendarDay, formatMoney, formatTickDate } from '../format';
import { nextNewsSession } from '../news-chart';
import { chartLayout, cursorAfterKey, nearestIndex, spaceTicks, timeTicks } from '../price-chart';

const HEIGHT = 260;
/** Distância mínima entre duas datas do eixo de baixo. */
const MIN_TICK_GAP = 58;
/** Metade da largura e a altura da caixa do cursor, para ela não sair do gráfico. */
const TOOLTIP_HALF = 70;
const TOOLTIP_HEIGHT = 44;
/** SPEC-029: o círculo de notícia e quanto em volta dele o clique ou o toque alcança. */
const MARKER_RADIUS = 5;
const MARKER_REACH = 12;
const NO_NEWS: ReadonlyMap<number, number> = new Map();

/**
 * Gráfico de linha dos fechamentos (SPEC-010 §4.2), desenhado pelo próprio app em SVG. Pelo mouse
 * ou toque, mostra a data e o fechamento do pregão mais perto; pelo teclado, o gráfico é um
 * controle deslizante: as setas andam um pregão, Page Up e Page Down um mês, Home e End vão às
 * pontas, e o leitor de tela lê a data e o preço. Os saltos de preço ficam marcados com uma linha
 * tracejada (a lista com o texto fica fora do gráfico). SPEC-029: os pregões com notícia ganham um
 * círculo na base; o clique, o toque ou Enter abrem o painel do pregão (fora do gráfico).
 */
export function PriceChart({
  points,
  jumps,
  label,
  news,
  selectedNews = null,
  onSelectNews,
}: {
  points: PricePoint[];
  jumps: PriceJump[];
  label: string;
  /** SPEC-029: pregão (índice) → quantas notícias; um círculo na base do gráfico em cada um. */
  news?: ReadonlyMap<number, number>;
  selectedNews?: number | null;
  onSelectNews?: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const hintId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  // O cursor guarda de qual série ele é: trocar o período não deixa o cursor num pregão errado.
  const [cursor, setCursor] = useState<{ points: PricePoint[]; index: number } | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = chartLayout(points, width, HEIGHT);
  const { box, axis, x, y } = layout;
  const ticks = spaceTicks(timeTicks(points.map((point) => point.date)), x, MIN_TICK_GAP);
  const jumpIndexes = jumps
    .map((jump) => points.findIndex((point) => point.date === jump.date))
    .filter((index) => index >= 0);
  const last = points.length - 1;
  const index = cursor?.points === points ? cursor.index : null;
  const shown = points[index ?? last];
  const newsMap = news ?? NO_NEWS;
  const hasNews = newsMap.size > 0;
  const describe = (point: PricePoint | undefined, at: number) => {
    if (!point) return undefined;
    const text = t('detail.history.cursor', {
      date: formatCalendarDay(point.date, language),
      price: formatMoney(point.close, language),
    });
    const count = newsMap.get(at);
    return count ? `${text}, ${t('detail.news.count', { count })}` : text;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // SPEC-029: N e Shift+N pulam entre os pregões com notícia; Enter abre o do cursor.
    if (hasNews && event.key.toLowerCase() === 'n') {
      const direction = event.shiftKey ? -1 : 1;
      const from = index ?? (direction === 1 ? -1 : points.length);
      const target = nextNewsSession(newsMap, from, direction);
      event.preventDefault();
      if (target !== null) setCursor({ points, index: target });
      return;
    }
    if (event.key === 'Enter' && index !== null && newsMap.has(index)) {
      event.preventDefault();
      onSelectNews?.(index);
      return;
    }
    const next = cursorAfterKey(event.key, index, points.length);
    if (next === null) return;
    event.preventDefault();
    setCursor({ points, index: next });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor({ points, index: nearestIndex(event.clientX - rect.left, points.length, box) });
  };

  // Clique ou toque perto de um marcador (até 12 px para cada lado: 24 px de área de toque).
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!hasNews || !onSelectNews) return;
    const left = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let closest: number | null = null;
    for (const at of newsMap.keys()) {
      const distance = Math.abs(x(at) - left);
      if (
        distance <= MARKER_REACH &&
        (closest === null || distance < Math.abs(x(closest) - left))
      ) {
        closest = at;
      }
    }
    if (closest !== null) onSelectNews(closest);
  };

  const point = index !== null ? points[index] : undefined;
  const pointX = index !== null ? x(index) : 0;
  const pointY = point ? y(Number(point.close)) : 0;
  // A caixa fica logo acima do ponto; perto do alto do gráfico, logo abaixo.
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
        aria-valuetext={describe(shown, index ?? last)}
        onKeyDown={onKeyDown}
        onClick={onClick}
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
          <path className="chart-line" d={layout.line} />
          {jumpIndexes.map((jumpIndex) => (
            <line
              key={jumpIndex}
              className="chart-jump"
              x1={x(jumpIndex)}
              x2={x(jumpIndex)}
              y1={box.top}
              y2={box.bottom}
            />
          ))}
          {[...newsMap.keys()].map((at) => (
            <circle
              key={`news-${at}`}
              className={`chart-news${at === selectedNews ? ' is-selected' : ''}`}
              cx={x(at)}
              cy={box.bottom - MARKER_RADIUS - 2}
              r={MARKER_RADIUS}
            />
          ))}
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
            <strong>{formatMoney(point.close, language)}</strong>
            <span>{formatCalendarDay(point.date, language)}</span>
          </div>
        )}
      </div>
      <p id={hintId} className="visually-hidden">
        {t('detail.history.chartHint')}
        {hasNews && ` ${t('detail.news.chartHint')}`}
      </p>
      {hasNews && (
        <p className="chart-news-legend" aria-hidden="true">
          <span className="chart-news-dot" />
          {t('detail.news.legend')}
        </p>
      )}
    </div>
  );
}
