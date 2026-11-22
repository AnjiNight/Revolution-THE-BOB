import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-048 — O painel "Mercado hoje" no Início do usuário, com o `window.api` falso de
 * `mocks/window-api.js`: o Ibovespa de 20 minutos atrás e o dólar de 10 minutos atrás.
 */

async function open(page: Page, mock: Record<string, unknown>): Promise<void> {
  await page.addInitScript((options) => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = options;
  }, mock);
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
}

const panel = (page: Page) => page.getByRole('region', { name: 'Mercado hoje' });

test('os dois cartões com valor, variação, horário, atraso e a fonte (CA03)', async ({ page }) => {
  await open(page, { role: 'user' });
  const market = panel(page);
  const ibovespa = market.locator('li').filter({ hasText: 'Ibovespa' });
  await expect(ibovespa).toContainText('166.376 pts');
  await expect(ibovespa).toContainText('-0,69%');
  await expect(ibovespa).toContainText('atraso de até 20 min');
  await expect(ibovespa.locator('.quote-change svg')).toHaveCount(1);
  const dollar = market.locator('li').filter({ hasText: 'Dólar' });
  await expect(dollar).toContainText('R$ 5,9074');
  await expect(dollar).toContainText('+0,04%');
  await expect(market).toContainText('Fonte: Yahoo Finance');
  await expect(market).not.toContainText('tempo real');
  await expect(market).not.toContainText('Pode estar desatualizado');
});

test('desatualizado: o aviso com o horário da última leitura (CA04)', async ({ page }) => {
  await open(page, { role: 'user', marketStale: true });
  const ibovespa = panel(page).locator('li').filter({ hasText: 'Ibovespa' });
  await expect(ibovespa).toContainText('Pode estar desatualizado: a última leitura é de');
});

test('sem leitura ainda; o colaborador não vê o painel', async ({ page }) => {
  await open(page, { role: 'user', scenario: 'vazio' });
  await expect(panel(page)).toContainText('Ainda sem leitura do mercado de hoje');

  const other = await page.context().newPage();
  await open(other, {});
  await expect(other.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(other.getByRole('region', { name: 'Mercado hoje' })).toHaveCount(0);
});

test('em inglês e a 480 px, sem rolagem para o lado (CA06)', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await open(page, { role: 'user' });
  await page.getByRole('button', { name: 'English' }).click();
  const market = page.getByRole('region', { name: 'Market today' });
  await expect(market).toContainText('166,376 pts');
  await expect(market).toContainText('delayed up to 20 min');
  await expect(market).toContainText('R$5.9074');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
