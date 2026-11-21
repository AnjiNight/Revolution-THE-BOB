# SPEC-042 — Proventos e eventos corporativos

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pela Nicoly em 04/11/2026, como escrita, e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)), junto com a SPEC-041 |
| Prioridade | *Should* aqui; os proventos são pré-requisito da rentabilidade correta nas SPECs 016 e 019 (OPEN-06, prioritária) |
| Depende de | [SPEC-008](SPEC-008.md) (histórico de preços), [SPEC-010](SPEC-010.md) (ficha e gráfico), [SPEC-041](SPEC-041.md) (a mesma visita ao Investidor10 traz os dividendos) |
| Requisitos | RF08; RNF04, RNF12, RNF13, RNF17, RNF18, RNF20 |
| Casos de uso | Buscar ativo → Consultar cotação (a ficha do ativo) |
| Drivers | OBJ01, OBJ02, FAS03, QA02, RES03 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md), [DA18](../adr/DA18-historico-cotacoes-arquivos-b3.md) |

---

## 1. Objetivo

O sistema passa a guardar:

- os **proventos** de cada ação e FII: dividendos, juros sobre capital próprio (JCP), rendimentos e amortizações, com a data com, a data de pagamento e o valor por ação ou cota, pelo **Investidor10** (§4.1 da SPEC-041);
- os **eventos corporativos** das ações: desdobramentos, grupamentos e bonificações, com o fator, pela **B3**.

A ficha do ativo mostra os proventos e, no gráfico, os **saltos de preço explicados** por um evento deixam de aparecer como saltos: o usuário pode ver o preço **ajustado** pelos eventos ou **como a B3 publicou**.

## 2. Valor

- **Usuário:** vê quanto um ativo pagou e quando, e um gráfico que não "cai 90%" num desdobramento.
- **Sistema:** resolve a OPEN-06 (fonte e tratamento de proventos e eventos) para as SPECs 016 e 019, que precisam somar os proventos e corrigir a quantidade de ações na carteira.
- **Custo zero** (RES03).

## 3. Escopo

### 3.1 Inclui

1. **Proventos pelo Investidor10:** a tabela de dividendos da página de cada ativo, lida na mesma visita da SPEC-041.
2. **Eventos pela B3:** a lista de desdobramentos, grupamentos e bonificações de cada empresa, na página pública da empresa no site da B3.
3. **Ajuste do histórico de preços pelos eventos** no núcleo de cálculo (DA10), sem mudar o preço guardado.
4. **Ficha do ativo:** lista de proventos (com filtro de período) e escolha "Ajustado por desdobramentos e grupamentos" ou "Como a B3 publicou" no gráfico.

### 3.2 Não inclui

- **Proventos e eventos na carteira** (somar ao caixa, corrigir a quantidade): SPECs 014, 016 e 019, que usam estas tabelas.
- **Ajuste do preço pelos proventos** (preço "total return"): fica para a SPEC-019, que calcula a rentabilidade com os proventos de verdade.
- **Subscrições** e **eventos de FIIs** (desdobramento de cotas é raro): ficam para depois; os saltos sem explicação continuam marcados (SPEC-010).
- Impostos sobre JCP: o valor guardado é o **bruto**, como a fonte publica.

## 4. Decisões

### 4.1 Conferido nas fontes em 04/11/2026

| Fonte | O que tem |
|---|---|
| Investidor10, tabela de dividendos (`#table-dividends-history`) | Tipo ("Dividendos", "JSCP", "Rendimento", "Amortização"), data com, data de pagamento e valor por ação ou cota. **PETR4: 142 proventos, desde 2000; MXRF11: 126, desde 06/2016**. A tabela é paginada na tela, mas a página traz todas as linhas |
| B3, página da empresa (`listedCompaniesProxy/.../GetListedSupplementCompany`) | `stockDividends`: tipo ("DESDOBRAMENTO", "GRUPAMENTO", "BONIFICACAO"), fator, data com, data de aprovação e o ISIN de cada classe. PETR: 6 eventos, desde 2008 (desdobramento de 100 em 25/04/2008, ON e PN). Também traz os proventos, mas só dos últimos 12 meses |
| B3, termos de uso do site | Os dados do site são "para uso exclusivamente pessoal"; é proibida a publicação ou distribuição para "fins comerciais" sem autorização. O projeto já usa os arquivos públicos de cotações da B3 (DA18) |

### 4.2 Por que duas fontes

O Investidor10 tem o **histórico completo** dos proventos (inclusive dos FIIs, que a B3 só mostra por 12 meses) e já é visitado na SPEC-041. A B3 é a **fonte oficial dos eventos**, com o fator e o ISIN de cada classe de ação, que o ajuste do gráfico precisa exatos.

### 4.3 Aprovadas junto com a Spec (Nicoly, 04/11/2026)

| Tema | Proposta | Motivo |
|---|---|---|
| **Proventos** | Da tabela de dividendos do Investidor10, gravada na visita semanal da SPEC-041, com as mesmas condições da autorização: "Fonte: Investidor10" em toda tela e nada sai do app. Interruptor desligado: os proventos não aparecem | Uma visita só por ativo; §4.1 da SPEC-041 |
| **Eventos** | Da página da empresa na B3, com as mesmas regras da OPEN-07 (brapi): **uso acadêmico, sem fins comerciais, só dentro do app, com "Fonte: B3"**, sem exportar nem repassar. Endereço em `B3_LISTED_BASE_URL` | Os termos da B3 restringem o uso comercial; o projeto é acadêmico e já usa dados públicos da B3 (DA18) |
| Empresa na B3 | Pelo código de 4 letras do ticker (`PETR` de PETR3 e PETR4); o evento vale para o ativo cujo **ISIN** é o do evento (o ISIN vem do arquivo da B3, SPEC-008) | Uma empresa tem várias classes; o ISIN diz qual |
| Ritmo da B3 | Uma consulta por empresa, **uma a cada 2 segundos**, toda semana (domingo às 04:00, depois da coleta do Investidor10), e ao cadastrar um ativo novo | Uns 400 códigos; eventos são raros |
| **Tipos de provento** | Lista fechada: `dividendo`, `jcp`, `rendimento`, `amortizacao`. Tipo desconhecido vira aviso e não é gravado | A carteira (SPEC-019) trata cada um de um jeito (a amortização devolve capital) |
| Valor | Por ação ou cota, em decimal com até **10 casas** (a B3 e o Investidor10 trazem 8), lido pelo texto (RNF12) | Valores como 0,20250435 |
| Idempotência | Provento: chave (ativo, tipo, data com, data de pagamento, valor); a coleta seguinte substitui a lista do ativo inteira, de uma vez. Evento: chave (ativo, tipo, data com) | A fonte corrige valores e datas de vez em quando |
| **Ajuste do gráfico** | Preço ajustado = preço da B3 × fator acumulado dos eventos **depois** daquela data (desdobramento de 100: os preços de antes ficam divididos por 100; grupamento: multiplicados). Bonificação ajusta pelo fator da bonificação. Calculado na leitura (o preço guardado não muda), no núcleo de cálculo, com testes | O preço guardado continua como a B3 publica (SPEC-008); o ajuste só muda o que a tela mostra |
| **Gráfico** | Abre **ajustado**, com a escolha "Como a B3 publicou". Os **saltos** marcados (SPEC-010) passam a ser só os **sem evento** que os explique; o salto explicado mostra o evento no cursor ("Desdobramento 1:100") | Responde ao que a SPEC-010 deixou em aberto (OPEN-06) |
| Variação do período | Com eventos no período, a variação usa o preço ajustado (deixa de ficar sem cálculo, como na SPEC-010) | O salto explicado não é ganho nem perda |
| Ficha: proventos | Lista com tipo, data com, pagamento e valor, do mais recente para o mais antigo, com o total de 12 meses por ação ou cota. Período: 12 meses, 5 anos, tudo | O que o usuário iniciante (P01) procura primeiro |
| Falhas | Como na SPEC-041 (Investidor10) e as 3 novas tentativas da SPEC-008 (B3). Tabela de dividendos que não dá para ler não apaga os proventos guardados do ativo | RNF13 |
| Onde fica | Módulo **Dados de Mercado**; o ajuste no **núcleo de cálculo** (`financial-calculation`) | DA10 |

## 5. Comportamento esperado

### 5.1 Tarefas do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `investidor10` (SPEC-041) | Domingo às 03:00 | Na mesma visita, grava também a tabela de dividendos de cada ativo |
| `eventos_b3` (nova) | Domingo às 04:00; ao cadastrar ativo novo | Consulta a página de cada empresa do catálogo na B3, uma a cada 2 segundos, e grava os eventos das ações |

### 5.2 Rotas

| Rota | Quem | Mudança |
|---|---|---|
| `GET /api/assets/:id/dividends?period=12m\|5y\|all` (nova) | Qualquer pessoa conectada | Lista de proventos (tipo, data com, pagamento, valor em texto), total de 12 meses e `source: 'investidor10'`. Interruptor desligado: 404 `source_disabled` |
| `GET /api/assets/:id/history` (muda, SPEC-010) | Qualquer pessoa conectada | Novo parâmetro `adjusted=true\|false` (padrão `true`); a resposta ganha `events` (tipo, data, fator, `source: 'b3'`) e os saltos passam a vir só os sem explicação |

### 5.3 Telas

| Situação | Tela |
|---|---|
| Ficha do ativo | Nova seção **"Proventos"**: total pago em 12 meses, lista com tipo, data com, pagamento e valor, filtro de período, "Fonte: Investidor10" |
| Gráfico | Escolha "Ajustado por desdobramentos e grupamentos" / "Como a B3 publicou"; eventos marcados no eixo, com "Fonte: B3" |
| Sem proventos | "Nenhum provento registrado para este ativo" |
| Termos | Explicação de "data com", JCP, rendimento e amortização, como os termos do último pregão (SPEC-010) |
| Janela estreita (480px) | A lista de proventos vira cartões |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `provento` (nova) | `ativo_id`, `tipo`, `data_com`, `data_pagamento`, `valor`, `fonte`, `coletado_em` | `tipo` em lista fechada; `valor` decimal(20,10) positivo; `data_pagamento` vazia ou não antes da `data_com`; `fonte` em lista fechada (`investidor10`) |
| `evento_corporativo` (nova) | `ativo_id`, `tipo` (`desdobramento`, `grupamento`, `bonificacao`), `data_com`, `fator`, `aprovado_em`, `fonte`, `coletado_em` | Chave (`ativo_id`, `tipo`, `data_com`); `fator` positivo; `fonte` em lista fechada (`b3`) |
| `tarefa_ingestao` (muda) | Novo valor `eventos_b3` | — |

PROVENTO e EVENTO_CORPORATIVO passam a existir como na arquitetura §9. Nenhuma tabela guarda dado pessoal (DA13). A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O leitor extrai a tabela de dividendos (ação e FII) de páginas de exemplo, com os quatro tipos, em decimal; tipo desconhecido vira aviso |
| CA02 | O leitor da B3 extrai desdobramento, grupamento e bonificação com o fator e o ISIN; o evento vai para o ativo do ISIN certo (PETR3 e PETR4) |
| CA03 | Ajuste conferido com o desdobramento de 100 da Petrobras em 2008 e com um grupamento: o gráfico ajustado não tem salto no dia do evento; o "como a B3 publicou" continua igual ao de hoje |
| CA04 | Saltos marcados só sem evento que os explique; variação do período calculada com o preço ajustado |
| CA05 | Rodar de novo não duplica; a lista do ativo é substituída de uma vez; leitura com erro não apaga o que estava guardado |
| CA06 | Ficha com a seção Proventos, o total de 12 meses, o filtro, a fonte de cada dado e a explicação dos termos; português e inglês, teclado e 480px (RNF04, RNF18, RNF20) |
| CA07 | Interruptor do Investidor10 desligado: sem proventos na tela nem na rota; os eventos da B3 continuam |
| CA08 | Tabelas com as restrições do §6; migração desfeita e refeita (RNF17) |
| CA09 | Testes automatizados dos leitores e do ajuste, sem internet (páginas e respostas montadas nos testes) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | ✅ Propostas do §4.3 aprovadas como escritas (Nicoly, 04/11/2026) |
| OPEN-06 | Fonte resolvida por esta Spec; o **tratamento na carteira** (somar ao caixa, corrigir a quantidade, ajuste por proventos) continua com as SPECs 016 e 019 |
| — | Depois da autorização do Investidor10, os proventos precisam de outra fonte (B3, que só tem 12 meses dos FIIs, ou brapi paga): Spec futura |
| — | Cisão e redução de capital ("CIS RED CAP") não ajustam o gráfico: o salto continua marcado |

## 9. Verificação (05/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| **Fator da B3** | Conferido com a Magalu: o desdobramento e a bonificação vêm em **% de ações novas** (desdobramento 300: 1 ação vira 4; bonificação 5: 1 vira 1,05) e o grupamento como a **própria razão** (0,1: 10 viram 1). O "desdobramento de 100" da Petrobras em 2008 (§4.1) é, portanto, 1 ação virando 2 |
| Formato da B3 | A resposta vem como JSON **dentro de uma string** e os fatores grandes com ponto de milhar ("9.900,00000000000"); o adaptador e o leitor tratam os dois |
| ISIN | Fica em `negociacao_b3.isin` (o `CODISI` de cada ticker nos arquivos da B3), não em `ativo`. Enquanto nenhum ticker tem ISIN, a tarefa espera em vez de registrar um erro por ativo |
| Ativo novo | Os eventos são buscados no domingo às 04:00 e, se a tarefa nunca rodou, no dia seguinte; não há busca na hora do cadastro |
| Preço ajustado | O fechamento ajustado sai com 6 casas; o guardado não muda |

| Critério | Resultado |
|---|---|
| CA01 | ✅ Tabela de dividendos de ação e FII (`investidor10-page.test.ts`): os quatro tipos, "Rend. Trib.", "Provisionado", pagamento antes da data com |
| CA02 | ✅ Leitor da B3 (`b3-events-collection.test.ts`): desdobramento, grupamento e bonificação com fator e ISIN; cisão ignorada; linhas repetidas juntas; ponto de milhar; o evento vai para o ativo do ISIN certo |
| CA03 | ✅ Ajuste (`price-adjustment.test.ts`): desdobramento de 1 para 4 e grupamento de 10 para 1 seguidos, sem salto; "Como a B3 publicou" igual ao de antes |
| CA04 | ✅ Salto explicado por evento não é marcado; variação calculada com o preço ajustado e não calculada sem ajuste com evento no período (`asset-detail-routes.test.ts`) |
| CA05 | ✅ A lista do ativo é substituída de uma vez; leitura com erro não apaga o guardado (PostgreSQL) |
| CA06 | ✅ Ficha com a seção Proventos (total de 12 meses, filtro 12 meses/5 anos/tudo, fonte) e o gráfico com "Ajustado" / "Como a B3 publicou" e a lista de eventos, em português e inglês. ⏳ Conferir na tela do Electron |
| CA07 | ✅ Interruptor desligado: proventos fora da tela e da rota; os eventos da B3 continuam |
| CA08 | ✅ PostgreSQL: provento zerado e pagamento antes da data com recusados; ISIN no formato; migração desfeita e refeita |
| CA09 | ✅ Nenhum teste acessa a internet |
| **De verdade** | ✅ Proventos: **32.657 de 598 ativos** (PETR4: 142, desde 2000; MXRF11: 126, desde 06/2016; ITUB4: 195, desde 2007). Eventos: **472 de 260 ativos** em 297 consultas à B3 (11 min 46 s, sem erros): 181 grupamentos, 146 desdobramentos, 145 bonificações. MGLU3: desdobramento de 1 para 4 em 13/10/2020, grupamento de 10 para 1 em 24/05/2024 e bonificação de 5% em 29/12/2025 |

Total: **753 testes** passando (com o banco real), lint, tipos e formatação.

> **Mudança (05/11/2026, pedido do Luís):** ativo que a coleta do Investidor10 ainda não visitou (sem data de coleta) mostra "Os proventos deste ativo ainda não foram coletados…", em vez de "Nenhum provento nos últimos 12 meses", que fazia parecer que o fundo não paga nada. A ordem da coleta passou a ser a dos mais negociados (nota na SPEC-041).
