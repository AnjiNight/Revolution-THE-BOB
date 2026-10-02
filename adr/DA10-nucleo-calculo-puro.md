# DA10 — Núcleo de cálculo financeiro puro

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | QA01, QA10, FAS01, FAS02, RNF12, RNF16, RB13–RB17 |
| Relacionadas | [DA02](DA02-camadas-mvc.md), [DA09](DA09-lancamentos-imutaveis.md) |

## Contexto

Os cálculos são o coração do produto (QA01) e mudam com regras fiscais (RB14–RB17).

## Alternativas consideradas

1. **Regras espalhadas** pelas telas, consultas SQL e controladores — difícil de testar e de manter consistente.
2. **Módulo de cálculo puro**, sem acesso a banco, rede ou interface.

## Decisão

Alternativa 2. Todos os cálculos (preço médio, posição, rentabilidade, comparação com benchmark, IR, IOF, dias úteis na base 252) ficam em um **módulo sem acesso a banco, rede ou interface**: recebe dados, devolve resultados. Valores monetários usam **tipo decimal** em todas as camadas; ponto flutuante é proibido para dinheiro (RNF12). Arredondamento: duas casas, meio para cima (RB13), aplicado apenas no resultado final de cada operação.

## Consequências

- (+) Testes rápidos e determinísticos com casos de referência (QA10), inclusive comparados à calculadora do Tesouro Direto (Requisitos §7).
- (+) O mesmo núcleo serve para a carteira ao vivo, a carteira histórica ([DA17](DA17-carteira-ao-vivo-e-historica.md)), a futura carteira real e as projeções.
