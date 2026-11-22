import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-046 — Último fechamento na lista de ativos, com o `window.api` falso de
 * `mocks/window-api.js` (usuária fictícia): PETR4 sem cotação do pregão (vale o fechamento de
 * 16/11/2026) e VALE3 com a cotação do pregão de agora.
 */

async function openSearch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = { role: 'user' };
  });
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ativos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir a ficha de PETR4' })).toBeVisible();
}

const row = (page: Page, ticker: string) =>
  page
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: `Abrir a ficha de ${ticker}` }) });

test('o mais recente: o fechamento da B3 ou a cotação do pregão (CA02, CA03)', async ({ page }) => {
  await openSearch(page);
  const petr4 = row(page, 'PETR4').locator('.wide-only');
  await expect(petr4).toContainText('Fechamento de 16 de nov. de 2026 (B3)');
  await expect(petr4).toContainText('-1,25%');
  const vale3 = row(page, 'VALE3').locator('.wide-only');
  await expect(vale3).toContainText('Cotação das');
  await expect(vale3).toContainText('atraso de até 45 min');
  await expect(page.getByText('o último fechamento da B3, o que for mais recente')).toBeVisible();
});

test('em inglês e a 375 px, sem rolagem para o lado (CA05)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await openSearch(page);
  await page.getByRole('button', { name: 'English' }).click();
  // Na janela estreita, o preço vai para baixo do nome (a coluna larga fica escondida).
  await expect(page.locator('.quote-narrow').getByText(/^Close on .+ \(B3\)$/)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
