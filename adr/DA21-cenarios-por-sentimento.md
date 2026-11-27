# DA21 — Cenários por probabilidade condicional ao sentimento

| Campo | Valor |
|---|---|
| Status | Aceita em 27/11/2026, com os pontos em aberto decididos na [SPEC-031](../specs/SPEC-031.md) |
| Data | 01/10/2026 |
| Drivers | FAS11, OBJ03, OBJ07, RF30, RF31, Visão §5, §15 |
| Relacionadas | [DA15](DA15-carater-educacional.md), [DA18](DA18-historico-cotacoes-arquivos-b3.md), [DA19](DA19-fontes-de-noticias.md), [DA20](DA20-modelo-ia-noticias.md) |

## Contexto

A equipe quer uma **simulação de cenários com base no sentimento das notícias**. Os requisitos (RF30, RF31) e a Visão (§5) não definem como as probabilidades são calculadas.

## Alternativas consideradas

1. **Ajustar o retorno esperado com um peso fixo** pelo sentimento — não há como justificar o peso escolhido.
2. **Modelo preditivo treinado** para prever alta ou queda — difícil de explicar a um iniciante e mais próximo de uma recomendação (RES04).
3. **Probabilidade condicional a partir do histórico** (estudo de eventos): contar o que aconteceu com o ativo nos dias passados com sentimento parecido com o de hoje.

## Decisão

Alternativa 3.

1. Calcular o **sentimento do dia** de cada ativo a partir das notícias da fonte pai e das curadas (DA19). Notícias publicadas depois do fechamento do pregão contam para o pregão seguinte.
2. Classificar o dia em uma **faixa** (negativo, neutro, positivo).
3. Buscar no histórico os **dias da mesma faixa** e medir o retorno do ativo nos **horizontes** de 1, 5 e 20 pregões.
4. Contar quantas vezes houve **queda**, **estabilidade** (variação dentro de um limite, ex.: ±1%) e **alta**.
5. Exibir também a **taxa-base**: as mesmas contagens sem considerar o sentimento.
6. Exibir o **número de ocorrências (n)**. Abaixo de um mínimo (ex.: 30), mostrar "dados insuficientes".
7. Exibir sempre o **aviso educacional** (DA15).
8. **Registrar** cada cenário exibido, para comparar depois com o que aconteceu (Visão §15).

Exemplo de saída:

> Nas 38 vezes em que o sentimento sobre PETR4 estava negativo, nos 5 pregões seguintes a ação **caiu em 58%**, **ficou estável em 12%** e **subiu em 30%** das vezes.
> Sem considerar as notícias: caiu em 45%, ficou estável em 12% e subiu em 43%.

## Consequências

- (+) Explicável para o iniciante: são contagens do que já aconteceu.
- (+) A comparação com a taxa-base **é a própria pesquisa do projeto (OBJ03)**: se os números forem iguais, o sentimento não ajuda, e esse também é um resultado válido.
- (+) Os cenários registrados permitem medir a qualidade das probabilidades ao longo do tempo.
- (−) Depende de histórico longo de notícias classificadas e de cotações (DA18, DA20).
- (−) Ativos com pouca cobertura de notícias terão poucas ocorrências.

## Pontos em aberto

Decididos na [SPEC-031](../specs/SPEC-031.md) (27/11/2026):

1. Horizontes: no pregão, 5 e 20 pregões depois, a partir do fechamento anterior (como o painel do pregão da SPEC-029); estável dentro de ±1%, ±2% e ±4%.
2. Mínimo de 30 ocorrências (RB31).
3. Todos os usuários veem, por enquanto; com a SPEC-025 na `main`, pode virar recurso de assinante.
4. Não: o cenário usa só a fonte pai e as curadas (DA19), igual para todos.

O cenário é por ativo, na ficha (OPEN-34).

## Impacto nos outros documentos

- **Requisitos:** RF30 e RF31 reescritos com este método.
- **Modelo de domínio:** SIMULACAO ganha ativo, horizonte, faixa de sentimento, probabilidades, n e taxa-base (ou nova entidade CENARIO).
- **Visão de produto:** §5 passa a explicar a origem das porcentagens.
