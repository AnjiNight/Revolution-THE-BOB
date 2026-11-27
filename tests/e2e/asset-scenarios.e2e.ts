import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-031 — cenários por sentimento na ficha do ativo, com o `window.api` falso de
 * `mocks/window-api.js` (usuária e ativo fictícios).
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

const section = (page: Page) => page.getByRole('region', { name: 'Cenários pelo sentimento' });

test('sem o sentimento validado: o aviso, sem números, e as frases fixas (CA05)', async ({
  page,
}) => {
  await openAsset(page);
  await expect(section(page)).toContainText(
    'Os cenários aparecem quando a equipe validar o sentimento das notícias.',
  );
  await expect(section(page).getByRole('table')).toHaveCount(0);
  await expect(section(page)).toContainText('não uma previsão');
  await expect(section(page)).toContainText('Não é recomendação de compra ou venda.');
});

test('a faixa de hoje, a frase, a tabela e os horizontes; "dados insuficientes" abaixo de 30 (CA03, CA07)', async ({
  page,
}) => {
  await openAsset(page, { sentiment: 'visible' });
  const s = section(page);
  await expect(s).toContainText('Sentimento de hoje (3 notícias):');
  // Abre em "5 pregões depois".
  await expect(s.getByRole('radio', { name: '5 pregões depois' })).toBeChecked();
  await expect(s).toContainText(
    'Nas 38 vezes em que o sentimento sobre a PETR4 foi negativo, 5 pregões depois ela tinha caído em 58%, ficado estável em 12% e subido em 30% das vezes.',
  );
  const negative = s.getByRole('row', { name: /Negativo/ });
  await expect(negative).toContainText('58%');
  await expect(s.getByRole('row', { name: /Sem olhar as notícias/ })).toContainText('45%');

  // 20 pregões depois: a faixa de hoje tem 21 ocorrências, abaixo de 30: sem frase e sem %.
  await s.getByRole('radio', { name: '20 pregões depois' }).check();
  await expect(s.getByRole('row', { name: /Negativo/ })).toContainText('Dados insuficientes');
  await expect(s).not.toContainText('Nas 21 vezes');
  await expect(s).toContainText('Estável: variação de até ±4% (20 pregões depois)');
});

test('celular (375 px) e inglês: sem rolagem lateral (CA07)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openAsset(page, { sentiment: 'visible' });
  await section(page).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('region', { name: 'Scenarios by sentiment' })).toContainText(
    'Of the 38 times the sentiment about PETR4 was negative',
  );
});
