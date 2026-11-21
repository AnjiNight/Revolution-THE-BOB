import { describe, expect, it } from 'vitest';
import { archiveSitemap, articleHtml, newsSitemap } from '../testing/fakes.js';
import { isLocalHostname, isPrivateAddress } from './address.js';
import { FEED_MAX_ITEMS, parseFeed } from './feed.js';
import {
  isArticleUrl,
  NewsLayoutError,
  parseArchiveSitemap,
  parseNewsArticle,
  parseNewsSitemap,
} from './investidor10-news.js';
import { canonicalUrl, htmlToText } from './text.js';

const NOW = new Date('2026-11-12T21:00:00Z');
const A = 'https://investidor10.com.br/noticias/petrobras-pode-pagar-20-em-dividendos-123866/';
const B = 'https://investidor10.com.br/noticias/outlook-fora-do-ar-123863/';

describe('texto puro (SPEC-027 §4.2)', () => {
  it('tira marcas, scripts e entidades, inclusive HTML escondido em entidade (RSS)', () => {
    expect(htmlToText('<p>A &amp; B</p><script>alert(1)</script><p>C&nbsp;D &#8212; E</p>')).toBe(
      'A & B\nC D — E',
    );
    expect(htmlToText('&lt;p&gt;&lt;strong&gt;Banco&lt;/strong&gt; diz&lt;/p&gt;')).toBe(
      'Banco diz',
    );
    expect(htmlToText('<![CDATA[<b>Título</b>]]>')).toBe('Título');
  });

  it('endereço sem # nem parâmetros é a chave', () => {
    expect(canonicalUrl(' https://site.com/a/?utm=x#topo ')).toBe('https://site.com/a/');
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('Investidor10: sitemaps e página da notícia (SPEC-027 §4.1, decisões 2 e 3)', () => {
  it('sitemap de notícias: endereço, título e data; páginas que não são notícia ficam de fora', () => {
    const xml = newsSitemap([
      { url: A, title: 'Petrobras &amp; dividendos', date: '2026-11-12T17:03:25-03:00' },
      { url: 'https://investidor10.com.br/noticias/ativo/petrobras/', title: 'x', date: '' },
    ]);
    expect(parseNewsSitemap(xml)).toEqual([
      {
        url: A,
        title: 'Petrobras & dividendos',
        publishedAt: new Date('2026-11-12T20:03:25Z'),
      },
    ]);
    expect(() => parseNewsSitemap('<html></html>')).toThrow(NewsLayoutError);
  });

  it('arquivo: o número da notícia e o lastmod; sem as páginas "Notícias sobre"', () => {
    const entries = parseArchiveSitemap(
      archiveSitemap([{ url: A, lastmod: '2026-11-12T17:03:25-03:00' }, { url: B }]),
    );
    expect(entries).toEqual([
      { url: A, id: 123866, lastModified: new Date('2026-11-12T20:03:25Z') },
      { url: B, id: 123863, lastModified: null },
    ]);
    expect(isArticleUrl('https://investidor10.com.br/noticias/tema/dividendos/')).toBe(false);
  });

  it('página: NewsArticle, resumo da descrição, temas e empresas só da matéria (sem o menu)', () => {
    const article = parseNewsArticle(
      articleHtml({
        title: 'Petrobras (PETR4) pode pagar 20% em dividendos',
        published: '2026-11-12T17:03:25-03:00',
        modified: '2026-11-12T18:00:00-03:00',
        body: 'Linha 1\nLinha 2',
        themes: ['Dividendos', 'Petróleo'],
        companies: ['Petrobras', 'PRIO'],
      }),
    );
    expect(article).toEqual({
      title: 'Petrobras (PETR4) pode pagar 20% em dividendos',
      summary: 'Resumo de Petrobras (PETR4) pode pagar 20% em dividendos & mais',
      // As quebras de parágrafo do texto ficam.
      body: 'Linha 1\nLinha 2',
      author: 'Autora Teste',
      publishedAt: new Date('2026-11-12T20:03:25Z'),
      updatedAt: new Date('2026-11-12T21:00:00Z'),
      themes: ['Dividendos', 'Petróleo'],
      companies: ['Petrobras', 'PRIO'],
    });
  });

  it('página sem os dados estruturados ou sem data: erro de layout', () => {
    expect(() => parseNewsArticle('<html><h1>Sem dados</h1></html>')).toThrow(NewsLayoutError);
    const noDate = articleHtml({ title: 'X', published: 'ontem' });
    expect(() => parseNewsArticle(noDate)).toThrow(NewsLayoutError);
  });
});

describe('feeds RSS e Atom das fontes curadas (SPEC-027 §4.1, decisão 5)', () => {
  it('RSS 2.0: título, link, data e resumo em texto puro', () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
      <item><title>BB aponta recusa</title><link>https://agenciabrasil.ebc.com.br/economia/noticia/a</link>
      <description>&lt;p&gt;&lt;strong&gt;A presidenta&lt;/strong&gt; afirmou&lt;/p&gt;</description>
      <pubDate>Thu, 12 Nov 2026 17:33:00 -0300</pubDate></item>
      <item><title></title><link>https://x.com/sem-titulo</link></item>
    </channel></rss>`;
    expect(parseFeed(rss, NOW)).toEqual([
      {
        url: 'https://agenciabrasil.ebc.com.br/economia/noticia/a',
        title: 'BB aponta recusa',
        summary: 'A presidenta afirmou',
        publishedAt: new Date('2026-11-12T20:33:00Z'),
      },
    ]);
  });

  it('Atom: link alternate; data no futuro vira a hora da coleta; no máximo 200 itens', () => {
    const entries = Array.from(
      { length: FEED_MAX_ITEMS + 5 },
      (_, i) => `<entry><title>Item ${i}</title><link rel="self" href="https://x.com/self/${i}"/>
        <link rel="alternate" href="https://x.com/${i}"/><updated>2030-01-01T00:00:00Z</updated>
        <summary>Resumo ${i}</summary></entry>`,
    ).join('');
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>${entries}</feed>`;
    const items = parseFeed(atom, NOW);
    expect(items).toHaveLength(FEED_MAX_ITEMS);
    expect(items[0]).toEqual({
      url: 'https://x.com/0',
      title: 'Item 0',
      summary: 'Resumo 0',
      publishedAt: NOW,
    });
  });

  it('página HTML não é feed', () => {
    expect(() => parseFeed('<html><body>oi</body></html>', NOW)).toThrow(NewsLayoutError);
  });
});

describe('endereços da rede interna (SPEC-027 §4.2, DA19)', () => {
  it('IPv4 e IPv6 privados, reservados e o IPv4 dentro do IPv6', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '192.168.1.10',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
      'não é ip',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['200.152.33.10', '8.8.8.8', '2804:14c::1', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('api.internal')).toBe(true);
    expect(isLocalHostname('agenciabrasil.ebc.com.br')).toBe(false);
  });
});
