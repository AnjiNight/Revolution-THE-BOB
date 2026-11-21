# DA22 — Escopo inicial: ações e fundos imobiliários; renda fixa adiada

| Campo | Valor |
|---|---|
| Status | Aceita, com pontos em aberto — **pontos 2 e 3 resolvidos por [DA23](DA23-classes-de-ativo-acoes-e-fiis.md)** (08/10/2026) |
| Data | 02/10/2026 |
| Drivers | OBJ01, OBJ04, RES01, RES02, FAS02 |
| Altera | [DA07](DA07-ingestao-assincrona.md), [DA10](DA10-nucleo-calculo-puro.md), [DA16](DA16-cotacoes-por-plano.md), [DA17](DA17-carteira-ao-vivo-e-historica.md), [DA18](DA18-historico-cotacoes-arquivos-b3.md) |
| Relacionadas | [DA06](DA06-adaptadores-fontes-externas.md), [DA09](DA09-lancamentos-imutaveis.md) |

## Contexto

A equipe decidiu concentrar a primeira fase do produto em **ações** e **fundos imobiliários (FIIs)** e deixar a **renda fixa** (CDB, LCI/LCA, Tesouro Direto) para uma fase futura.

A renda fixa trazia, sozinha, boa parte da complexidade do escopo: regras fiscais (IR, IOF, carência), base de 252 dias úteis com calendário de feriados bancários, séries de Selic e IPCA, uma fonte própria para o Tesouro Direto e várias decisões ainda em aberto (tipos de remuneração, isenção de LCI/LCA, valorização do Tesouro). Isso pesa contra o prazo de um semestre e a equipe de duas pessoas (RES01, RES02).

FIIs, por outro lado, são negociados na B3 como ações: têm ticker, cotação durante o pregão e fechamento diário.

## Alternativas consideradas

1. **Manter a renda fixa no escopo inicial** — atende o escopo original, mas com alto custo de regras e decisões pendentes.
2. **Ações e FIIs agora; renda fixa adiada** — reaproveita o mesmo fluxo de cotações e de compra e venda para os dois tipos de ativo.
3. **Apenas ações** — ainda mais simples, mas a equipe quer oferecer uma segunda classe de ativo desde o início.

## Decisão

Alternativa 2.

- **Escopo atual:** ações e FIIs negociados na B3. O FII é tratado como um ativo da classe "FII": mesma busca, mesma ficha, mesmas cotações, mesma compra e venda e mesmo livro-razão (DA09) das ações.
- **CDI continua** no escopo, apenas como **benchmark** (RF16).
- **Adiados para a fase de renda fixa:** RF23, RF24, RF25, RF34; RB14 a RB17; importação de Selic e IPCA; calendário de feriados bancários; preços do Tesouro Direto; a entidade de aplicação em renda fixa; o atributo de vencimento e a relação ativo–indexador.
- Os itens adiados ficam **preservados com os mesmos IDs** ([Requisitos §9](../requisições.md)), e a arquitetura mantém os pontos de extensão para que a renda fixa entre depois como novo tipo de lançamento e novas fontes, sem refazer o núcleo (DA06, DA09, DA10).

## Consequências

- (+) Menos regras fiscais, menos fontes externas e menos decisões em aberto na primeira fase.
- (+) FIIs reaproveitam integralmente a ingestão de cotações (DA16, DA18) e os lançamentos (DA09).
- (−) **Para FIIs, os rendimentos mensais distribuídos são parte importante do retorno.** Sem uma fonte de proventos, a rentabilidade simulada de FIIs fica distorcida. O ponto em aberto de proventos de [DA17](DA17-carteira-ao-vivo-e-historica.md) e [DA18](DA18-historico-cotacoes-arquivos-b3.md) ganha prioridade.
- (−) O catálogo curado (~40 a 50 ativos no plano gratuito de cotações, DA16) passa a ser dividido entre ações e FIIs.
- (−) Os cenários das personas que usavam renda fixa precisaram ser ajustados.

## Pontos em aberto

1. **Fonte de proventos**, incluindo os rendimentos mensais dos FIIs (mesmo ponto de DA17 e DA18, agora prioritário).
2. **Benchmark para FIIs:** a baseline define apenas CDI e Ibovespa (RF16). Usar também um índice de FIIs?
3. **Classificação setorial de FIIs** para a distribuição por setor (RF18): os FIIs são classificados por segmento, diferente dos setores das ações.
4. Confirmar que as fontes de cotação escolhidas (DA16, DA18) cobrem os FIIs do catálogo.
5. **Quando a renda fixa voltar:** revisar RB16 (tratamento fiscal por produto), tipos de remuneração, valorização do Tesouro Direto e renda fixa na carteira histórica.

## Impacto nos outros documentos

- **Requisitos:** versão 1.2 — escopo, RF10, RB21 e nova seção 9 com os itens adiados.
- **Modelo de domínio:** `classe` do ATIVO inclui FII; `vencimento` e a relação ATIVO–INDEXADOR ficam para a fase de renda fixa; INDEXADOR e TAXA_DIARIA permanecem só para o CDI.
- **Personas:** cenários da P01 e da P02 trocam renda fixa por FII.
- **Drivers:** FAS02 adiada; QA01 e QA10 sem renda fixa.
- **Arquitetura e Decisões Técnicas:** fontes, tarefas, módulos e entidades de renda fixa movidos para pontos de extensão.
- **Diagrama de casos de uso:** o caso de uso "Projetar renda fixa" fica fora do escopo atual.
