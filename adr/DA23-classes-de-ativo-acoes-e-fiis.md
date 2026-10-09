# DA23 — Classes de ativo: Ações e FIIs separados, como nas corretoras

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 08/10/2026 |
| Drivers | OBJ01, OBJ02, QA13, RES08 |
| Resolve | Pontos em aberto 2 e 3 de [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md) |
| Relacionadas | [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md), [DA16](DA16-cotacoes-por-plano.md), [DA17](DA17-carteira-ao-vivo-e-historica.md) |

## Contexto

O escopo atual cobre "ações e FIIs" ([DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md)), mas não definia o que pertence a cada grupo. Na B3, papéis de tipos diferentes podem ter tickers parecidos: FIIs (MXRF11), ETFs (BOVA11) e units (TAEE11) terminam em 11. Também estavam em aberto o benchmark dos FIIs e a classificação setorial dos FIIs, que usam **segmentos** (logística, shoppings, papel…) em vez dos setores das ações.

As corretoras resolvem isso separando os ativos em **classes** (Ações, FIIs, ETFs, BDRs), cada uma com sua forma de classificação, referência de comparação e tipo de provento. A equipe decidiu seguir o mesmo modelo.

## Alternativas consideradas

1. **Deduzir o tipo pelo ticker** (ex.: final 11 = FII) — simples, mas errado: ETFs e units também terminam em 11.
2. **Classe como texto livre** definida no cadastro — flexível, mas permite valores inconsistentes.
3. **Lista fechada de classes**, definida pelo colaborador no cadastro, como nas corretoras.

## Decisão

Alternativa 3.

| Classe | Exemplos | Classificação | Proventos | Benchmark | Escopo |
|---|---|---|---|---|---|
| **Ação** (inclui units) | PETR4, VALE3, TAEE11 | Setor | Dividendos e JCP | Ibovespa | ✅ Atual |
| **FII** | MXRF11, HGLG11 | Segmento | Rendimentos mensais | IFIX (evolução); hoje CDI e Ibovespa | ✅ Atual |
| ETF | BOVA11, IVVB11 | — | — | — | ❌ Fora |
| BDR | AAPL34 | — | — | — | ❌ Fora (mercado internacional, RES08) |

Regras:

- Todo ativo pertence a **exatamente uma classe**, definida pelo colaborador no cadastro (RF39), e a classe **não muda** depois.
- A classe **nunca** é deduzida do ticker.
- **Units** são tratadas como ação, como fazem as corretoras: representam ações da mesma empresa.
- Ações são classificadas por **setor**; FIIs por **segmento**. Busca (RF07) e distribuição da carteira (RF18) mostram as duas classes separadas.
- No escopo atual, carteiras com FIIs são comparadas com **CDI e Ibovespa** (RF16). O **IFIX** fica como evolução, pela mesma pendência de fonte histórica do Ibovespa (PE06).

## Consequências

- (+) Interface familiar para quem já usa corretora: a carteira mostra os blocos "Ações" e "FIIs".
- (+) Fecha os pontos 2 e 3 de DA22 e evita erros de classificação pelo ticker.
- (+) ETFs e BDRs podem entrar depois como novas classes, sem mudar a estrutura.
- (−) O colaborador precisa informar a classe e o setor ou segmento de cada ativo no cadastro.
- (−) Enquanto o IFIX não entra, a comparação de FIIs com o Ibovespa é menos representativa.

## Pontos em aberto

1. Lista inicial de setores (ações) e segmentos (FIIs) usada no catálogo.
2. Fonte do IFIX, quando ele entrar como benchmark.

## Impacto nos outros documentos

- **Requisitos:** escopo (ETFs, BDRs e opções fora); RF07 e RF18 citam classe, setor e segmento; nova regra de classe única e imutável.
- **Modelo de domínio:** `classe` do ATIVO passa a ser lista fechada (Ação, FII); setor para ações e segmento para FIIs.
- **Mapa de specs:** OPEN-46 e OPEN-47 resolvidas; SPEC-006, SPEC-020 e SPEC-021 ajustadas.
- **Arquitetura:** PE14 e PE15 resolvidas.
