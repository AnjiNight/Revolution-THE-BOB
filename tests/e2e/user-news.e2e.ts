import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-030 — a tela Notícias do usuário e a Minhas fontes, com o `window.api` falso de
 * `mocks/window-api.js` (usuária, fontes e notícias fictícias).
 */

async function openNews(page: Page, mock: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    (options) => {
      (window as unknown as { __MOCK__: unknown }).__MOCK__ = options;
    },
    { role: 'user', ...mock },
  );
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notícias', level: 1 })).toBeVisible();
}

const mockCalls = (page: Page, name: string) =>
  page.evaluate(
    (call) =>
      (window as unknown as { __MOCK_CALLS__: unknown[][] }).__MOCK_CALLS__.filter(
        (entry) => entry[0] === call,
      ),
    name,
  );

const items = (page: Page) => page.locator('.asset-news-list > li');

test('lista por dia e peso, 20 por vez, e o tom ponderado com as frases fixas (CA08, CA09)', async ({
  page,
}) => {
  await openNews(page, { sentiment: 'visible' });
  await expect(page.locator('p.field-hint', { hasText: /^26 notícias$/ })).toBeVisible();
  await expect(items(page)).toHaveCount(20);
  // No mesmo dia (16/11), a pai (peso 4) vem antes da Agência Brasil (Média, 2).
  await expect(items(page).first()).toContainText('Petróleo Fictício (PETR4) anuncia dividendos');
  await expect(items(page).nth(1)).toContainText('Agência fictícia');
  await expect(
    items(page).first().getByRole('button', { name: 'Abrir a ficha da PETR4' }),
  ).toBeVisible();

  const tone = page.getByRole('region', { name: 'Tom das notícias' });
  await expect(tone).toContainText('positivas');
  await expect(tone).toContainText('não é o sentimento oficial do app');
  await expect(tone).toContainText('não é recomendação de investimento');

  await page.getByRole('button', { name: 'Ver mais (6 notícias)' }).click();
  await expect(items(page)).toHaveCount(26);
  // O modo de desenvolvimento do React roda o efeito inicial duas vezes: as páginas pedidas são 0 e 20.
  const offsets = (await mockCalls(page, 'feed')).map(
    (call) => (call[1] as { offset: number }).offset,
  );
  expect([...new Set(offsets)]).toEqual([0, 20]);
});

test('sem o sentimento visível: sem filtro de sentimento e sem o resumo do tom', async ({
  page,
}) => {
  await openNews(page);
  await expect(items(page)).toHaveCount(20);
  await expect(page.getByLabel('Sentimento')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Tom das notícias' })).toHaveCount(0);
});

test('filtros: ativo pela busca, sentimento e limpar (CA08)', async ({ page }) => {
  await openNews(page, { sentiment: 'visible' });
  await page.getByLabel('Ativo').fill('PET');
  await page.getByRole('list', { name: 'Ativos encontrados' }).getByRole('button').click();
  await expect(page.getByRole('button', { name: 'Tirar o filtro PETR4' })).toBeVisible();
  await expect(items(page)).toHaveCount(2);
  await expect(page.locator('p.field-hint', { hasText: /^2 notícias$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Tirar o filtro PETR4' }).click();
  await page.getByLabel('Sentimento').selectOption('negative');
  await expect(items(page).first()).toContainText('Tom: Negativo');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(items(page)).toHaveCount(20);
  const last = (await mockCalls(page, 'feed')).at(-1)?.[1];
  expect(last).toEqual({ period: '30d', offset: 0 });
});

test('Minhas fontes: a pai sem controles, desligar e a prioridade da curada (CA01, CA02, CA03)', async ({
  page,
}) => {
  await openNews(page);
  await page.getByRole('button', { name: 'Minhas fontes' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas fontes', level: 1 })).toBeVisible();
  await expect(page.getByText('Sempre ligada e com a maior prioridade.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desligar Investidor10' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Desligar Agência Brasil – Economia' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Agência Brasil – Economia desligada.' }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Ligar Agência Brasil – Economia' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Prioridade de Feed Fictício Fora do Ar').selectOption('high');
  await expect(page.locator('.form-success')).toHaveText(
    'Feed Fictício Fora do Ar: prioridade Alta.',
  );

  await page.getByRole('button', { name: 'Voltar para as notícias' }).click();
  // A Agência desligada some da lista dela.
  await expect(page.locator('.asset-news-list')).not.toContainText('Agência fictícia');
});

test('Adicionar feed: recusas com o motivo, fonte do app, sucesso e remover (CA04, CA05, CA06)', async ({
  page,
}) => {
  await openNews(page);
  await page.getByRole('button', { name: 'Minhas fontes' }).click();
  const url = page.getByLabel('Endereço do feed');
  const add = page.getByRole('button', { name: 'Adicionar feed', exact: true });

  await url.fill('http://blog.exemplo/feed');
  await add.click();
  await expect(page.getByText('Use um endereço que comece com https://.')).toBeVisible();
  await url.fill('https://192.168.0.10/rss');
  await add.click();
  await expect(
    page.getByText('Use um endereço https público (não da rede interna).'),
  ).toBeVisible();

  await url.fill('https://agenciabrasil.ebc.com.br/rss/economia/feed.xml');
  await add.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Esta fonte já está no app.' }),
  ).toBeVisible();

  await url.fill('https://blog.exemplo/feed');
  await page.getByLabel('Nome (opcional)').fill('Blog FII');
  await add.click();
  await expect(page.locator('.form-success')).toHaveText(
    'Feed adicionado: Blog FII, 2 notícias encontradas.',
  );
  await expect(page.getByRole('heading', { name: 'Seus feeds (1 de 10)' })).toBeVisible();

  await page.getByRole('button', { name: 'Voltar para as notícias' }).click();
  await expect(page.locator('.user-news-own').first()).toHaveText('Sua fonte');

  await page.getByRole('button', { name: 'Minhas fontes' }).click();
  await page.getByRole('button', { name: 'Remover Blog FII' }).click();
  await page.getByRole('button', { name: 'Remover feed' }).click();
  await expect(page.locator('.form-success')).toHaveText('Blog FII removido.');
  await expect(page.getByRole('heading', { name: 'Seus feeds (0 de 10)' })).toBeVisible();
});

test('celular (375 px) e inglês: sem rolagem lateral (CA14)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openNews(page, { sentiment: 'visible' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Minhas fontes' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'My sources', level: 1 })).toBeVisible();
  await expect(page.getByText('Always on, with the highest priority.')).toBeVisible();
});
