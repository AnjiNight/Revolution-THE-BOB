import { describe, expect, it } from 'vitest';
import { InMemoryNewsRepository, InMemorySentimentRepository } from '../testing/fakes.js';
import { NewsDeduplicator } from './news-deduplicator.js';
import type { NewsToSave } from './ports.js';

const item = (fields: Partial<NewsToSave> = {}): NewsToSave => ({
  url: 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-11/copom-selic',
  title: 'Copom mantém a Selic em 15% ao ano pela terceira reunião seguida',
  summary: null,
  body: null,
  author: null,
  themes: [],
  companies: [],
  publishedAt: new Date('2026-11-21T12:00:00Z'),
  updatedAt: null,
  ...fields,
});

function setup() {
  const news = new InMemoryNewsRepository();
  const valor = {
    ...news.agency,
    id: 'valor',
    name: 'Valor Econômico',
    url: 'https://valor.globo.com/rss/valor',
    reliability: 4,
  };
  news.list.push(valor);
  const clock = () => new Date('2026-11-21T15:00:00Z');
  return { news, valor, deduplicator: new NewsDeduplicator({ news, clock, batch: 2 }) };
}

describe('NewsDeduplicator (SPEC-047)', () => {
  it('a primeira coletada fica; a de outra fonte com o título quase igual vira repetida', async () => {
    const { news, valor, deduplicator } = setup();
    await news.saveNews(news.agency.id, [item()], new Date('2026-11-21T12:05:00Z'));
    await news.saveNews(
      valor.id,
      [
        item({
          url: 'https://valor.globo.com/financas/noticia/2026/11/21/copom.ghtml',
          title: 'Copom mantém a Selic em 15% ao ano pela terceira reunião seguida - Valor',
        }),
        // O mesmo assunto, outra matéria: continua uma notícia.
        item({
          url: 'https://valor.globo.com/financas/noticia/2026/11/21/bancos.ghtml',
          title: 'Bancos comemoram Selic parada e preveem crédito mais caro em 2027',
        }),
      ],
      new Date('2026-11-21T12:10:00Z'),
    );

    expect(await deduplicator.run()).toEqual({ checked: 3, duplicates: 1 });
    const original = news.news.find((n) => n.sourceId === news.agency.id);
    const copy = news.news.find((n) => n.url.endsWith('copom.ghtml'));
    expect(copy?.duplicateOf).toEqual({ originalId: original?.id, reason: 'titulo' });
    expect(news.news.filter((n) => n.duplicateOf)).toHaveLength(1);
    expect((await news.duplicateCounts()).get(valor.id)).toBe(1);

    // Conferidas uma vez só.
    expect(await deduplicator.run()).toEqual({ checked: 0, duplicates: 0 });
  });

  it('a repetida perde o vínculo e o sentimento e sai do vínculo, da lista e da classificação', async () => {
    const { news, valor, deduplicator } = setup();
    const sentiment = new InMemorySentimentRepository(news);
    await news.saveNews(news.agency.id, [item()], new Date('2026-11-21T12:05:00Z'));
    await news.saveNews(
      valor.id,
      [item({ url: 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-11/copom-selic?r=1' })],
      new Date('2026-11-21T12:10:00Z'),
    );
    const copy = news.news[1];
    if (!copy) throw new Error('sem a cópia');
    copy.links = [{ assetId: 'a1', relevance: 'principal', origin: 'ticker_titulo' }];
    copy.linkVersion = 1;

    await deduplicator.run();
    expect(copy.duplicateOf?.reason).toBe('endereco');
    expect(copy.links).toEqual([]);
    expect((await news.newsToLink(99, 10)).map((n) => n.id)).not.toContain(copy.id);
    expect((await news.latestNews(10)).map((n) => n.id)).not.toContain(copy.id);
    expect((await sentiment.newsToClassify(1, 10)).map((n) => n.id)).not.toContain(copy.id);
    expect((await sentiment.classifiedCounts(1)).total).toBe(1);
  });

  it('fora das 48 horas ou da mesma fonte, não é repetida', async () => {
    const { news, valor, deduplicator } = setup();
    await news.saveNews(news.agency.id, [item()], new Date('2026-11-21T12:05:00Z'));
    await news.saveNews(
      news.agency.id,
      [item({ url: 'https://agenciabrasil.ebc.com.br/economia/outra' })],
      new Date('2026-11-21T12:06:00Z'),
    );
    await news.saveNews(
      valor.id,
      [
        item({
          url: 'https://valor.globo.com/x',
          publishedAt: new Date('2026-11-24T12:00:00Z'),
        }),
      ],
      new Date('2026-11-24T12:10:00Z'),
    );
    expect(await deduplicator.run()).toEqual({ checked: 3, duplicates: 0 });
  });
});
