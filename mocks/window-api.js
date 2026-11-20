/**
 * `window.api` falso para testar as telas do app no navegador, sem o Electron, sem o servidor e
 * sem login (validação visual das Specs). Os dados são fictícios.
 *
 * Uso:
 * - Playwright: `page.addInitScript({ path: 'mocks/window-api.js' })` antes de abrir
 *   http://localhost:5173 (o renderer do `npm run dev:app`).
 * - Opções, antes deste script: `window.__MOCK__ = { delayMs: 1500, scenario: 'vazio' }`.
 *   `scenario`: `normal` (padrão) ou `vazio` (só a fonte pai, sem arquivo, coleta desligada; e a
 *   ficha sem notícias). `role: 'user'` entra como usuária, para a ficha do ativo (SPEC-029).
 *   `failNews: true` faz as leituras de notícias da ficha falharem (servidor fora do ar).
 *   `sentiment: 'visible'` mostra o tom das notícias na ficha (SPEC-044); `evaluation` força a
 *   nota do "Avaliar agora" na tela do colaborador.
 * - As chamadas ficam em `window.__MOCK_CALLS__` (ex.: para conferir o clique duplo).
 */
(() => {
  const options = (window.__MOCK__ = window.__MOCK__ ?? {});
  const scenario = options.scenario ?? 'normal';
  const calls = (window.__MOCK_CALLS__ = []);
  // O atraso é lido a cada chamada: dá para mudar `window.__MOCK__.delayMs` no meio do teste.
  const wait = () => new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 0));
  const ok = async (data) => {
    await wait();
    return { ok: true, data };
  };
  const fail = async (error, fields) => {
    await wait();
    return { ok: false, error, ...(fields ? { fields } : {}) };
  };
  const notMocked = () => Promise.resolve({ ok: false, error: 'server_unavailable' });
  const group = (handlers) => new Proxy(handlers, { get: (t, k) => t[k] ?? notMocked });

  // Colaboradora fictícia ou, com `role: 'user'`, usuária fictícia.
  const user =
    options.role === 'user'
      ? {
          id: '00000000-0000-4000-8000-0000000000u1',
          name: 'Usuária Teste',
          email: 'usuaria@exemplo.test',
          role: 'user',
        }
      : {
          id: '00000000-0000-4000-8000-0000000000c1',
          name: 'Colaboradora Teste',
          email: 'colaboradora@exemplo.test',
          role: 'collaborator',
        };

  const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
  const parent = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'parent',
    name: 'Investidor10',
    url: 'https://investidor10.com.br/noticias/',
    category: null,
    reliability: null,
    active: true,
    lastRunAt: scenario === 'vazio' ? null : minutesAgo(12),
    lastStatus: scenario === 'vazio' ? null : 'success',
    lastError: null,
    failures: 0,
    news: scenario === 'vazio' ? 0 : 251,
  };
  const curated = [
    {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'curated',
      name: 'Agência Brasil – Economia',
      url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
      category: 'economia',
      reliability: 5,
      active: true,
      lastRunAt: minutesAgo(8),
      lastStatus: 'success',
      lastError: null,
      failures: 0,
      news: 10,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'curated',
      name: 'Feed Fictício Fora do Ar',
      url: 'https://feed-ficticio.exemplo.com.br/rss.xml',
      category: 'mercado',
      reliability: 2,
      active: true,
      lastRunAt: minutesAgo(8),
      lastStatus: 'failure',
      lastError: 'feed fora do ar: fetch failed',
      failures: 4,
      news: 0,
    },
  ];
  const status = {
    sources: scenario === 'vazio' ? [parent] : [parent, ...curated],
    archive:
      scenario === 'vazio'
        ? null
        : { done: 8000, total: 22491, status: 'running', updatedAt: minutesAgo(30) },
    parentEnabled: scenario !== 'vazio',
  };

  // SPEC-028: últimas notícias fictícias, com os vínculos.
  const latest =
    scenario === 'vazio'
      ? { total: 0, linked: 0, news: [] }
      : {
          total: 261,
          linked: 154,
          news: [
            {
              id: 'n1',
              title: 'Petróleo Fictício (PETR4) anuncia dividendos extraordinários',
              url: 'https://investidor10.com.br/noticias/exemplo-ficticio-1/',
              source: 'Investidor10',
              publishedAt: minutesAgo(20),
              links: [
                { ticker: 'PETR4', relevance: 'principal' },
                { ticker: 'PRIO3', relevance: 'citado' },
              ],
            },
            {
              id: 'n2',
              title: 'Agenda fictícia: 12 empresas divulgam resultados nesta semana',
              url: 'https://investidor10.com.br/noticias/exemplo-ficticio-2/',
              source: 'Investidor10',
              publishedAt: minutesAgo(65),
              links: [
                'BBAS3',
                'ITUB4',
                'VALE3',
                'WEGE3',
                'ABEV3',
                'B3SA3',
                'RENT3',
                'SUZB3',
                'GGBR4',
              ].map((ticker) => ({ ticker, relevance: 'lista' })),
            },
            {
              id: 'n3',
              title: 'Notícia fictícia sobre juros, sem ativo citado',
              url: 'https://agenciabrasil.ebc.com.br/economia/noticia/exemplo-ficticio-3',
              source: 'Agência Brasil – Economia',
              publishedAt: minutesAgo(90),
              links: [],
            },
          ],
        };

  // SPEC-029: ficha de um ativo fictício, com um ano de pregões (dias úteis até 16/11/2026).
  const asset = {
    id: '00000000-0000-4000-8000-0000000000a1',
    ticker: 'PETR4',
    name: 'PETRÓLEO FICTÍCIO S.A.',
    class: 'stock',
    sector: 'petroleo_gas_biocombustiveis',
    quote: null,
    hasLogo: false,
  };
  const points = [];
  for (let day = new Date('2025-11-17T00:00:00Z'); day <= new Date('2026-11-16T00:00:00Z');) {
    if (day.getUTCDay() % 6 !== 0) {
      const i = points.length;
      const close = 30 + 3 * Math.sin(i / 15) + i * 0.01;
      points.push({ date: day.toISOString().slice(0, 10), close: close.toFixed(2) });
    }
    day = new Date(day.getTime() + 86_400_000);
  }
  const lastPoint = points[points.length - 1];
  const detail = {
    ...asset,
    active: true,
    deactivatedAt: null,
    lastSession: null,
    history: { status: 'loaded', from: points[0].date, to: lastPoint.date },
  };
  const longSummary =
    'Resumo fictício e longo de uma fonte curada, para conferir que a lista mostra só três linhas. '.repeat(
      10,
    );
  // SPEC-044: com `sentiment: 'visible'`, a versão do modelo passou e as notícias têm o tom.
  const sentimentVisible = options.sentiment === 'visible';
  const model = sentimentVisible ? { name: 'lexico', number: 1 } : null;
  const tones = ['positive', 'neutral', 'negative', 'positive', null];
  let toneIndex = 0;
  const assetNews = (id, title, publishedAt, relevance, source = 'Investidor10', summary) => ({
    id,
    title,
    summary: summary ?? `Resumo fictício: ${title.toLowerCase()}.`,
    url: `https://investidor10.com.br/noticias/exemplo-ficticio-${id}/`,
    source,
    publishedAt,
    relevance,
    // Uma em cada cinco fica pendente (sem tom).
    sentiment: sentimentVisible ? tones[toneIndex++ % tones.length] : null,
  });
  const mainNews =
    scenario === 'vazio'
      ? []
      : [
          assetNews(
            'a1',
            'Petróleo Fictício (PETR4) anuncia dividendos extraordinários',
            '2026-11-16T13:00:00Z',
            'principal',
          ),
          assetNews(
            'a2',
            'Petróleo sobe no fim de semana fictício',
            '2026-11-14T15:00:00Z',
            'citado',
          ),
          assetNews(
            'a3',
            'PETR4 divulga resultado fictício do 3º trimestre à noite',
            '2026-11-11T22:30:00Z',
            'principal',
          ),
          assetNews(
            'a4',
            'Petróleo Fictício (PETR4) aprova nova plataforma',
            '2026-11-11T17:00:00Z',
            'principal',
          ),
          assetNews(
            'a5',
            'Ibovespa fictício fecha em alta com bancos e PETR4',
            '2026-11-11T14:00:00Z',
            'citado',
          ),
          assetNews(
            'a6',
            'Analistas fictícios revisam preço-alvo do setor',
            '2026-11-05T16:00:00Z',
            'citado',
          ),
          assetNews(
            'a7',
            'PETR4 fictícia anuncia recompra de ações',
            '2026-10-28T18:00:00Z',
            'principal',
          ),
          assetNews(
            'a8',
            'Produção de petróleo fictícia cresce no mês',
            '2026-10-20T13:00:00Z',
            'citado',
            'Agência Brasil – Economia',
            longSummary,
          ),
          assetNews(
            'a9',
            'Petróleo Fictício (PETR4) muda diretoria',
            '2026-10-02T15:00:00Z',
            'principal',
          ),
          assetNews(
            'a10',
            'Combustíveis fictícios ficam mais caros',
            '2026-09-15T15:00:00Z',
            'citado',
          ),
          assetNews(
            'a11',
            'PETR4 fictícia paga juros sobre capital próprio',
            '2026-08-03T15:00:00Z',
            'principal',
          ),
          assetNews('a12', 'Setor de energia fictício em foco', '2026-06-10T15:00:00Z', 'citado'),
        ];
  const listNews =
    scenario === 'vazio'
      ? []
      : [
          assetNews(
            'l1',
            'Agenda fictícia: 40 empresas divulgam resultados',
            '2026-11-09T12:00:00Z',
            'lista',
          ),
          assetNews('l2', 'Ranking fictício de dividendos do mês', '2026-10-30T12:00:00Z', 'lista'),
          assetNews(
            'l3',
            'Carteira fictícia recomendada de novembro',
            '2026-11-02T12:00:00Z',
            'lista',
          ),
        ];
  // Dia de referência (SPEC-029 §4.1, decisão 3): Brasília (UTC−3) mais 6 horas = UTC mais 3 horas.
  const referenceDay = (iso) =>
    new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
  const newsDays = () => {
    const days = new Map();
    for (const item of mainNews) {
      const key = referenceDay(item.publishedAt);
      const day = days.get(key) ?? { count: 0, tones: { positive: 0, neutral: 0, negative: 0 } };
      day.count += 1;
      if (item.sentiment) day.tones[item.sentiment] += 1;
      days.set(key, day);
    }
    return [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, { count, tones: counts }]) => ({
        day,
        count,
        sentiment: sentimentVisible ? counts : null,
      }));
  };

  // SPEC-044: a amostra rotulada pela colaboradora. `scenario: 'vazio'` não tem versão do modelo.
  const toLabel = [
    ['Petróleo Fictício (PETR4) lucra mais no trimestre', ['PETR4']],
    ['Banco Fictício (BBAS3) vê lucro cair 30%', ['BBAS3']],
    ['Notícia fictícia sobre a agenda do Copom', []],
    ['Varejista Fictícia (MGLU3) abre 20 lojas', ['MGLU3']],
    ['Mineradora Fictícia (VALE3) é multada', ['VALE3']],
  ].map(([title, principal], i) => ({
    id: `00000000-0000-4000-8000-0000000004${String(i).padStart(2, '0')}`,
    title,
    summary: `Resumo fictício: ${title.toLowerCase()}.`,
    url: `https://investidor10.com.br/noticias/rotular-ficticio-${i}/`,
    source: 'Investidor10',
    publishedAt: new Date(Date.UTC(2026, 10, 2 + i, 15)).toISOString(),
    principal,
  }));
  const labels = new Map();
  let evaluation = null;
  const summary = () => {
    const total = labels.size;
    const test = total - Math.floor(total * 0.6);
    const current =
      scenario === 'vazio'
        ? null
        : {
            name: 'lexico',
            number: 1,
            status: 'in_use',
            createdAt: '2026-11-19T12:00:00Z',
            evaluation,
          };
    const hiddenReason = !current
      ? 'no_model'
      : !evaluation
        ? 'not_evaluated'
        : evaluation.testSize < 60
          ? 'few_tests'
          : evaluation.macroF1 < 0.6
            ? 'low_score'
            : null;
    return {
      current,
      total: scenario === 'vazio' ? 0 : 261,
      classified: current ? 261 : 0,
      labels: { total, tuning: total - test, test },
      visible: hiddenReason === null,
      hiddenReason,
      history: [],
      recentLabels: [...labels]
        .reverse()
        .slice(0, 20)
        .map(([id, { label, at }]) => {
          const item = toLabel.find((n) => n.id === id);
          return {
            id,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            label,
            labeledAt: at,
          };
        }),
    };
  };

  window.api = {
    checkServerHealth: () => Promise.resolve({ kind: 'connected', version: 'mock' }),
    // SPEC-035: o idioma vai para o processo principal; aqui não há nada a fazer.
    setLanguage: () => Promise.resolve(),
    // SPEC-032: sempre conectado (o modo consulta não entra nestes testes).
    connection: {
      status: () => Promise.resolve({ offline: false }),
      retry: () => Promise.resolve({ ok: true }),
      onChange: () => () => {},
      onSavedAt: () => () => {},
    },
    auth: group({
      getSession: () => Promise.resolve({ ok: true, user }),
      googleAvailable: () => Promise.resolve(false),
      logout: () => Promise.resolve(),
    }),
    profile: group({}),
    calendar: group({}),
    indexes: group({}),
    fundamentals: group({}),
    portfolios: group({}),
    // SPEC-033: nenhum aviso de variação nestes testes (a variação do dia é lida das carteiras,
    // que aqui respondem como servidor fora do ar).
    notifications: {
      show: () => Promise.resolve(false),
      onClick: () => () => {},
    },
    // SPEC-011: o painel "Tarefas de dados" do Início aparece como servidor fora do ar.
    tasks: group({}),
    assets: group({
      logo: () => Promise.resolve({ ok: true, data: null }),
      // SPEC-029: a busca, a ficha e o histórico do ativo fictício.
      search: () => ok({ assets: [asset], hasMore: false, total: 1 }),
      detail: () => ok(structuredClone(detail)),
      history: (_id, period, adjusted) =>
        ok({
          period,
          adjusted: adjusted !== false,
          events: [],
          from: points[0].date,
          to: lastPoint.date,
          shorterThanPeriod: false,
          points: structuredClone(points),
          summary: null,
          jumps: [],
        }),
      news: (_id, query = {}) => {
        calls.push(['assetNews', query]);
        if (options.failNews) return fail('server_unavailable');
        const offset = Number(query.offset ?? 0);
        let found = query.group === 'list' ? listNews : mainNews;
        if (query.after && query.until) {
          found = found.filter((item) => {
            const day = referenceDay(item.publishedAt);
            return day > query.after && day <= query.until;
          });
        }
        return ok({
          total: found.length,
          listTotal: listNews.length,
          news: structuredClone(found.slice(offset, offset + 10)),
          model,
        });
      },
      newsDays: (_id, period) => {
        calls.push(['assetNewsDays', period]);
        if (options.failNews) return fail('server_unavailable');
        return ok({ period, days: newsDays(), model });
      },
    }),
    // SPEC-027: fontes de notícias, com as mesmas recusas do servidor.
    news: group({
      sources: () => {
        calls.push(['sources']);
        return ok(structuredClone(status));
      },
      latest: () => {
        calls.push(['latest']);
        return ok(structuredClone(latest));
      },
      sentiment: () => {
        calls.push(['sentiment']);
        return ok(summary());
      },
      nextToLabel: (skip = []) => {
        calls.push(['nextToLabel', skip]);
        const next = toLabel.find((n) => !labels.has(n.id) && !skip.includes(n.id));
        return ok({ news: next ? structuredClone(next) : null });
      },
      label: (id, sentiment) => {
        calls.push(['label', id, sentiment]);
        if (!toLabel.some((n) => n.id === id)) return fail('news_not_found');
        labels.delete(id);
        labels.set(id, { label: sentiment, at: new Date().toISOString() });
        return ok(null);
      },
      unlabel: (id) => {
        calls.push(['unlabel', id]);
        if (!labels.delete(id)) return fail('news_not_found');
        return ok(null);
      },
      // Com 5 rotuladas há 2 de teste: menos de 10, recusado. `window.__MOCK__.evaluation` força
      // uma avaliação pronta (ex.: { testSize: 60, macroF1: 0.64 }).
      evaluate: () => {
        calls.push(['evaluate']);
        if (scenario === 'vazio') return fail('no_model');
        const forced = options.evaluation;
        const test = labels.size - Math.floor(labels.size * 0.6);
        if (!forced && test < 10) return fail('not_enough_labels');
        evaluation = {
          evaluatedAt: new Date().toISOString(),
          testSize: forced?.testSize ?? test,
          accuracy: forced?.accuracy ?? 0.7,
          macroF1: forced?.macroF1 ?? 0.64,
          matrix: [
            [14, 4, 2],
            [3, 17, 2],
            [1, 6, 11],
          ],
        };
        return ok({ version: summary().current });
      },
      updateSource: (id, input) => {
        calls.push(['updateSource', id, input]);
        const source = status.sources.find((s) => s.id === id);
        if (!source) return fail('news_source_not_found');
        if (source.kind === 'parent') return fail('parent_source');
        Object.assign(source, input);
        return ok({ source: structuredClone(source) });
      },
      createSource: (input) => {
        calls.push(['createSource', input]);
        if (/interno|localhost|10\.0\./.test(input.url)) {
          return fail('validation_error', { url: 'private_address' });
        }
        if (/pagina/.test(input.url)) return fail('validation_error', { url: 'not_a_feed' });
        if (status.sources.some((s) => s.url === input.url)) return fail('source_exists');
        const source = {
          id: `00000000-0000-4000-8000-${String(status.sources.length + 1).padStart(12, '0')}`,
          kind: 'curated',
          name: input.name,
          url: input.url,
          category: input.category,
          reliability: input.reliability,
          active: true,
          lastRunAt: null,
          lastStatus: null,
          lastError: null,
          failures: 0,
          news: 0,
        };
        status.sources.push(source);
        return ok({ source: structuredClone(source), items: 20 });
      },
    }),
  };
})();
