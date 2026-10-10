import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

/**
 * No modo de desenvolvimento, o Vite injeta o CSS na página como blocos <style>, e a CSP do
 * app (style-src 'self') bloqueia esses blocos: a tela abria sem nenhum estilo. Só no `dev`,
 * liberamos estilo inline. O app compilado (e o instalador) mantém a CSP original, porque lá o
 * CSS vira um arquivo próprio, permitido por 'self'.
 */
function allowInlineStylesInDev(): Plugin {
  return {
    name: 'simulador:allow-inline-styles-in-dev',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@simulador/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Preload em sandbox precisa ser CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), allowInlineStylesInDev()],
  },
});
