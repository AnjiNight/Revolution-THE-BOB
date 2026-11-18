import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-027 — Fontes de notícias (Área do colaborador), o mesmo roteiro da validação visual de
 * 12/11/2026, e SPEC-028 — as últimas notícias com os ativos vinculados (validação de 17/11/2026),
 * com o `window.api` falso de `mocks/window-api.js` (dados fictícios).
 */

async function openNews(page: Page, mock: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((options) => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = options;
  }, mock);
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fontes de notícias' })).toBeVisible();
}

const mockCalls = (page: Page, name: string) =>
  page.evaluate(
    (call) =>
      (window as unknown as { __MOCK_CALLS__: unknown[][] }).__MOCK_CALLS__.filter(
        (entry) => entry[0] === call,
      ).length,
    name,
  );

test('lista: fonte pai sem desativar, arquivo, fonte com problema (CA06, CA08)', async ({
  page,
}) => {
  await openNews(page);
  await expect(page.getByText('Arquivo do Investidor10: 8.000 de 22.491 notícias')).toBeVisible();
  const rows = page.locator('.news-sources-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Fonte pai: não pode ser desativada');
  await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
  await expect(rows.nth(2)).toContainText('Com problema: 4 falhas seguidas');
});

test('desativar e ativar uma fonte curada (CA08)', async ({ page }) => {
  await openNews(page);
  await page.getByRole('button', { name: 'Desativar a fonte Agência Brasil – Economia' }).click();
  await expect(page.getByText('Fonte Agência Brasil – Economia desativada.')).toBeVisible();
  await expect(page.locator('.news-sources-table tbody tr').nth(1)).toContainText('Desativada');
  await page.getByRole('button', { name: 'Ativar a fonte Agência Brasil – Economia' }).click();
  await expect(page.getByText('Fonte Agência Brasil – Economia ativada.')).toBeVisible();
});

test('nova fonte: vazio, http, rede interna e duplicata são recusados (CA05)', async ({ page }) => {
  await openNews(page);
  await page.getByRole('button', { name: 'Nova fonte' }).click();
  const submit = page.getByRole('button', { name: 'Testar e cadastrar' });

  await submit.click();
  await expect(page.getByText('Campo obrigatório.')).toHaveCount(4);
  expect(await mockCalls(page, 'createSource')).toBe(0);

  await page.getByLabel('Nome').fill('InfoMoney');
  await page.getByLabel('Endereço do feed (RSS ou Atom)').fill('http://www.infomoney.com.br/feed/');
  await page.getByLabel('Categoria').selectOption('mercado');
  await page.getByLabel('Confiabilidade').selectOption('4');
  await page.getByLabel('Conferi que a licença da fonte permite o uso neste projeto').check();
  await submit.click();
  await expect(page.getByText('Use um endereço que comece com https://.')).toBeVisible();

  await page
    .getByLabel('Endereço do feed (RSS ou Atom)')
    .fill('https://feed-interno.empresa.com/rss');
  await submit.click();
  await expect(
    page.getByText('Use um endereço https público (não da rede interna).'),
  ).toBeVisible();

  await page
    .getByLabel('Endereço do feed (RSS ou Atom)')
    .fill('https://agenciabrasil.ebc.com.br/rss/economia/feed.xml');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Já existe uma fonte com este endereço.');
});

test('nova fonte válida com servidor lento e clique duplo: cadastra uma vez só', async ({
  page,
}) => {
  await openNews(page, { delayMs: 1500 });
  await page.getByRole('button', { name: 'Nova fonte' }).click();
  await page.getByLabel('Nome').fill('InfoMoney');
  await page
    .getByLabel('Endereço do feed (RSS ou Atom)')
    .fill('https://www.infomoney.com.br/feed/');
  await page.getByLabel('Categoria').selectOption('mercado');
  await page.getByLabel('Confiabilidade').selectOption('4');
  await page.getByLabel('Conferi que a licença da fonte permite o uso neste projeto').check();
  await page.getByRole('button', { name: 'Testar e cadastrar' }).dblclick();
  await expect(page.getByRole('button', { name: 'Testando o feed…' })).toBeDisabled();
  await expect(page.getByText('Fonte InfoMoney cadastrada: 20 notícias no feed.')).toBeVisible();
  expect(await mockCalls(page, 'createSource')).toBe(1);
  await expect(page.locator('.news-sources-table tbody tr')).toHaveCount(4);
});

test('carregamento lento e lista vazia com a coleta desligada (CA07)', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = { scenario: 'vazio', delayMs: 1500 };
  });
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  await expect(page.getByText('Carregando as fontes…')).toBeVisible();
  await expect(page.getByText('A coleta do Investidor10 está desligada')).toBeVisible();
  await expect(page.locator('.news-sources-table tbody tr')).toHaveCount(1);
  await expect(page.getByText('Ainda não coletada')).toBeVisible();
  await expect(page.getByText(/Arquivo do Investidor10/)).toHaveCount(0);
});

// SPEC-028: as últimas notícias com os ativos vinculados, abaixo das fontes.
test('últimas notícias: tickers com a relevância e notícia sem ativo (CA06)', async ({ page }) => {
  await openNews(page);
  const latest = page.getByRole('region', { name: 'Últimas notícias' });
  await expect(latest.getByText('Com ativo vinculado: 154 de 261 notícias.')).toBeVisible();
  const items = latest.locator('.latest-news-list > li');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).getByRole('link')).toHaveAttribute('target', '_blank');
  await expect(items.nth(0).getByRole('list', { name: 'Ativos da notícia' })).toHaveText(
    /PETR4 \(Principal\)\s*PRIO3 \(Citado\)/,
  );
  await expect(items.nth(1).locator('.news-link.is-lista')).toHaveCount(9);
  await expect(items.nth(2)).toContainText('Sem ativo vinculado');
});

test('últimas notícias: carregando, vazia e servidor fora do ar', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = { scenario: 'vazio', delayMs: 1500 };
  });
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  const latest = page.getByRole('region', { name: 'Últimas notícias' });
  await expect(latest.getByText('Carregando as notícias…')).toBeVisible();
  await expect(latest.getByText('Nenhuma notícia coletada ainda.')).toBeVisible();
  await expect(latest.getByText(/Com ativo vinculado/)).toHaveCount(0);

  const failing = await page.context().newPage();
  await failing.addInitScript({ path: 'mocks/window-api.js' });
  await failing.addInitScript(() => {
    const api = (window as unknown as { api: { news: Record<string, unknown> } }).api;
    api.news = new Proxy(api.news, {
      get: (target, key) =>
        key === 'latest'
          ? () => Promise.resolve({ ok: false, error: 'server_unavailable' })
          : target[key as string],
    });
  });
  await failing.goto('/');
  await failing.getByRole('button', { name: 'Notícias', exact: true }).click();
  await expect(
    failing.getByRole('region', { name: 'Últimas notícias' }).getByRole('alert'),
  ).toHaveText('Não foi possível falar com o servidor. Tente novamente.');
});

test('celular (375 px): sem rolagem lateral, menu alcançável e fontes em cartões', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openNews(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const profile = page.getByRole('button', { name: 'Meu perfil' });
  await profile.scrollIntoViewIfNeeded();
  await expect(profile).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toBeInViewport();
  await page.getByRole('button', { name: 'Nova fonte' }).click();
  await expect(page.getByRole('button', { name: 'Testar e cadastrar' })).toBeVisible();
  await page.getByRole('region', { name: 'Últimas notícias' }).scrollIntoViewIfNeeded();
  const stillFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(stillFits).toBe(true);
});
