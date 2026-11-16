import { NewsLayoutError, SUMMARY_MAX, TITLE_MAX } from './investidor10-news.js';
import { canonicalUrl, clip, decodeEntities, htmlToText, parseSourceDate } from './text.js';

/**
 * Feeds das fontes curadas (SPEC-027 §4.1, decisão 5): RSS 2.0 e Atom. Guarda o que o feed traz
 * (título, link, data e resumo, em texto puro), sem visitar a página. No máximo 200 itens.
 */

export const FEED_MAX_ITEMS = 200;

export interface FeedItem {
  url: string;
  title: string;
  summary: string | null;
  publishedAt: Date;
}

export function parseFeed(xml: string, now: Date): FeedItem[] {
  const isRss = /<rss\b|<rdf:RDF\b/i.test(xml);
  const isAtom = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml);
  if (!isRss && !isAtom) throw new NewsLayoutError('não é um feed RSS nem Atom');
  const blocks = [
    ...xml.matchAll(
      isRss ? /<item\b[^>]*>([\s\S]*?)<\/item>/gi : /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi,
    ),
  ].map((match) => match[1] ?? '');
  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, FEED_MAX_ITEMS)) {
    const title = field(block, 'title');
    const url = canonicalUrl(isRss ? (field(block, 'link') ?? '') : atomLink(block));
    if (!title || !url) continue;
    const date =
      parseSourceDate(
        isRss
          ? (field(block, 'pubDate') ?? field(block, 'dc:date'))
          : (field(block, 'published') ?? field(block, 'updated')),
      ) ?? now;
    const summary = isRss
      ? (field(block, 'description') ?? field(block, 'content:encoded'))
      : (field(block, 'summary') ?? field(block, 'content'));
    items.push({
      url,
      title: clip(title, TITLE_MAX),
      summary: summary ? clip(summary, SUMMARY_MAX) : null,
      // Data no futuro (fuso errado na fonte) vira a hora da coleta.
      publishedAt: date > now ? now : date,
    });
  }
  return items;
}

function field(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!match) return null;
  const text = htmlToText(match[1] ?? '');
  return text === '' ? null : text;
}

/** Atom: o `<link rel="alternate" href>` (ou o primeiro sem `rel`). */
function atomLink(block: string): string {
  let fallback = '';
  for (const match of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attributes = match[1] ?? '';
    const href = /\bhref=["']([^"']+)["']/i.exec(attributes)?.[1];
    if (!href) continue;
    const rel = /\brel=["']([^"']+)["']/i.exec(attributes)?.[1];
    if (!rel || rel === 'alternate') return decodeEntities(href);
    fallback ||= decodeEntities(href);
  }
  return fallback;
}
