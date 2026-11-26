import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-047 — Mais fontes de notícias e notícias repetidas entre fontes, com o `window.api` falso
 * de `mocks/window-api.js` (dados fictícios).
 */

async function open(page: Page, role: 'user' | 'collaborator'): Promise<void> {
  await page.addInitScript(
    (mock) => {
      (window as unknown as { __MOCK__: unknown }).__MOCK__ = mock;
    },
    role === 'user' ? { role: 'user' } : {},
  );
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
}

test('ficha: "Também em" com o link de cada fonte (CA03)', async ({ page }) => {
  await open(page, 'user');
  await page.getByRole('button', { name: 'Ativos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir a ficha de PETR4' }).click();
  const first = page
    .getByRole('region', { name: 'Notícias', exact: true })
    .locator('.asset-news-list')
    .first()
    .locator(':scope > li')
    .first();
  // Cada link tem o título escondido, para o leitor de tela: confere o texto e os dois links.
  await expect(first.locator('.asset-news-also')).toContainText('Também em:');
  await expect(first.getByRole('link', { name: /^Valor Econômico/ })).toBeVisible();
  const infoMoney = first.getByRole('link', { name: /^InfoMoney/ });
  await expect(infoMoney).toHaveAttribute(
    'href',
    'https://www.infomoney.com.br/mercados/exemplo-ficticio-a1/',
  );
  await expect(infoMoney).toHaveAttribute('target', '_blank');
});

test('fontes: repetidas por fonte e as sugestões testadas no formulário (CA01, CA06)', async ({
  page,
}) => {
  await open(page, 'collaborator');
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  const agency = page.locator('.news-sources-table tbody tr').nth(1);
  await expect(agency).toContainText('2 repetidas');

  await page.getByRole('button', { name: 'Nova fonte' }).click();
  for (const name of ['InfoMoney', 'Valor Econômico', 'Exame', 'Investing.com Brasil']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Exame', exact: true }).click();
  await expect(page.getByLabel('Nome')).toHaveValue('Exame');
  await expect(page.getByLabel('Endereço do feed (RSS ou Atom)')).toHaveValue(
    'https://exame.com/feed/',
  );
  await expect(page.getByLabel('Categoria')).toHaveValue('economia');
  // A licença continua com o colaborador.
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('375 px: a ficha com "Também em" sem rolagem para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await open(page, 'user');
  await page.getByRole('button', { name: 'Ativos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir a ficha de PETR4' }).click();
  await expect(page.getByText('Também em:').first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
