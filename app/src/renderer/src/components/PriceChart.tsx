import type { PriceJump, PricePoint } from '@simulador/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAxisPrice, formatCalendarDay, formatMoney, formatTickDate } from '../format';
import { chartLayout, cursorAfterKey, nearestIndex, spaceTicks, timeTicks } from '../price-chart';

const HEIGHT = 260;
/** Distância mínima entre duas datas do eixo de baixo. */
const MIN_TICK_GAP = 58;
/** Metade da largura e a altura da caixa do cursor, para ela não sair do gráfico. */
const TOOLTIP_HALF = 70;
const TOOLTIP_HEIGHT = 44;

/**
 * Gráfico de linha dos fechamentos (SPEC-010 §4.2), desenhado pelo próprio app em SVG. Pelo mouse
 * ou toque, mostra a data e o fechamento do pregão mais perto; pelo teclado, o gráfico é um
 * controle deslizante: as setas andam um pregão, Page Up e Page Down um mês, Home e End vão às
 * pontas, e o leitor de tela lê a data e o preço. Os saltos de preço ficam marcados com uma linha
 * tracejada (a lista com o texto fica fora do gráfico).
 */
export function PriceChart({
  points,
  jumps,
  label,
}: {
  points: PricePoint[];
  jumps: PriceJump[];
  label: string;
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
  const describe = (point: PricePoint | undefined) =>
    point
      ? t('detail.history.cursor', {
          date: formatCalendarDay(point.date, language),
          price: formatMoney(point.close, language),
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
        aria-valuetext={describe(shown)}
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
      </p>
    </div>
  );
}
