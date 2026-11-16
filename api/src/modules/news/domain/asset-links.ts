/**
 * Vínculo notícia–ativo (SPEC-028), puro (DA10): os tickers do catálogo citados na notícia, com a
 * relevância de cada um. Sem rede e sem banco; testado com textos de exemplo.
 */

/** Sobe quando a regra muda: as notícias vinculadas com a versão antiga são vinculadas de novo. */
export const LINK_RULE_VERSION = 1;
/** Acima disto, a notícia é uma lista ou agenda: todos os vínculos dela são de lista (§4.1, decisão 3). */
export const LIST_THRESHOLD = 8;

export type LinkRelevance = 'principal' | 'citado' | 'lista';
export type LinkOrigin = 'ticker_titulo' | 'ticker_texto' | 'empresa_marcada';

export interface CatalogTicker {
  assetId: string;
  ticker: string;
  name: string;
  active: boolean;
}

export interface NewsForLinking {
  title: string;
  body: string | null;
  summary: string | null;
  /** Empresas que o Investidor10 marca ("Petrobras", "Banco do Brasil"). */
  companies: readonly string[];
}

export interface AssetLink {
  assetId: string;
  ticker: string;
  relevance: LinkRelevance;
  origin: LinkOrigin;
}

/**
 * 4 letras e 1 ou 2 algarismos (3, 4, 11, mas também 55 e outros que a B3 usa, como RAIZ55); só vale
 * o que existe no catálogo, então sigla parecida fica de fora.
 */
const TICKER = /\b([A-Z]{4}\d{1,2})\b/g;

/** Palavras que não identificam a empresa: ficam de fora ao comparar o nome marcado. */
const GENERIC_WORDS = new Set([
  'banco',
  'bco',
  'grupo',
  'grupa',
  'energia',
  'construtora',
  'empreendimentos',
  'holding',
  'participacoes',
  'cia',
  'companhia',
  'do',
  'da',
  'de',
  'dos',
  'das',
  'e',
  's',
  'a',
  'sa',
]);

function tickersIn(text: string, catalog: ReadonlyMap<string, CatalogTicker>): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(TICKER)) {
    const ticker = match[1] as string;
    if (catalog.has(ticker) && !found.includes(ticker)) found.push(ticker);
  }
  return found;
}

function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "Grupa Ultra (Ultrapar)" → [["ultra"], ["ultrapar"]]: o nome e o apelido entre parênteses. */
function aliases(company: string): string[][] {
  const inParentheses = [...company.matchAll(/\(([^)]+)\)/g)].map((match) => match[1] ?? '');
  const outside = company.replace(/\([^)]*\)/g, ' ');
  return [outside, ...inParentheses]
    .map((alias) => words(alias).filter((word) => !GENERIC_WORDS.has(word)))
    .filter((alias) => alias.length > 0);
}

/** O nome do ativo no catálogo tem todas as palavras de um dos nomes da empresa marcada. */
export function matchesCompany(assetName: string, company: string): boolean {
  const name = new Set(words(assetName));
  return aliases(company).some((alias) => alias.every((word) => name.has(word)));
}

/**
 * Os vínculos da notícia (SPEC-028 §4.1): cada ticker do catálogo citado no título ou no texto.
 * Mais de 8 ativos: todos de lista. Senão, principal se está no título ou é de uma empresa marcada;
 * citado no resto. Empresa marcada sem ticker citado: todos os tickers ativos dela, como principal.
 */
export function linkNewsToAssets(
  news: NewsForLinking,
  catalog: ReadonlyMap<string, CatalogTicker>,
): AssetLink[] {
  const inTitle = tickersIn(news.title, catalog);
  const inText = tickersIn(`${news.summary ?? ''}\n${news.body ?? ''}`, catalog).filter(
    (ticker) => !inTitle.includes(ticker),
  );
  const cited = [...inTitle, ...inText];
  const marked = (ticker: string) =>
    news.companies.some((company) =>
      matchesCompany((catalog.get(ticker) as CatalogTicker).name, company),
    );

  const links: AssetLink[] = cited.map((ticker) => {
    const asset = catalog.get(ticker) as CatalogTicker;
    const origin: LinkOrigin = inTitle.includes(ticker) ? 'ticker_titulo' : 'ticker_texto';
    return {
      assetId: asset.assetId,
      ticker,
      relevance: inTitle.includes(ticker) || marked(ticker) ? 'principal' : 'citado',
      origin,
    };
  });

  // Empresa marcada sem nenhum ticker dela citado: os tickers ativos da empresa (decisão 4).
  for (const company of news.companies) {
    const citedHere = cited.some((ticker) =>
      matchesCompany((catalog.get(ticker) as CatalogTicker).name, company),
    );
    if (citedHere) continue;
    for (const asset of catalog.values()) {
      if (!asset.active || !matchesCompany(asset.name, company)) continue;
      if (links.some((link) => link.assetId === asset.assetId)) continue;
      links.push({
        assetId: asset.assetId,
        ticker: asset.ticker,
        relevance: 'principal',
        origin: 'empresa_marcada',
      });
    }
  }

  if (links.length > LIST_THRESHOLD) {
    return links.map((link) => ({ ...link, relevance: 'lista' }));
  }
  return links;
}
