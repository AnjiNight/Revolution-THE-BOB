# DA15 — Caráter educacional garantido pela arquitetura

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | OBJ07, RES04, RB18, RB19 |
| Relacionadas | [DA11](DA11-noticias-ia-modulo-isolado.md), [DA21](DA21-cenarios-por-sentimento.md) |

## Contexto

RB18, RB19 e restrição regulatória da CVM (RES04).

## Alternativas consideradas

1. **Aviso como texto fixo em cada tela** — depende de cada desenvolvedor lembrar de incluir; fácil de esquecer em uma tela nova.
2. **Indicador na própria resposta do servidor**, que o cliente é obrigado a exibir.

## Decisão

Alternativa 2. Toda resposta que contém projeção, cenário ou análise carrega um **indicador de natureza educacional** que o cliente é obrigado a exibir com o aviso padrão. Nenhum módulo produz saídas do tipo "compre" ou "venda".

## Consequências

- (+) Uma tela nova que mostre cenários herda o aviso automaticamente.
- (−) Textos gerados pelo modelo de IA ([DA20](DA20-modelo-ia-noticias.md)) também precisam passar por essa regra, inclusive resumos de notícias.
