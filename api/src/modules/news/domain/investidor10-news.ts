import { canonicalUrl, clip, decodeEntities, htmlToText, parseSourceDate } from './text.js';

/**
 * Leitura das notícias do Investidor10 (SPEC-027 §4.1, decisões 2 a 4), pelos caminhos que o
 * próprio site publica para buscadores: o sitemap de notícias, o sitemap do arquivo e os dados
 * estruturados `NewsArticle` de cada página. Funções puras, testadas com arquivos de exemplo.
 */

export class NewsLayoutError extends Error {}

/** Uma notícia do sitemap de notícias (as ~50 mais recentes). */
export interface SitemapNews {
  url: string;
  title: string | null;
  publishedAt: Date | null;
}

/** Uma notícia do sitemap do arquivo: o número no fim do endereço e a última alteração. */
export interface ArchiveEntry {
  url: string;
  id: number;
  lastModified: Date | null;
}

export interface ParsedArticle {
  title: string;
  summary: string | null;
  body: string | null;
  author: string | null;
  publishedAt: Date;
  updatedAt: Date | null;
  themes: string[];
  companies: string[];
}

export const TITLE_MAX = 500;
export const SUMMARY_MAX = 1_000;
export const AUTHOR_MAX = 150;

function blocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map(
    (match) => match[1] ?? '',
  );
}

function inner(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!match) return null;
  const text = htmlToText(match[1] ?? '');
  return text === '' ? null : text;
}

/** `/sitemap-news.xml`: endereço, título e data de publicação. */
export function parseNewsSitemap(xml: string): SitemapNews[] {
  if (!/<urlset\b/i.test(xml)) throw new NewsLayoutError('sitemap de notícias sem <urlset>');
  const news: SitemapNews[] = [];
  for (const block of blocks(xml, 'url')) {
    const url = canonicalUrl(decodeEntities(inner(block, 'loc') ?? ''));
    if (!url || !isArticleUrl(url)) continue;
    news.push({
      url,
      title: inner(block, 'news:title'),
      publishedAt: parseSourceDate(inner(block, 'news:publication_date')),
    });
  }
  return news;
}

/** `/noticias/sitemap.xml`: só as notícias (endereço terminado em "-número/"), sem as páginas de ativo. */
export function parseArchiveSitemap(xml: string): ArchiveEntry[] {
  if (!/<urlset\b/i.test(xml)) throw new NewsLayoutError('sitemap do arquivo sem <urlset>');
  const entries: ArchiveEntry[] = [];
  for (const block of blocks(xml, 'url')) {
    const url = canonicalUrl(decodeEntities(inner(block, 'loc') ?? ''));
    const id = url ? articleId(url) : null;
    if (!url || id === null) continue;
    entries.push({ url, id, lastModified: parseSourceDate(inner(block, 'lastmod')) });
  }
  return entries;
}

function articleId(url: string): number | null {
  const match = /\/noticias\/(?!ativo\/|tema\/|categoria\/|autor\/)[^/]+-(\d+)\/$/.exec(
    new URL(url).pathname,
  );
  return match ? Number(match[1]) : null;
}

export function isArticleUrl(url: string): boolean {
  return articleId(url) !== null;
}

/**
 * A página da notícia: os dados do `NewsArticle` (título, texto, datas e autor), o resumo da
 * descrição da página e os temas e empresas que o site marca ("Notícias sobre Petrobras").
 */
export function parseNewsArticle(html: string): ParsedArticle {
  const article = findNewsArticle(html);
  if (!article) throw new NewsLayoutError('página sem os dados estruturados NewsArticle');
  const title = text(article.headline);
  const publishedAt = parseSourceDate(text(article.datePublished));
  if (!title || !publishedAt) throw new NewsLayoutError('NewsArticle sem título ou sem data');
  const body = text(article.articleBody);
  const description = metaContent(html, 'description') ?? metaContent(html, 'og:description');
  // Temas e empresas só da matéria: o menu do site (antes do título) tem links de tema também.
  const content = html.slice(Math.max(0, html.search(/<h1\b/i)));
  return {
    title: clip(title, TITLE_MAX),
    summary: description ? clip(description, SUMMARY_MAX) : body ? clip(body, SUMMARY_MAX) : null,
    body,
    author: authorName(article.author),
    publishedAt,
    updatedAt: parseSourceDate(text(article.dateModified)),
    themes: linkTexts(content, /\/noticias\/tema\/[^/"']+\/?/),
    companies: linkTexts(content, /\/noticias\/ativo\/[^/"']+\/?/).map((name) =>
      name.replace(/^Notícias sobre\s+/i, ''),
    ),
  };
}

type Json = Record<string, unknown>;

function findNewsArticle(html: string): Json | null {
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let parsed: unknown;
    try {
      // O texto da matéria pode trazer quebras de linha cruas dentro das aspas.
      parsed = JSON.parse(withoutControlCharacters(match[1] ?? ''));
    } catch {
      continue;
    }
    const items = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Json)['@graph'])
        ? ((parsed as Json)['@graph'] as unknown[])
        : [parsed];
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const type = (item as Json)['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((value) => typeof value === 'string' && /NewsArticle|^Article$/.test(value))) {
        return item as Json;
      }
    }
  }
  return null;
}

/** Caracteres de controle (código abaixo de 32) viram espaço: o JSON não aceita os crus. */
function withoutControlCharacters(json: string): string {
  let result = '';
  for (const char of json) result += char.charCodeAt(0) < 32 ? ' ' : char;
  return result;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = htmlToText(value);
  return clean === '' ? null : clean;
}

function authorName(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const name =
    typeof first === 'string'
      ? first
      : typeof first === 'object' && first !== null
        ? (first as Json).name
        : null;
  const clean = text(name);
  return clean ? clip(clean, AUTHOR_MAX) : null;
}

function metaContent(html: string, name: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = /\b(?:name|property)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (key?.toLowerCase() !== name) continue;
    const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1];
    const clean = content ? htmlToText(content) : '';
    if (clean) return clean;
  }
  return null;
}

/** Os textos dos links cujo endereço bate com o padrão, sem repetir, na ordem da página. */
function linkTexts(html: string, href: RegExp): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const link = /\bhref=["']([^"']+)["']/i.exec(match[1] ?? '')?.[1];
    if (!link || !href.test(link)) continue;
    const label = htmlToText(match[2] ?? '');
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    result.push(clip(label, 80));
  }
  return result;
}
