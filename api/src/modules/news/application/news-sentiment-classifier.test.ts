import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryNewsRepository, InMemorySentimentRepository } from '../testing/fakes.js';
import { NewsSentimentClassifier, type SentimentClassifier } from './news-sentiment-classifier.js';

const at = new Date('2026-11-19T12:00:00Z');

describe('classificação no processador (SPEC-044, CA02)', () => {
  let news: InMemoryNewsRepository;
  let repo: InMemorySentimentRepository;

  const save = (n: number, title: string) =>
    news.saveNews(
      news.parent.id,
      [
        {
          url: `https://investidor10.com.br/noticias/s-${n}/`,
          title,
          summary: null,
          body: null,
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
    news = new InMemoryNewsRepository();
    repo = new InMemorySentimentRepository(news);
  });

  it('registra a versão do dicionário e classifica as pendentes, em lotes, uma vez só', async () => {
    await save(1, 'Lucro dispara');
    await save(2, 'Ações desabam');
    await save(3, 'Empresa divulga agenda');
    const classifier = new NewsSentimentClassifier({ sentiment: repo, clock: () => at, batch: 2 });

    expect(await classifier.run()).toBe(3);
    expect(repo.versions).toMatchObject([{ id: 1, name: 'lexico', number: 1, status: 'in_use' }]);
    expect(news.news.map((n) => [n.title, n.classification?.sentiment])).toEqual([
      ['Lucro dispara', 'positive'],
      ['Ações desabam', 'negative'],
      ['Empresa divulga agenda', 'neutral'],
    ]);
    expect(news.news[0]?.classification).toMatchObject({ modelVersionId: 1, at });
    expect(await classifier.run()).toBe(0);
  });

  it('versão nova reclassifica todas; texto novo na fonte volta a ficar pendente', async () => {
    await save(1, 'Lucro dispara');
    await new NewsSentimentClassifier({ sentiment: repo, clock: () => at }).run();
    const v2: SentimentClassifier = {
      name: 'lexico',
      number: 2,
      classify: () => ({ sentiment: 'neutral', score: 0 }),
    };
    expect(
      await new NewsSentimentClassifier({ sentiment: repo, clock: () => at, classifier: v2 }).run(),
    ).toBe(1);
    expect(repo.versions.map((v) => v.status)).toEqual(['retired', 'in_use']);
    expect(news.news[0]?.classification).toMatchObject({ sentiment: 'neutral', modelVersionId: 2 });

    await save(1, 'Lucro dispara de novo');
    expect(news.news[0]?.classification).toBeNull();
  });

  it('notícia que o classificador não consegue ler fica pendente e não para as outras', async () => {
    await save(1, 'Boa');
    await save(2, 'Quebra');
    await save(3, 'Outra boa');
    const flaky: SentimentClassifier = {
      name: 'teste',
      number: 1,
      classify: (item) => {
        if (item.title === 'Quebra') throw new Error('falhou');
        return { sentiment: 'positive', score: 0.5 };
      },
    };
    const classifier = new NewsSentimentClassifier({
      sentiment: repo,
      clock: () => at,
      classifier: flaky,
      batch: 1,
    });
    expect(await classifier.run()).toBe(2);
    expect(news.news.map((n) => n.classification?.sentiment ?? null)).toEqual([
      'positive',
      null,
      'positive',
    ]);
  });

  it('duas chamadas juntas dividem uma execução', async () => {
    await save(1, 'Lucro dispara');
    const classifier = new NewsSentimentClassifier({ sentiment: repo, clock: () => at });
    const [a, b] = await Promise.all([classifier.run(), classifier.run()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(repo.versions).toHaveLength(1);
  });
});
