# DA06 — Fontes externas atrás de adaptadores

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | QA08, RES07, PRE03 |
| Relacionadas | [DA07](DA07-ingestao-assincrona.md), [DA16](DA16-cotacoes-por-plano.md), [DA18](DA18-historico-cotacoes-arquivos-b3.md), [DA19](DA19-fontes-de-noticias.md) |

## Contexto

Cotações, indexadores e notícias vêm de APIs gratuitas que podem mudar, cobrar ou sair do ar (RES07, PRE03, QA08).

## Alternativas consideradas

1. **Chamar cada API diretamente** no código dos módulos que precisam do dado — rápido, mas o formato externo se espalha pelo sistema e trocar de provedor obriga a mexer em regras e telas.
2. **Biblioteca de terceiros que agrega várias fontes** — menos código, mas o sistema passa a depender do formato e da manutenção dessa biblioteca.
3. **Adaptadores próprios** que implementam interfaces definidas pelo sistema.

## Decisão

Alternativa 3. Cada fonte externa é acessada por um **adaptador** que implementa uma interface definida pelo sistema, por exemplo "provedor de cotações" ("dê-me as cotações do ativo X entre as datas A e B"). O adaptador converte o formato externo para o formato do domínio (camada anticorrupção).

## Consequências

- (+) Trocar ou adicionar provedor = escrever um novo adaptador (QA08).
- (+) Permite fontes configuráveis pelo usuário ([DA19](DA19-fontes-de-noticias.md)) e provedores diferentes por plano ([DA16](DA16-cotacoes-por-plano.md)).
- (+) Permite usar adaptadores falsos nos testes.
- (−) Uma interface a mais para cada tipo de fonte.
