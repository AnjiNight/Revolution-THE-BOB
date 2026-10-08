# DA09 — Lançamentos imutáveis e posição derivada

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | FAS01, QA11, RB08, RB09, RNF15 |
| Relacionadas | [DA10](DA10-nucleo-calculo-puro.md), [DA17](DA17-carteira-ao-vivo-e-historica.md) |

## Contexto

RB08 (transação imutável, correção por estorno), RB09 (posição derivada, nunca editada) e QA11 (rastreabilidade).

## Alternativas consideradas

1. **Tabela de posição editável** — leitura rápida, mas a posição pode divergir do histórico e não há como reconstruir o passado.
2. **Livro-razão de lançamentos imutáveis**, com posição sempre calculada.

## Decisão

Alternativa 2. A carteira funciona como um **livro-razão**: tudo que altera a carteira é um **lançamento** (compra, venda, aporte, retirada, aplicação e resgate de renda fixa, estorno) que só é **incluído**, nunca alterado ou apagado. Posição, caixa, preço médio e rentabilidade são sempre **calculados** a partir dos lançamentos e das cotações.

## Consequências

- (+) É possível reconstruir a carteira em qualquer data passada, base do gráfico de evolução patrimonial (RF17) e do "e se eu tivesse mantido?" (Visão §14).
- (+) A auditoria (RNF15) sai de graça.
- (−) Recalcular tudo a cada consulta tem custo, resolvido pelo cache do DA08. Se necessário, fotografias periódicas da posição podem ser guardadas como **otimização**, nunca como fonte da verdade.
- (−) Incluir um lançamento com data anterior a lançamentos já existentes muda o caixa de todos os posteriores; por isso [DA17](DA17-carteira-ao-vivo-e-historica.md) impõe ordem cronológica.
