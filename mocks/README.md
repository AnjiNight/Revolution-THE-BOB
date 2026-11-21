# Mocks para a validação visual

Dados **fictícios** para testar as telas do app no navegador, sem o Electron, sem o servidor e sem login.

## `window-api.js`

Substitui o `window.api` que o Electron expõe (preload). Uso:

1. Rode o renderer do app: `npm run dev:app` (ele fica em `http://localhost:5173`).
2. No Playwright, antes de abrir a página: `page.addInitScript({ path: 'mocks/window-api.js' })`.
3. Opções, num script antes deste: `window.__MOCK__ = { delayMs: 1500, scenario: 'vazio' }`.

O que ele simula:

| Parte | Dados fictícios |
|---|---|
| Sessão | Colaboradora "Colaboradora Teste" (`colaboradora@exemplo.test`), já conectada |
| Fontes de notícias (SPEC-027) | Investidor10 (fonte pai, 251 notícias), Agência Brasil – Economia (10 notícias) e "Feed Fictício Fora do Ar" (4 falhas seguidas, para o aviso "com problema"); arquivo em 8.000 de 22.491 |
| Últimas notícias (SPEC-028) | 261 notícias, 154 com vínculo; na lista, uma notícia fictícia com PETR4 principal e PRIO3 citado, uma agenda fictícia com 9 tickers de lista e uma da Agência Brasil sem ativo |
| Carteiras (SPEC-045) | Só a lista, com uma carteira ao vivo "Teste do calendário"; abrir uma carteira responde `server_unavailable` |
| Cenário `vazio` | Só a fonte pai, sem coleta, sem arquivo e com o interruptor do Investidor10 desligado |
| Recusas | Endereço com `interno`, `localhost` ou `10.0.` → `private_address`; com `pagina` → `not_a_feed`; endereço repetido → `source_exists`; mudar a fonte pai → `parent_source` |

As chamadas ficam em `window.__MOCK_CALLS__`. O que não está simulado responde `server_unavailable`.
