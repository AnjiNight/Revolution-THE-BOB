import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-029 — Notícias na ficha do ativo e marcadores no gráfico, o mesmo roteiro da validação
 * visual de 17/11/2026, com o `window.api` falso de `mocks/window-api.js` (usuária e ativo
 * fictícios, pregões até 16/11/2026).
 */

async function openAsset(page: Page, mock: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    (options) => {
      (window as unknown as { __MOCK__: unknown }).__MOCK__ = options;
    },
    { role: 'user', ...mock },
  );
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ativos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir a ficha de PETR4' }).click();
  await expect(page.getByRole('heading', { name: 'PETR4' })).toBeVisible();
}

const mockCalls = (page: Page, name: string) =>
  page.evaluate(
    (call) =>
      (window as unknown as { __MOCK_CALLS__: unknown[][] }).__MOCK_CALLS__.filter(
        (entry) => entry[0] === call,
      ),
    name,
  );

const newsSection = (page: Page) => page.getByRole('region', { name: 'Notícias', exact: true });

test('lista: principal e citado, "Ver mais" com clique duplo e o grupo de listas (CA01)', async ({
  page,
}) => {
  await openAsset(page);
  const section = newsSection(page);
  const items = section.locator('.asset-news-list').first().locator(':scope > li');
  await expect(items).toHaveCount(10);
  await expect(items.first()).toContainText('Sobre a PETR4');
  await expect(items.nth(1)).toContainText('Cita a PETR4');
  await expect(items.first().getByRole('link').first()).toHaveAttribute('target', '_blank');
  await expect(items.first().getByRole('link').first()).toHaveAttribute('lang', 'pt-BR');
  await expect(items.first()).toContainText('Ler no Investidor10');

  // Servidor lento: o botão fica desativado no lugar, e o segundo clique não abre o grupo de baixo.
  await page.evaluate(() => {
    (window as unknown as { __MOCK__: { delayMs: number } }).__MOCK__.delayMs = 800;
  });
  await section.getByRole('button', { name: 'Ver mais (2 notícias)' }).dblclick();
  await expect(section.getByRole('button', { name: 'Carregando as notícias…' })).toBeDisabled();
  await expect(items).toHaveCount(12);
  await page.evaluate(() => {
    (window as unknown as { __MOCK__: { delayMs: number } }).__MOCK__.delayMs = 0;
  });
  await expect(section.getByText('Ler em Agência Brasil – Economia')).toBeVisible();
  const pages = (await mockCalls(page, 'assetNews')).filter(
    (call) => (call[1] as { offset?: number }).offset === 10,
  );
  expect(pages).toHaveLength(1);

  const lists = section.getByRole('button', { name: 'Também aparece em listas (3)' });
  await expect(lists).toHaveAttribute('aria-expanded', 'false');
  await lists.click();
  await expect(lists).toHaveAttribute('aria-expanded', 'true');
  await expect(
    section.getByRole('link', {
      name: 'Agenda fictícia: 40 empresas divulgam resultados',
      exact: true,
    }),
  ).toBeVisible();
});

test('marcador pelo clique: as notícias do pregão e a variação depois (CA03)', async ({ page }) => {
  await openAsset(page);
  await expect(page.locator('.chart-news')).toHaveCount(10);
  await expect(page.getByText('Pregão com notícia', { exact: true })).toBeVisible();
  // O 6º marcador é o de 28/10/2026.
  await page.locator('.chart-news').nth(5).click();
  const panel = page.getByRole('region', { name: 'Notícias do pregão de 28 de out. de 2026' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading')).toBeFocused();
  await expect(panel).toContainText('No pregão');
  await expect(panel).toContainText('-0,46%');
  await expect(panel).toContainText('5 pregões depois');
  await expect(panel).toContainText('-2,26%');
  await expect(panel).toContainText('não que a notícia causou a variação');
  await expect(
    panel.getByRole('link', { name: 'PETR4 fictícia anuncia recompra de ações', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Fechar as notícias do pregão' }).click();
  await expect(panel).toHaveCount(0);
});

test('teclado: N, Shift+N e Enter; notícia das 19h30 no pregão seguinte (CA02, CA04)', async ({
  page,
}) => {
  await openAsset(page);
  const chart = page.getByRole('slider');
  await chart.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('n');
  await expect(chart).toHaveAttribute('aria-valuetext', /10 de jun\. de 2026: .*1 notícia$/);
  await page.keyboard.press('End');
  await expect(chart).toHaveAttribute('aria-valuetext', /16 de nov\. de 2026: .*2 notícias$/);
  await page.keyboard.press('Shift+N');
  await page.keyboard.press('Enter');
  // Quarta, 11/11, às 19h30: conta para a quinta, 12/11.
  const panel = page.getByRole('region', { name: 'Notícias do pregão de 12 de nov. de 2026' });
  await expect(panel.getByRole('heading')).toBeFocused();
  await expect(panel).toContainText('Ainda não há 5 pregões depois');
  await expect(panel.locator('.asset-news-item')).toHaveCount(1);
  await expect(panel).toContainText('PETR4 divulga resultado fictício do 3º trimestre à noite');
  // Trocar o período fecha o painel.
  await page
    .getByRole('region', { name: 'Histórico de cotações' })
    .getByRole('button', { name: '5 anos' })
    .click();
  await expect(panel).toHaveCount(0);
});

test('vazia, carregando e servidor fora do ar com "Tentar de novo"', async ({ page }) => {
  await openAsset(page, { scenario: 'vazio' });
  await expect(newsSection(page).getByText('Ainda não há notícias sobre a PETR4.')).toBeVisible();
  await expect(page.locator('.chart-news')).toHaveCount(0);
  await expect(page.getByText('Pregão com notícia', { exact: true })).toHaveCount(0);

  const slow = await page.context().newPage();
  await openAsset(slow, { delayMs: 1500 });
  await expect(newsSection(slow).getByText('Carregando as notícias…')).toBeVisible();
  await expect(newsSection(slow).locator('.asset-news-item')).toHaveCount(10);

  const failing = await page.context().newPage();
  await openAsset(failing, { failNews: true });
  const section = newsSection(failing);
  await expect(section.getByRole('alert')).toHaveText(
    'Não foi possível falar com o servidor. Tente novamente.',
  );
  // O gráfico continua, sem marcadores.
  await expect(failing.getByRole('slider')).toBeVisible();
  await failing.evaluate(() => {
    (window as unknown as { __MOCK__: { failNews: boolean } }).__MOCK__.failNews = false;
  });
  await section.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(section.locator('.asset-news-item')).toHaveCount(10);
});

test('celular (375 px) e interface em inglês', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openAsset(page);
  await newsSection(page).scrollIntoViewIfNeeded();
  await expect(newsSection(page).locator('.asset-news-item')).toHaveCount(10);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  await page.getByRole('button', { name: /English/ }).click();
  const news = page.getByRole('region', { name: 'News', exact: true });
  await expect(news.getByText('In Portuguese')).toBeVisible();
  await expect(news.locator('.asset-news-item').first()).toContainText('About PETR4');
  await expect(news.locator('.asset-news-item').first()).toContainText('Read on Investidor10');
});
