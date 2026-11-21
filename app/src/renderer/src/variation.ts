import {
  CALENDAR_TIME_ZONE,
  FREE_QUOTE_DELAY_MINUTES,
  isoDateInBrasilia,
  isWeekend,
  type DayChange,
  type IsoDate,
} from '@simulador/shared';
import type { VariationNotice } from '../../shared/auth-ipc';
import { formatMoney, quoteMoment } from './format';

type Translate = (key: string, values: Record<string, unknown>) => string;

/** SPEC-033: os limiares que a pessoa escolhe em Meu perfil, em % de variação no dia. */
export const VARIATION_THRESHOLDS = [3, 5, 10] as const;
export type VariationThreshold = (typeof VARIATION_THRESHOLDS)[number];

export interface VariationSettings {
  enabled: boolean;
  threshold: VariationThreshold;
}

/** Ligados por padrão, com 5% (SPEC-033, decisão 5): a pessoa descobre o recurso. */
export const DEFAULT_VARIATION_SETTINGS: VariationSettings = { enabled: true, threshold: 5 };

/** De quanto em quanto tempo o app confere, com a janela aberta ou minimizada. */
export const CHECK_INTERVAL_MS = 5 * 60_000;

/** Das 10:30 às 18:30 de Brasília (o horário das coletas do pregão, SPEC-009), em minutos. */
const CHECK_FROM = 10 * 60 + 30;
const CHECK_UNTIL = 18 * 60 + 30;

/** Mais ativos que isso numa mesma conferência viram um aviso só, com a lista. */
export const GROUP_AFTER = 3;

/** Quantos nomes (de carteiras ou de ativos) o aviso mostra; os outros viram "e mais N". */
const LISTED = 3;

/** Os tamanhos que o processo principal aceita (`isVariationNotice`). */
const TITLE_MAX = 120;
const BODY_MAX = 300;

export function isThreshold(value: unknown): value is VariationThreshold {
  return VARIATION_THRESHOLDS.some((threshold) => threshold === value);
}

/** A escolha guardada; o que faltar ou vier estranho fica com o padrão. */
export function parseSettings(raw: string | null): VariationSettings {
  const value = parseJson(raw);
  if (value === null) return DEFAULT_VARIATION_SETTINGS;
  return {
    enabled:
      typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_VARIATION_SETTINGS.enabled,
    threshold: isThreshold(value.threshold)
      ? value.threshold
      : DEFAULT_VARIATION_SETTINGS.threshold,
  };
}

/**
 * Os avisos já dados hoje, um por ativo em cada sentido (`<id>:up`, `<id>:down`). Os de outro dia
 * não valem mais: cada pregão começa do zero.
 */
export function parseSent(raw: string | null, today: IsoDate): Set<string> {
  const value = parseJson(raw);
  if (value === null || value.date !== today || !Array.isArray(value.keys)) return new Set();
  return new Set(value.keys.filter((key): key is string => typeof key === 'string'));
}

export function serializeSent(today: IsoDate, keys: Iterable<string>): string {
  return JSON.stringify({ date: today, keys: [...keys] });
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * O que foi guardado nesta sessão. Sem o armazenamento local (indisponível ou recusado), a escolha
 * e os avisos dados valem até fechar o app, como o idioma (SPEC-035).
 */
const memory = new Map<string, string>();

function load(key: string): string | null {
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  memory.set(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Sem armazenamento: fica só na memória até fechar o app.
  }
}

/** Neste computador, para cada conta (SPEC-033, decisão 5). */
const settingsKey = (userId: string) => `simulador.avisos.${userId}`;
const sentKey = (userId: string) => `simulador.avisos-enviados.${userId}`;

export function readVariationSettings(userId: string): VariationSettings {
  return parseSettings(load(settingsKey(userId)));
}

export function saveVariationSettings(userId: string, settings: VariationSettings): void {
  store(settingsKey(userId), JSON.stringify(settings));
}

export function readSentToday(userId: string, today: IsoDate): Set<string> {
  return parseSent(load(sentKey(userId)), today);
}

export function saveSentToday(userId: string, today: IsoDate, keys: Iterable<string>): void {
  store(sentKey(userId), serializeSent(today, keys));
}

/** O dia e o minuto do dia em Brasília (PRE05), qualquer que seja o fuso deste computador. */
export function brasiliaClock(now: Date): { date: IsoDate; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CALENDAR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { date: isoDateInBrasilia(now), minutes: part('hour') * 60 + part('minute') };
}

/** Dia útil, das 10:30 às 18:30 de Brasília. Num feriado a rota vem vazia, e nada é avisado. */
export function inCheckWindow(now: Date): boolean {
  const { date, minutes } = brasiliaClock(now);
  return !isWeekend(date) && minutes >= CHECK_FROM && minutes <= CHECK_UNTIL;
}

export type Direction = 'up' | 'down';

/** Um ativo que passou do limiar e ainda não foi avisado hoje naquele sentido. */
export interface Move {
  asset: DayChange;
  /** A variação do dia, em %. */
  value: number;
  direction: Direction;
  /** O que fica guardado depois do aviso. */
  key: string;
}

/** Os ativos a avisar nesta conferência, da maior variação (para cima ou para baixo) à menor. */
export function pendingMoves(
  assets: readonly DayChange[],
  threshold: number,
  sent: ReadonlySet<string>,
): Move[] {
  const moves: Move[] = [];
  for (const asset of assets) {
    if (asset.change === null) continue;
    const value = Number(asset.change);
    if (!Number.isFinite(value) || value === 0 || Math.abs(value) < threshold) continue;
    const direction: Direction = value > 0 ? 'up' : 'down';
    const key = `${asset.assetId}:${direction}`;
    if (!sent.has(key)) moves.push({ asset, value, direction, key });
  }
  return moves.sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value) || a.asset.ticker.localeCompare(b.asset.ticker),
  );
}

/**
 * Os avisos desta conferência: até 3 ativos, um aviso para cada; mais que isso, um aviso só, com
 * os 3 maiores e "e mais N". No idioma da interface e sem valores da carteira.
 */
export function variationNotices(
  moves: readonly Move[],
  threshold: VariationThreshold,
  t: Translate,
  language: string,
): VariationNotice[] {
  if (moves.length <= GROUP_AFTER) return moves.map((move) => assetNotice(move, t, language));
  return [groupNotice(moves, threshold, t, language)];
}

/** "PETR4 subiu 5,2% hoje" / "R$ 38,40 às 14:30 (atraso de até 45 min) · Carteiras: A e B". */
function assetNotice(
  { asset, value, direction }: Move,
  t: Translate,
  language: string,
): VariationNotice {
  const quote = t('alerts.notice.quote', {
    price: formatMoney(asset.price, language),
    time: quoteMoment(asset.at, language).time,
    delay: FREE_QUOTE_DELAY_MINUTES,
  });
  const names = asset.portfolios.map((portfolio) => portfolio.name);
  const body =
    names.length > 0
      ? `${quote} · ${t('alerts.notice.portfolios', { count: names.length, names: listText(names, t, language) })}`
      : quote;
  return {
    title: clip(
      t(`alerts.notice.${direction}`, {
        ticker: asset.ticker,
        change: percent(Math.abs(value), language),
      }),
      TITLE_MAX,
    ),
    body: clip(body, BODY_MAX),
    target: { kind: 'asset', assetId: asset.assetId },
  };
}

/** "5 ativos das suas carteiras caíram 5% ou mais hoje" / "VALE3 -6,1%, … e mais 2". */
function groupNotice(
  moves: readonly Move[],
  threshold: VariationThreshold,
  t: Translate,
  language: string,
): VariationNotice {
  const kind = moves.every((move) => move.direction === 'up')
    ? 'groupUp'
    : moves.every((move) => move.direction === 'down')
      ? 'groupDown'
      : 'groupMixed';
  const limit = new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(threshold / 100);
  const items = moves.map((move) => `${move.asset.ticker} ${percent(move.value, language, true)}`);
  return {
    title: clip(t(`alerts.notice.${kind}`, { total: moves.length, threshold: limit }), TITLE_MAX),
    body: clip(listText(items, t, language), BODY_MAX),
    target: { kind: 'portfolios' },
  };
}

/** Variação com uma casa, como no aviso: "5,2%"; com sinal na lista do agrupado: "-6,1%". */
function percent(value: number, language: string, signed = false): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  }).format(value / 100);
}

/** "A e B", "A, B e C"; com mais que 3, "A, B, C e mais 2". */
function listText(items: readonly string[], t: Translate, language: string): string {
  if (items.length <= LISTED) {
    return new Intl.ListFormat(language, { type: 'conjunction' }).format(items);
  }
  return t('alerts.notice.more', {
    items: items.slice(0, LISTED).join(', '),
    more: items.length - LISTED,
  });
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
