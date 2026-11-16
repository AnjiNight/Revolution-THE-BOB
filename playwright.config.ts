import { defineConfig } from '@playwright/test';

/**
 * Testes de ponta a ponta das telas (validação visual de cada Spec), no renderer do app com o
 * `window.api` falso de `mocks/window-api.js`: sem o Electron, sem o servidor e sem login.
 *
 * Rodam com a janela aberta e devagar (`slowMo`), para dar para acompanhar, no Edge que já vem
 * no Windows (sem baixar navegador). Uso: `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
    headless: false,
    launchOptions: { slowMo: 500 },
    viewport: { width: 1100, height: 800 },
    locale: 'pt-BR',
  },
  webServer: {
    command: 'npm run dev --workspace app -- --rendererOnly',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
