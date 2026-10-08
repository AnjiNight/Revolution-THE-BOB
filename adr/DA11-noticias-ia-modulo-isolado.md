# DA11 — Notícias e IA como módulo isolado

| Campo | Valor |
|---|---|
| Status | Aceita — **complementada por [DA19](DA19-fontes-de-noticias.md) e [DA20](DA20-modelo-ia-noticias.md)** (01/10/2026) |
| Data | 24/09/2026 |
| Drivers | FAS04, OBJ03, PA04, QA09 |
| Relacionadas | [DA07](DA07-ingestao-assincrona.md), [DA15](DA15-carater-educacional.md), [DA21](DA21-cenarios-por-sentimento.md) |

## Contexto

A análise de notícias é objetivo de pesquisa com resultado incerto (OBJ03, Requisitos §7), prioridade *Could*, e a Visão prevê crescimento para IA conversacional e probabilidades (Visão §20, §25). Esse processamento não pode prejudicar o núcleo (PA04).

## Alternativas consideradas

1. **Classificação dentro da requisição do usuário** — resultado sempre "na hora", mas lento e sujeito às falhas do classificador.
2. **Módulo isolado, executado apenas no processador de tarefas**, com o classificador atrás de uma interface.

## Decisão

Alternativa 2.

- O módulo **Notícias e Sentimento** só roda no processador de tarefas, nunca dentro de uma requisição do usuário.
- A classificação fica atrás de uma interface "classificador"; a implementação (regras simples, modelo local ou serviço externo de IA) pode ser trocada sem afetar o resto. A implementação escolhida está em [DA20](DA20-modelo-ia-noticias.md).
- Outros módulos só **leem** o resultado (notícia, ativos vinculados, sentimento). Se o módulo estiver fora do ar, a ficha do ativo aparece sem notícias, e nada mais é afetado.
- Toda saída analítica (sentimento, projeção, futura resposta de IA) é tratada como **cenário**, nunca como recomendação (DA15).

## Consequências

- (+) O MVP pode ser entregue mesmo que a pesquisa de sentimento não dê resultado.
- (+) A evolução para assistente de IA entra como novo módulo consumidor dos existentes (QA09).
