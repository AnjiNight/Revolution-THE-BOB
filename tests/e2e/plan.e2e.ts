import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-025 — A tela Plano e o cadeado dos recursos premium, com o `window.api` falso de
 * `mocks/window-api.js` (pagamento simulado: nenhum campo de pagamento).
 */

async function open(page: Page, mock: Record<string, unknown>): Promise<void> {
  await page.addInitScript((options) => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = options;
  }, mock);
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação do app' });

test('assinar o mensal pela tela Plano, sem nenhum campo de pagamento (CA01, CA02)', async ({
  page,
}) => {
  await open(page, { role: 'user' });
  await nav(page).getByRole('button', { name: 'Plano' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plano' })).toBeVisible();
  await expect(
    page.getByText('Pagamento simulado: nenhuma cobrança é feita').first(),
  ).toBeVisible();
  await expect(page.getByText('R$ 19,90 por mês')).toBeVisible();
  await expect(page.getByText('R$ 199,00 por ano')).toBeVisible();
  // Nenhum campo de cartão, CPF ou qualquer dado de pagamento.
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Assinar Assinante mensal' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Confirmar a assinatura.' });
  await expect(confirm).toContainText('R$ 19,90 por 30 dias');
  await confirm.getByRole('button', { name: 'Confirmar assinatura' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pronto!' })).toContainText(
    'Assinante mensal',
  );
  await expect(page.getByText(/Renova sozinho em/)).toBeVisible();
  const payments = page.getByRole('table');
  await expect(payments).toContainText('R$ 19,90');
  await expect(payments).toContainText('Aprovado (simulado)');
  const calls = await page.evaluate(
    () => (window as unknown as { __MOCK_CALLS__: unknown[] }).__MOCK_CALLS__,
  );
  expect(calls).toContainEqual(['subscribe', 'assinante_mensal']);
});

test('cancelar a renovação mantém o acesso até o fim (CA03)', async ({ page }) => {
  await open(page, { role: 'user', subscription: 'mensal' });
  await nav(page).getByRole('button', { name: 'Plano' }).click();
  await page.getByRole('button', { name: 'Cancelar renovação' }).click();
  await page
    .getByRole('alertdialog', { name: 'Cancelar renovação' })
    .getByRole('button', { name: 'Cancelar renovação' })
    .click();
  await expect(
    page.getByText(/Renovação cancelada\. Os recursos do Assinante continuam até/),
  ).toBeVisible();
  await expect(page.getByText(/Termina em .*, sem renovação\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reativar renovação' })).toBeVisible();
});

test('sem assinatura: comparar tem cadeado e leva à tela Plano (CA05)', async ({ page }) => {
  await open(page, { role: 'user', twoPortfolios: true });
  await nav(page).getByRole('button', { name: 'Carteiras' }).click();
  const compare = page.getByRole('button', { name: 'Comparar carteiras' });
  await expect(compare).toBeVisible();
  await expect(page.getByText('Recurso do plano Assinante')).toBeVisible();
  await compare.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plano' })).toBeVisible();
  await expect(page.getByText('Comparar carteiras é um recurso do plano Assinante.')).toBeVisible();
});

test('com assinatura: comparar sem cadeado; no fim, o aviso no Início', async ({ page }) => {
  await open(page, { role: 'user', twoPortfolios: true, subscription: 'ending' });
  await expect(page.getByText(/Sua assinatura termina em/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver plano' }).click();
  await expect(page.getByText(/Termina em .*, sem renovação\./)).toBeVisible();

  await nav(page).getByRole('button', { name: 'Carteiras' }).click();
  await expect(page.getByRole('button', { name: 'Comparar carteiras' })).toBeVisible();
  await expect(page.getByText('Recurso do plano Assinante')).toHaveCount(0);
});

test('o colaborador não tem o item Plano (CA06)', async ({ page }) => {
  await open(page, {});
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Plano' })).toHaveCount(0);
});

test('em inglês e a 480 px, sem rolagem para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await open(page, { role: 'user', subscription: 'mensal' });
  await page.getByRole('button', { name: 'English' }).click();
  await page
    .getByRole('navigation', { name: 'App navigation' })
    .getByRole('button', { name: 'Plan' })
    .click();
  await expect(page.getByText('R$19.90 per month')).toBeVisible();
  await expect(page.getByText('Approved (simulated)')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
