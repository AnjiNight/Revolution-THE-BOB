import { normalizeSearchText } from '@simulador/shared';

interface Searchable {
  ticker: string;
  name: string;
}

/**
 * Busca por texto (SPEC-006 §4): ticker que começa com o texto ou nome que contém o texto, sem
 * diferenciar maiúsculas e acentos. Ordem: ticker igual, ticker que começa com o texto e, por
 * fim, nome. Sem texto, tudo em ordem de ticker.
 *
 * Roda em memória depois dos filtros do banco: o catálogo é curado (dezenas de ativos, DA16).
 */
export function searchAssets<T extends Searchable>(
  assets: readonly T[],
  text: string,
  limit = Number.POSITIVE_INFINITY,
): { assets: T[]; hasMore: boolean } {
  const query = normalizeSearchText(text);
  const tickerQuery = query.replace(/ /g, '').toUpperCase();

  const ranked = assets.flatMap((asset) => {
    const rank = rankOf(asset, query, tickerQuery);
    return rank === null ? [] : [{ asset, rank, name: normalizeSearchText(asset.name) }];
  });
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.rank === NAME_MATCH ? a.name.localeCompare(b.name) : 0) ||
      a.asset.ticker.localeCompare(b.asset.ticker),
  );
  return {
    assets: ranked.slice(0, limit).map((item) => item.asset),
    hasMore: ranked.length > limit,
  };
}

const EXACT_TICKER = 0;
const TICKER_PREFIX = 1;
const NAME_MATCH = 2;

function rankOf(asset: Searchable, query: string, tickerQuery: string): number | null {
  if (query === '') return TICKER_PREFIX;
  if (asset.ticker === tickerQuery) return EXACT_TICKER;
  if (tickerQuery !== '' && asset.ticker.startsWith(tickerQuery)) return TICKER_PREFIX;
  if (normalizeSearchText(asset.name).includes(query)) return NAME_MATCH;
  return null;
}
