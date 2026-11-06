import type { PricePoint } from '@simulador/shared';

/** Área do desenho dentro do SVG, em pixels. */
export interface ChartBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ValueAxis {
  low: number;
  high: number;
  step: number;
  ticks: number[];
}

export interface TimeTick {
  index: number;
  date: string;
  unit: 'day' | 'month' | 'year';
}

export interface ChartLayout {
  box: ChartBox;
  axis: ValueAxis;
  x: (index: number) => number;
  y: (value: number) => number;
  /** A linha dos fechamentos e a área embaixo dela. */
  line: string;
  area: string;
}

/** Espaço à direita para os preços do eixo e embaixo para as datas. */
const AXIS_WIDTH = 72;
const DATES_HEIGHT = 26;
const PADDING = 10;

/** Passo "redondo" do eixo: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 2.5, 5]) if (factor * power >= raw - 1e-12) return factor * power;
  return 10 * power;
}

/**
 * Eixo dos preços: de um passo redondo abaixo da mínima a um acima da máxima, com uns 4 intervalos.
 * Os números só posicionam a linha na tela; os valores mostrados vêm do servidor, em decimal.
 */
export function valueAxis(min: number, max: number, count = 4): ValueAxis {
  let low = min;
  let high = max;
  if (high - low < 1e-9) {
    const pad = Math.abs(low) * 0.05 || 1;
    low -= pad;
    high += pad;
  }
  const step = niceStep(high - low, count);
  const first = Math.floor(low / step + 1e-9);
  const last = Math.ceil(high / step - 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i += 1) ticks.push(Number((i * step).toFixed(10)));
  return { low: first * step, high: last * step, step, ticks };
}

/**
 * Marcas de data do eixo de baixo: o primeiro pregão de cada ano em períodos de mais de 2 anos, de
 * cada mês em mais de 2 meses, e um a cada 5 pregões (uma semana) nos períodos curtos. O começo do
 * período só ganha marca nos períodos curtos: nos outros, cairia no meio de um mês ou de um ano.
 */
export function timeTicks(dates: readonly string[]): TimeTick[] {
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return [];
  const spanDays = (Date.parse(last) - Date.parse(first)) / 86_400_000;
  const unit: TimeTick['unit'] = spanDays > 2 * 366 ? 'year' : spanDays > 62 ? 'month' : 'day';
  const ticks: TimeTick[] = [];
  dates.forEach((date, index) => {
    if (unit === 'day') {
      if (index % 5 === 0) ticks.push({ index, date, unit });
      return;
    }
    const length = unit === 'year' ? 4 : 7;
    const previous = dates[index - 1];
    if (previous !== undefined && previous.slice(0, length) !== date.slice(0, length)) {
      ticks.push({ index, date, unit });
    }
  });
  return ticks;
}

/** Tira as marcas que ficariam a menos de `minGap` pixels da anterior. */
export function spaceTicks(
  ticks: readonly TimeTick[],
  x: (index: number) => number,
  minGap: number,
): TimeTick[] {
  const kept: TimeTick[] = [];
  for (const tick of ticks) {
    const previous = kept.at(-1);
    if (!previous || x(tick.index) - x(previous.index) >= minGap) kept.push(tick);
  }
  return kept;
}

/** Posição de cada pregão e a linha dos fechamentos, para um SVG de `width` × `height`. */
export function chartLayout(
  points: readonly PricePoint[],
  width: number,
  height: number,
): ChartLayout {
  const box: ChartBox = {
    left: PADDING,
    right: Math.max(PADDING + 1, width - AXIS_WIDTH),
    top: PADDING,
    bottom: Math.max(PADDING + 1, height - DATES_HEIGHT),
  };
  const values = points.map((point) => Number(point.close));
  const axis = valueAxis(Math.min(...values), Math.max(...values));
  const count = points.length;
  const x = (index: number) =>
    count <= 1
      ? (box.left + box.right) / 2
      : box.left + (index / (count - 1)) * (box.right - box.left);
  const y = (value: number) =>
    box.bottom - ((value - axis.low) / (axis.high - axis.low)) * (box.bottom - box.top);
  const line = values
    .map(
      (value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`,
    )
    .join('');
  const area =
    count > 0
      ? `${line}L${x(count - 1).toFixed(1)} ${box.bottom}L${x(0).toFixed(1)} ${box.bottom}Z`
      : '';
  return { box, axis, x, y, line, area };
}

/** O pregão mais perto de uma posição horizontal (mouse ou toque). */
export function nearestIndex(px: number, count: number, box: ChartBox): number {
  if (count <= 1) return 0;
  const ratio = (px - box.left) / (box.right - box.left);
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

/** Teclas do cursor do gráfico: setas um pregão, Page Up e Page Down um mês, Home e End as pontas. */
export function cursorAfterKey(key: string, current: number | null, count: number): number | null {
  if (count === 0) return null;
  const last = count - 1;
  const from = current ?? last;
  const MONTH = 21;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(0, from - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(last, current === null ? last : from + 1);
    case 'PageDown':
      return Math.max(0, from - MONTH);
    case 'PageUp':
      return Math.min(last, from + MONTH);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}
