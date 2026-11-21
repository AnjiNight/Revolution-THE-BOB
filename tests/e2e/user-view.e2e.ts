import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-045 — Visão do usuário para o colaborador, com o `window.api` falso de
 * `mocks/window-api.js` (colaboradora fictícia, dados fictícios).
 */

async function openApp(page: Page): Promise<void> {
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Calendário', exact: true })).toBeVisible();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação do app' });

test('entra na Visão do usuário e volta à Área do colaborador (CA01, CA05)', async ({ page }) => {
  await openApp(page);
  await expect(nav(page).getByRole('button', { name: 'Carteiras' })).toHaveCount(0);

  await nav(page).getByRole('button', { name: 'Visão do usuário' }).click();

  const banner = page
    .getByRole('status')
    .filter({ hasText: 'Você está vendo o app como um usuário' });
  await expect(banner).toBeVisible();
  // O menu do usuário: sem Calendário e Notícias, com Carteiras.
  await expect(nav(page).getByRole('button', { name: 'Carteiras' })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Calendário', exact: true })).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: 'Notícias', exact: true })).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: 'Visão do usuário' })).toHaveCount(0);
  await expect(page.locator('#conteudo')).toBeFocused();

  await page.getByRole('button', { name: 'Voltar à Área do colaborador' }).click();
  await expect(banner).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: 'Calendário', exact: true })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Carteiras' })).toHaveCount(0);
});

test('na Visão do usuário, Ativos é a busca do usuário e Carteiras lista as de teste (CA01, CA02)', async ({
  page,
}) => {
  await openApp(page);
  await nav(page).getByRole('button', { name: 'Visão do usuário' }).click();

  await nav(page).getByRole('button', { name: 'Ativos' }).click();
  await expect(page.getByRole('button', { name: 'Novo ativo' })).toHaveCount(0);
  await expect(page.getByRole('searchbox').or(page.getByRole('textbox')).first()).toBeVisible();

  await nav(page).getByRole('button', { name: 'Carteiras' }).click();
  await expect(page.getByText('Teste do calendário')).toBeVisible();
  // A faixa continua em todas as telas da Visão do usuário.
  await expect(page.getByRole('button', { name: 'Voltar à Área do colaborador' })).toBeVisible();
});

test('a 375 px o botão vira o ícone de olho, com o nome para o leitor de tela (CA06)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await openApp(page);
  const toggle = nav(page).getByRole('button', { name: 'Visão do usuário' });
  await expect(toggle).toBeAttached();
  await expect(page.locator('.user-view-text')).toHaveCSS('position', 'absolute');
  await toggle.click();
  const back = page.getByRole('button', { name: 'Voltar à Área do colaborador' });
  await expect(back).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
