/**
 * `window.api` falso para testar as telas do app no navegador, sem o Electron, sem o servidor e
 * sem login (validação visual das Specs). Os dados são fictícios.
 *
 * Uso:
 * - Playwright: `page.addInitScript({ path: 'mocks/window-api.js' })` antes de abrir
 *   http://localhost:5173 (o renderer do `npm run dev:app`).
 * - Opções, antes deste script: `window.__MOCK__ = { delayMs: 1500, scenario: 'vazio' }`.
 *   `scenario`: `normal` (padrão) ou `vazio` (só a fonte pai, sem arquivo, coleta desligada).
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

  // Colaboradora fictícia.
  const user = {
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
    assets: group({ logo: () => Promise.resolve({ ok: true, data: null }) }),
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
