import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryNewsRepository } from '../testing/fakes.js';
import { NewsLinker } from './news-linker.js';

const at = new Date('2026-11-13T12:00:00Z');

describe('vinculador de notícias (SPEC-028, CA04)', () => {
  let repo: InMemoryNewsRepository;

  const save = (n: number, title: string, body = '') =>
    repo.saveNews(
      repo.parent.id,
      [
        {
          url: `https://investidor10.com.br/noticias/n-${n}/`,
          title,
          summary: null,
          body,
          author: null,
          themes: [],
          companies: [],
          publishedAt: new Date(`2026-11-1${n}T12:00:00Z`),
          updatedAt: null,
        },
      ],
      at,
    );

  beforeEach(() => {
    repo = new InMemoryNewsRepository();
    repo.catalog.push(
      { assetId: 'petr4', ticker: 'PETR4', name: 'PETROBRAS', active: true },
      { assetId: 'vale3', ticker: 'VALE3', name: 'VALE S.A.', active: true },
    );
  });

  it('vincula as notícias sem vínculo, em lotes, e não repete as já vinculadas', async () => {
    await save(1, 'PETR4 sobe');
    await save(2, 'VALE3 cai', 'E a PETR4 também');
    await save(3, 'Dólar sobe');
    const linker = new NewsLinker({ news: repo, clock: () => at, batch: 2 });

    expect(await linker.run()).toBe(3);
    expect(repo.news.map((n) => [n.title, n.links.map((l) => l.relevance)])).toEqual([
      ['PETR4 sobe', ['principal']],
      ['VALE3 cai', ['principal', 'citado']],
      ['Dólar sobe', []],
    ]);
    expect(await linker.run()).toBe(0);
    expect(await repo.linkCounts()).toEqual({ total: 3, linked: 2 });
  });

  it('texto atualizado na fonte e versão nova da regra: vínculo refeito', async () => {
    await save(1, 'Dólar sobe');
    await new NewsLinker({ news: repo, clock: () => at }).run();
    await save(1, 'Dólar sobe e PETR4 cai');
    expect(await new NewsLinker({ news: repo, clock: () => at }).run()).toBe(1);
    expect(repo.news[0]?.links).toEqual([
      { assetId: 'petr4', relevance: 'principal', origin: 'ticker_titulo' },
    ]);
    expect(await new NewsLinker({ news: repo, clock: () => at, version: 2 }).run()).toBe(1);
  });

  it('duas chamadas juntas não vinculam duas vezes', async () => {
    await save(1, 'PETR4 sobe');
    const linker = new NewsLinker({ news: repo, clock: () => at });
    const [a, b] = await Promise.all([linker.run(), linker.run()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(repo.news[0]?.links).toHaveLength(1);
  });
});
