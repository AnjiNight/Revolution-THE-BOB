import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-044 — Sentimento das notícias: a amostra rotulada e a avaliação na tela Notícias do
 * colaborador, e o tom na ficha do ativo. O mesmo roteiro da validação visual de 19/11/2026, com o
 * `window.api` falso de `mocks/window-api.js`.
 */

async function openNews(page: Page, mock: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((options) => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = options;
  }, mock);
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sentimento das notícias' })).toBeVisible();
}

const mockCalls = (page: Page, name: string) =>
  page.evaluate(
    (call) =>
      (window as unknown as { __MOCK_CALLS__: unknown[][] }).__MOCK_CALLS__.filter(
        (entry) => entry[0] === call,
      ),
    name,
  );

const panel = (page: Page) => page.getByRole('region', { name: 'Sentimento das notícias' });
const labeling = (page: Page) => page.getByRole('region', { name: 'Rotular notícias' });

test('rotular pelo teclado e pelo clique, pular, sem mostrar o modelo (CA04)', async ({ page }) => {
  await openNews(page);
  await expect(panel(page)).toContainText('Dicionário de termos v1');
  await expect(panel(page)).toContainText('Nenhuma notícia ainda. Meta: 150.');
  await expect(panel(page)).toContainText(
    'Invisível para os usuários: a versão em uso ainda não foi avaliada.',
  );

  const card = labeling(page).locator('.sentiment-card');
  await expect(card).toContainText('Petróleo Fictício (PETR4) lucra mais no trimestre');
  await expect(card).toContainText('Ativo principal: PETR4. O tom é para ele.');
  // O que o modelo disse não aparece enquanto se rotula.
  await expect(card.locator('.sentiment-tag')).toHaveCount(0);

  // Teclas 1, 3 e 0 em sequência: o foco segue para a próxima notícia.
  await card.getByRole('link').focus();
  await page.keyboard.press('1');
  await expect(card).toContainText('Banco Fictício (BBAS3) vê lucro cair 30%');
  await expect(card.getByRole('link')).toBeFocused();
  await page.keyboard.press('3');
  await expect(card).toContainText('Notícia fictícia sobre a agenda do Copom');
  await expect(card).toContainText('Sem ativo principal: o tom é para o mercado brasileiro.');
  await page.keyboard.press('0');
  await expect(card).toContainText('Varejista Fictícia (MGLU3) abre 20 lojas');

  // Clique duplo com o servidor lento: um rótulo só.
  await page.evaluate(() => {
    (window as unknown as { __MOCK__: { delayMs: number } }).__MOCK__.delayMs = 600;
  });
  await labeling(page).getByRole('button', { name: 'Neutro' }).dblclick();
  await expect(card).toContainText('Mineradora Fictícia (VALE3) é multada');
  const labels = await mockCalls(page, 'label');
  expect(labels.map((call) => call[2])).toEqual(['positive', 'negative', 'neutral']);
  await expect(panel(page)).toContainText('3 notícias (1 para ajuste, 2 para teste)');
});

test('trocar e apagar rótulo; avaliar com poucas e com a amostra pronta (CA03, CA04)', async ({
  page,
}) => {
  await openNews(page);
  const card = labeling(page).locator('.sentiment-card');
  await card.getByRole('link').focus();
  await page.keyboard.press('1');
  await expect(card).toContainText('Banco Fictício');
  await page.keyboard.press('2');
  await expect(card).toContainText('agenda do Copom');

  const recent = page.getByRole('region', { name: 'Últimos rotulados' });
  const select = recent.getByRole('combobox', {
    name: 'Rótulo de Banco Fictício (BBAS3) vê lucro cair 30%',
  });
  await expect(select).toHaveValue('neutral');
  await select.selectOption('negative');
  await expect(select).toHaveValue('negative');
  await recent
    .getByRole('button', {
      name: 'Apagar o rótulo de Petróleo Fictício (PETR4) lucra mais no trimestre',
    })
    .click();
  await expect(recent.locator('li')).toHaveCount(1);
  expect((await mockCalls(page, 'unlabel')).length).toBe(1);

  await panel(page).getByRole('button', { name: 'Avaliar agora' }).click();
  await expect(panel(page)).toContainText(
    'Rotule mais notícias: para avaliar, é preciso ter pelo menos 10 de teste.',
  );
});

test('avaliação pronta: a nota, a tabela de erros e "visível" (CA05)', async ({ page }) => {
  await openNews(page, { evaluation: { testSize: 60, macroF1: 0.64, accuracy: 0.7 } });
  await panel(page).getByRole('button', { name: 'Avaliar agora' }).click();
  await expect(panel(page)).toContainText('Avaliação feita e guardada na versão.');
  await expect(panel(page)).toContainText('F1 macro 0,64, acurácia 0,70, com 60 notícias de teste');
  await expect(panel(page)).toContainText('Visível para os usuários');
  const matrix = page.getByRole('table', { name: 'Acertos e erros nas notícias de teste' });
  await expect(matrix.getByRole('columnheader', { name: 'Modelo: Positivo' })).toBeVisible();
  await expect(matrix.getByRole('row', { name: /Neutro 3 17 2/ })).toBeVisible();
});

test('sem versão do modelo e servidor fora do ar', async ({ page, browser }) => {
  await openNews(page, { scenario: 'vazio' });
  await expect(panel(page)).toContainText(
    'Nenhuma ainda: o processador registra a versão na primeira classificação.',
  );
  await expect(panel(page)).toContainText(
    'Invisível para os usuários: nenhuma versão em uso ainda.',
  );
  await expect(panel(page).getByRole('button', { name: 'Avaliar agora' })).toBeDisabled();

  const failing = await browser.newPage();
  await failing.addInitScript({ path: 'mocks/window-api.js' });
  await failing.addInitScript(() => {
    const api = (window as unknown as { api: { news: Record<string, unknown> } }).api;
    api.news = new Proxy(api.news, {
      get: (target, key) =>
        key === 'sentiment'
          ? () => Promise.resolve({ ok: false, error: 'server_unavailable' })
          : target[key as string],
    });
  });
  await failing.goto('/');
  await failing.getByRole('button', { name: 'Notícias', exact: true }).click();
  await expect(panel(failing).getByRole('alert')).toContainText(
    'Não foi possível falar com o servidor',
  );
  // As fontes continuam na tela.
  await expect(failing.getByRole('heading', { name: 'Fontes de notícias' })).toBeVisible();
  await failing.close();
});

test('ficha do ativo: o tom em cada notícia, a nota e as contagens do pregão (CA05)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = { role: 'user', sentiment: 'visible' };
  });
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ativos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir a ficha de PETR4' }).click();
  const section = page.getByRole('region', { name: 'Notícias', exact: true });
  const items = section.locator('.asset-news-list').first().locator(':scope > li');
  await expect(items.first()).toContainText('Tom: Positivo');
  await expect(items.nth(2)).toContainText('Tom: Negativo');
  // A pendente fica sem etiqueta.
  await expect(items.nth(4).locator('.sentiment-tag')).toHaveCount(0);
  await expect(section).toContainText(
    'Tom classificado automaticamente (Dicionário de termos v1); pode errar. Não é recomendação.',
  );

  // O 8º marcador é o pregão de 11/11/2026: uma positiva e uma pendente. O de 12/11 fica colado e
  // cobre parte dele; o gráfico escolhe o marcador mais perto do clique, no centro deste.
  await page.locator('.chart-news').nth(7).click({ force: true });
  const session = page.getByRole('region', { name: /Notícias do pregão de 11 de nov/ });
  await expect(session).toContainText(
    'No pregão: 1 positiva, nenhuma neutra, nenhuma negativa; e 1 ainda sem tom.',
  );
});

test('sem modelo visível, a ficha fica como na SPEC-029', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __MOCK__: unknown }).__MOCK__ = { role: 'user' };
  });
  await page.addInitScript({ path: 'mocks/window-api.js' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ativos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir a ficha de PETR4' }).click();
  const section = page.getByRole('region', { name: 'Notícias', exact: true });
  await expect(section.locator('.asset-news-item').first()).toBeVisible();
  await expect(section.locator('.sentiment-tag')).toHaveCount(0);
  await expect(section).not.toContainText('Tom classificado automaticamente');
});

test('375 px: a tela do colaborador sem rolagem para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openNews(page, { evaluation: { testSize: 60, macroF1: 0.64, accuracy: 0.7 } });
  await panel(page).getByRole('button', { name: 'Avaliar agora' }).click();
  await expect(
    page.getByRole('table', { name: 'Acertos e erros nas notícias de teste' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
