# DA17 — Carteira ao vivo e carteira histórica

| Campo | Valor |
|---|---|
| Status | Aceita, com pontos em aberto — **trechos de renda fixa adiados por [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md)**; FIIs seguem as mesmas regras das ações (02/10/2026) |
| Data | 01/10/2026 |
| Drivers | OBJ01, FAS01, QA01, QA11, RB05–RB13, P01, P02 |
| Relacionadas | [DA09](DA09-lancamentos-imutaveis.md), [DA16](DA16-cotacoes-por-plano.md), [DA18](DA18-historico-cotacoes-arquivos-b3.md) |

## Contexto

A equipe decidiu que o usuário pode **montar carteiras no passado**, além de simular com o preço atual. Esse é o cenário da P01 ("o aplicativo apresenta a evolução histórica").

Permitir datas passadas **em qualquer carteira** cria dois problemas:

1. **Revalidação em cascata.** Como a posição é derivada do histórico (DA09), um lançamento incluído "no meio" muda o caixa de todos os lançamentos posteriores, e lançamentos já aceitos podem ficar inválidos.
   *Exemplo:* aporte de R$ 1.000 em 01/03 e compra de R$ 900 em 05/03. Se o usuário incluir depois uma retirada de R$ 500 em 02/03, a compra de 05/03 passa a não ter saldo (RB05).
2. **Mistura de resultados.** Uma carteira acompanhada de verdade ao longo do tempo seria misturada com operações escolhidas já se sabendo o resultado.

## Alternativas consideradas

1. **Proibir datas passadas** — simples, mas contraria a decisão da equipe.
2. **Permitir datas passadas em qualquer carteira**, revalidando todo o histórico a cada inclusão.
3. **Dois tipos de carteira**, escolhidos na criação e imutáveis: ao vivo e histórica.

## Decisão

Alternativa 3.

| | Carteira ao vivo | Carteira histórica |
|---|---|---|
| Data do lançamento | Sempre o momento atual, definido pelo servidor | Escolhida pelo usuário, no passado |
| Preço da compra/venda | Última cotação disponível para o plano ([DA16](DA16-cotacoes-por-plano.md)) | Fechamento do pregão da data escolhida (RB07) |
| Ordem dos lançamentos | Natural | Cada lançamento deve ter data **igual ou posterior** à do último lançamento da carteira |
| Rótulo na interface | "Simulação ao vivo" | "Simulação histórica: resultado calculado com dados já conhecidos" |

Regras comuns:

- RB05, RB06 e RB08–RB13 valem para os dois tipos.
- O tipo da carteira é definido na criação e **não pode ser alterado**.
- A carteira histórica é valorizada até a data atual, para mostrar "quanto valeria hoje".
- Os dois tipos usam o mesmo núcleo de cálculo (DA10) e o mesmo livro-razão (DA09).

## Consequências

- (+) Evita a revalidação em cascata e mantém honestos os resultados das carteiras ao vivo.
- (+) Atende os cenários da P01 (evolução histórica) e da P02 (comparar estratégias).
- (−) Exige histórico longo de cotações e indexadores ([DA18](DA18-historico-cotacoes-arquivos-b3.md)).
- (−) Um backtest de ações sem **dividendos, JCP, desdobramentos e grupamentos** dá resultado errado (ex.: PETR4 paga dividendos altos).

## Pontos em aberto

1. Até quando no passado o usuário pode começar? Sugestão: o mesmo limite do histórico disponível (DA18).
2. Fonte de proventos e eventos corporativos.
3. A comparação de carteiras (RF19) pode misturar os dois tipos? Sugestão: sim, sempre com o rótulo visível.
4. Renda fixa na carteira histórica precisa da série histórica do indexador (o SGS do Banco Central cobre) e da taxa contratada (hoje ausente do modelo).

## Impacto nos outros documentos

- **Requisitos:** RB07 reescrita para os dois tipos; novas regras "tipo da carteira é imutável" e "lançamentos da carteira histórica em ordem cronológica"; RF11 inclui a escolha do tipo.
- **Modelo de domínio:** atributo `tipo` em CARTEIRA; TRANSACAO guarda horário e nível da cotação usada.
- **Personas:** o cenário da P01 corresponde à carteira histórica.
