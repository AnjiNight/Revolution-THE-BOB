/**
 * SPEC-047 §4.1, decisão 3: notícia repetida entre fontes. Pelo endereço normalizado ou pelo título
 * quase igual, numa janela de 48 horas em volta da publicação.
 */

/** A janela em volta da publicação em que uma notícia de outra fonte pode ser a mesma. */
export const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Fração mínima de palavras em comum (Jaccard) para o título contar como o mesmo. */
export const TITLE_SIMILARITY = 0.8;

/** Títulos com menos palavras que isso só valem se forem iguais: poucas palavras enganam. */
const MIN_WORDS_FOR_SIMILAR = 4;

export type DuplicateReason = 'endereco' | 'titulo';

/** Uma notícia como a conferência a enxerga. */
export interface DuplicateCandidate {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  publishedAt: Date;
}

/**
 * Endereço sem `?`, `#`, `www.`, a barra do fim e em minúsculas no domínio: a mesma matéria com
 * parâmetros de campanha é o mesmo endereço.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * As palavras do título: sem acento, minúsculas, sem pontuação, sem o " - Nome do veículo" do fim
 * e sem as palavras de até 2 letras.
 */
export function titleWords(title: string): Set<string> {
  const withoutOutlet = title.replace(/\s+[-–—|]\s+[^-–—|]{2,60}$/, '');
  const words = withoutOutlet
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 2);
  return new Set(words);
}

/** Palavras em comum sobre o total das duas (Jaccard), de 0 a 1. */
export function titleSimilarity(a: string, b: string): number {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common += 1;
  return common / (left.size + right.size - common);
}

/** Os dois títulos são o mesmo (ou quase): decisão 3 (b). */
export function sameTitle(a: string, b: string): boolean {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.size === 0 || right.size === 0) return false;
  const similarity = titleSimilarity(a, b);
  if (Math.min(left.size, right.size) < MIN_WORDS_FOR_SIMILAR) return similarity === 1;
  return similarity >= TITLE_SIMILARITY;
}

/**
 * A original de uma notícia entre as candidatas, ou `null`. As candidatas são as notícias já
 * conferidas, que não são repetidas, na ordem em que valem como original (decisão 5): a primeira
 * que bater, de outra fonte e dentro de 48 horas, é a original. O endereço vale antes do título.
 */
export function findOriginal(
  news: DuplicateCandidate,
  candidates: readonly DuplicateCandidate[],
): { original: DuplicateCandidate; reason: DuplicateReason } | null {
  const near = candidates.filter(
    (candidate) =>
      candidate.id !== news.id &&
      candidate.sourceId !== news.sourceId &&
      Math.abs(candidate.publishedAt.getTime() - news.publishedAt.getTime()) <= DUPLICATE_WINDOW_MS,
  );
  const url = normalizeUrl(news.url);
  const byUrl = near.find((candidate) => normalizeUrl(candidate.url) === url);
  if (byUrl) return { original: byUrl, reason: 'endereco' };
  const byTitle = near.find((candidate) => sameTitle(candidate.title, news.title));
  return byTitle ? { original: byTitle, reason: 'titulo' } : null;
}
