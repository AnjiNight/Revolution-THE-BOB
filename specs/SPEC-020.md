# SPEC-020 — Comparação com benchmarks (CDI, Ibovespa e IFIX)

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 08/11/2026, a pedido do Luís; aprovada por ele no mesmo dia com as recomendações do §4.1 (decisão 4 ajustada: o CDI nunca é negativo) e as propostas do §4.2 ("pode implementar") e implementada (§9). Ajustada no mesmo dia, a pedido dele: botão "Comparar com os índices" nos dois gráficos e "o mesmo dinheiro" no índice no gráfico em reais (decisões 3 e 5) |
| Fase | 5 — Acompanhamento da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-019 |
| Prioridade | Should (RF16) |
| Depende de | [SPEC-019](SPEC-019.md) (rentabilidade da cota, períodos e gráfico), [SPEC-007](SPEC-007.md) (série do CDI), [SPEC-005](SPEC-005.md) (calendário de pregão), [SPEC-008](SPEC-008.md) (padrão de ingestão e execuções registradas) |
| Muda | SPEC-019 (o painel **Rentabilidade** ganha as referências, o "% do CDI" e o gráfico em %; a rota `/performance` ganha campos); Início do colaborador (linha da série dos índices, como a do CDI na SPEC-007); [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) (o IFIX deixa de ser "evolução", §4.1 decisão 2) |
| Requisitos | RF16 (e RF09 na carga dos índices); RB13; RNF04, RNF06, RNF12, RNF13, RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | Acompanhar rentabilidade; P02 passo 4 ("a estratégia superou o mercado?") |
| Drivers | OBJ02, QA01, QA02, QA12 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md), [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) |

---

## 1. Objetivo

Mostrar, no painel **Rentabilidade** (SPEC-019), quanto renderam no mesmo período as referências do mercado:

- o **CDI**, que já está carregado (SPEC-007);
- o **Ibovespa** e, nas carteiras com FII, o **IFIX**, que passam a ser carregados da B3 por esta Spec (resolve a OPEN-21).

A comparação usa a mesma régua da SPEC-019: a **rentabilidade acumulada em %** de cada referência, dia a dia, ao lado da rentabilidade da cota da carteira, no número e no gráfico.

## 2. Valor

- **Usuário (P02):** "minha estratégia ganhou do CDI? E da bolsa?". Uma carteira que rendeu +8% em 12 meses parece boa até aparecer, ao lado, o CDI com +14%.
- **Projeto:** fecha o RF16 e a pendência PE06 da arquitetura (fonte do histórico do Ibovespa). Base para a comparação de carteiras (SPEC-022) e o relatório em PDF (SPEC-038).

## 3. Escopo

### 3.1 Inclui

1. **Carga do Ibovespa e do IFIX** (§4.1, decisão 1): fechamento de cada pregão desde 04/01/2016, pela página de estatísticas históricas da B3, com tarefa nova no processador e execuções registradas.
2. **Rentabilidade das referências** no período escolhido na SPEC-019 (1 mês a desde o início, e o personalizado): CDI, Ibovespa e, se a carteira teve FII no período, IFIX (§4.1, decisões 2 e 3).
3. **"% do CDI"** da carteira (§4.1, decisão 4).
4. **Gráfico em %**: a carteira e as referências no mesmo gráfico, ao lado do gráfico em R$ que já existe (§4.1, decisão 5).
5. **Início do colaborador**: até que dia os índices estão carregados e a última atualização, como o CDI.

### 3.2 Não inclui

- **Ibovespa durante o pregão:** a referência vai até o último fechamento publicado pela B3 (§4.1, decisão 6).
- **Simular os mesmos aportes no índice** como medida principal: a régua é a cota (§4.1, decisão 3). Desde o ajuste de 08/11, "o mesmo dinheiro" no índice aparece como complemento, só no gráfico em reais e no "teria" das referências.
- **Rentabilidade por ativo** e distribuição: SPEC-021. **Comparar carteiras:** SPEC-022.
- **Outros índices** (SMLL, IDIV, IPCA): a mesma tarefa aceita novos índices da B3, mas só IBOV e IFIX entram agora.

## 4. Decisões

### 4.1 Aceitas pelo Luís em 08/11/2026

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Fonte do Ibovespa (OPEN-21)** | A página **"Estatísticas históricas" da B3** (o JSON que o próprio site usa, `indexStatisticsProxy/IndexCall/GetPortfolioDay`, no mesmo endereço da SPEC-042): uma consulta por índice e por ano, com o fechamento de cada pregão. Conferido em 08/11/2026 (§4.4) | É a fonte oficial do índice, grátis e sem cota, e já usada no projeto com as regras de uso acadêmico da SPEC-042. As alternativas: o **BOVA11** (já está nos arquivos da B3, mas é um fundo, com taxa e diferença do índice) e a **brapi** (`^BVSP`; o histórico longo gasta a cota e pode não estar no plano grátis) |
| 2 | **IFIX** | Carregar e mostrar o **IFIX** nas carteiras que tiveram FII no período. A [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) passa a dizer que o IFIX entrou na SPEC-020 | A DA23 deixou o IFIX para depois só por falta de fonte (PE06). A mesma página da B3 traz o IFIX desde 2016, sem custo a mais. Para uma carteira de FIIs, o IFIX é a referência que faz sentido |
| 3 | **Como comparar** | Pela **rentabilidade acumulada** de cada referência no mesmo período e nos mesmos dias do gráfico, ao lado da rentabilidade da **cota** da carteira (SPEC-019, decisão 1). **Ajuste de 08/11 (Luís):** como complemento, **"o mesmo dinheiro"** em cada referência: o patrimônio do dia-base com os aportes e retiradas da carteira nos mesmos dias, contados antes do fechamento (como na cota). Aparece no gráfico em reais e no "teria R$ 26.654,53" de cada referência. A %, o resultado e o "% do CDI" continuam pela cota | A cota é o que as corretoras mostram ("carteira × CDI × Ibovespa") e não sofre com aportes e retiradas. "O mesmo dinheiro" responde à outra pergunta, "quanto eu teria se tivesse posto no CDI?", que o Luís pediu no gráfico em reais |
| 4 | **"% do CDI"** | Mostrar "Sua carteira rendeu **61% do CDI**" (rentabilidade da carteira ÷ a do CDI, sem casas decimais) **só quando a carteira está positiva**. O CDI nunca é negativo (observação do Luís); só fica em 0% quando o período ainda não tem nenhum dia de CDI (o primeiro dia de uma carteira nova), e aí também não aparece. Com a carteira negativa, só os números lado a lado | É a medida que o investidor brasileiro já conhece. Com a carteira negativa, "−35% do CDI" confunde mais do que ajuda |
| 5 | **Gráfico** | Um seletor no gráfico da SPEC-019: **"Em reais"** (patrimônio e total aportado, como hoje, e continua sendo o padrão) e **"Em %"** (a cota da carteira). **Ajuste de 08/11 (Luís):** ao lado, o botão **"Comparar com os índices"**, que liga as linhas das referências nos dois: em %, a rentabilidade de cada uma; em reais, "o mesmo dinheiro" em cada uma (decisão 3). Começa desligado e fica como o usuário deixou ao trocar de reais para %. As linhas têm traços diferentes, não só cores, com os nomes na legenda | Reais e % não cabem no mesmo eixo. O padrão continua o da SPEC-019, para não mudar o que a Nicoly entregou; o botão deixa a comparação a um clique nas duas visões |
| 6 | **Hoje** | As referências vão até o **último dia publicado**: o Ibovespa e o IFIX até o último fechamento que a B3 publicou; o CDI até o último dia que o Banco Central publicou. Quando uma referência para antes do fim do período, o painel diz até quando: "Ibovespa até 06/11/2026". Nada é pedido à brapi | Durante o pregão, a carteira já usa a cotação do dia (SPEC-019), mas o índice do dia só sai depois do fechamento. Buscar o `^BVSP` na brapi gastaria a cota da chave de cada pessoa (CLAUDE.md) |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Dia-base das referências** | O mesmo da cota: se a carteira já tinha patrimônio antes do período, o **fechamento do pregão anterior** ao primeiro ponto (o dia do "patrimônio no início" da SPEC-019); se a carteira começa no período, o **fechamento do dia do primeiro aporte**. No dia-base, todas as referências valem 0% | As referências começam a contar quando o dinheiro da carteira começa a contar. Sem patrimônio antes, não há com o que comparar |
| **Conta do CDI** | O CDI de cada dia rende do fechamento daquele dia até o do dia útil seguinte. Por isso, num ponto do gráfico entram as taxas dos dias **do dia-base (inclusive) até o dia do ponto (exclusive)**, com **todos os dias da série**, até os sem pregão (24/12 e 31/12, como pede a SPEC-007 §8). Fator do dia = 1 + taxa ÷ 100 | É a convenção do CDI ("de um dia útil para o outro"). Assim o CDI de sexta, que o Banco Central só publica na segunda, não é necessário para o ponto de sexta |
| **Conta dos índices** | Fechamento do dia do ponto ÷ fechamento do dia-base − 1. Dia sem valor (não deveria acontecer em pregão): o último antes | Variação simples entre dois fechamentos; não acumula erro |
| **Arredondamento** | Fator do CDI com 12 casas na conta (como a cota da SPEC-019); % com 2 casas, meio para cima (RB13); "% do CDI" sem casas, meio para cima | Igual à SPEC-019 |
| **Onde fica** | Núcleo novo `financial-calculation/benchmarks.ts` (puro, DA10): recebe os dias dos pontos, o dia-base, as taxas do CDI e os fechamentos de um índice, e devolve a rentabilidade acumulada de cada ponto. O `TradingService.performance` chama depois da cota. A porta `PortfolioMarket` ganha `cdiRates(from, to)` e `indexCloses(code, from, to)`, ligadas no `api/src/portfolio-market.ts` | Mesma arquitetura das SPECs 019 e 043 |
| **"Carteira com FII"** | O IFIX aparece se algum FII esteve em posição em algum dia do período (pelas posições de cada dia do núcleo da SPEC-019) | Uma carteira de ações não precisa do IFIX |
| **Tarefa no processador** | Nova tarefa `indices_b3`: ao iniciar e às **08:00 e 20:00** (Brasília). Carga retroativa: um pedido por índice e por ano desde 2016, **um a cada 2 segundos** (o ritmo da SPEC-042 na B3); ano fechado já carregado não é pedido de novo. Atualização: o ano atual (e, na primeira semana de janeiro, também o anterior, até ele fechar) | 2 índices × 11 anos = 22 pedidos uma vez; depois, 2 por execução. O horário em que a B3 publica o dia fica para conferir (§8) |
| **Leitura** | Valor como a B3 mostra ("168.498,45"), lido pelo texto, sem ponto flutuante (RNF12), em decimal com 2 casas. Recusados e registrados na execução: data inválida, fim de semana, data futura, valor zero ou negativo. Pregão publicado (SPEC-005) que já passou e não tem fechamento **depois de 1 pregão** vira erro da execução; valor num dia sem pregão no calendário é gravado e vira aviso (o calendário pode estar errado) | Como o CDI na SPEC-007 |
| **Referência sem dados** | Índice ainda não carregado (processador desligado): o painel diz "Ibovespa ainda não carregado: o processador busca na B3" e mostra o resto | O painel não quebra por causa da referência |
| **Fontes na tela** | "Fonte: Banco Central" no CDI e "Fonte: B3" no Ibovespa e no IFIX, só dentro do app, sem exportar (regras da SPEC-042 §4.3 para a B3) | Os termos da B3 permitem o uso pessoal e acadêmico, não o repasse |
| **Exportação (SPEC-034)** | Sem mudança: índices não são dados pessoais | — |

### 4.3 Exemplos (com dados reais da B3 e do Banco Central, conferidos em 08/11/2026)

| Situação | Resultado |
|---|---|
| Período de 2025: dia-base 30/12/2024, último ponto 30/12/2025 | CDI **+14,30%**; Ibovespa **+33,95%** (120.283,40 → 161.125,37); IFIX **+21,15%**. O CDI do ano-calendário dá 14,32% (SPEC-007 §9): a diferença é o dia-base, que é o último pregão de 2024, e não 1º de janeiro |
| 12 meses até 06/11/2026: dia-base 05/11/2025 | CDI **+14,29%**; Ibovespa **+9,92%** (153.294,44 → 168.498,45); IFIX **+1,04%** |
| No ano, até 06/11/2026: dia-base 30/12/2025 | CDI **+11,98%**; Ibovespa **+4,58%**; IFIX **−3,90%** |
| A conta de teste da Nicoly (SPEC-019 §9): 12 meses, carteira **+8,68%** | "Sua carteira rendeu **61% do CDI**" (8,68 ÷ 14,29). Ibovespa +9,92% ao lado; IFIX, porque ela tem MXRF11 |
| Carteira com retorno negativo no período | Sem "% do CDI"; só os números lado a lado |
| Sábado, 07/11: o CDI de sexta (06/11) só sai na segunda | O ponto de 06/11 usa as taxas até 05/11 (§4.2): o CDI vai até 06/11 |
| Segunda, 09/11, às 14h: a carteira tem a cotação do pregão | Ibovespa e IFIX até 06/11 (o fechamento de segunda ainda não saiu): "Ibovespa até 06/11/2026" |
| Carteira nova com o primeiro aporte em 02/01/2025 | Dia-base 02/01/2025: as referências valem 0% nesse dia e começam a contar do fechamento dele |
| Carteira só com ações | CDI e Ibovespa; sem IFIX |

### 4.4 Conferido na B3 em 08/11/2026

| Pergunta | Resposta |
|---|---|
| A consulta | `GET https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/{base64}`, com `{"index":"IBOV","language":"pt-br","year":"2025"}` em base64. Responde JSON: `results` com uma linha por dia do mês (1 a 31) e `rateValue1` a `rateValue12` (um por mês), em texto ("120.125,39"), `null` nos dias sem pregão; e `min` e `max` de cada mês |
| Períodos | IBOV e IFIX de 04/01/2016 até o último pregão (06/11/2026); 2025 com 250 dias, que são os dias úteis bancários do CDI menos 24/12 e 31/12 |
| Valores conferidos | Ibovespa: 42.141,03 (04/01/2016), 60.227,28 (29/12/2016), 120.283,40 (30/12/2024), 161.125,37 (30/12/2025) |
| `^BVSP` na brapi | A lista (`/api/quote/list`) traz só o nome do índice, sem preço |

## 5. Comportamento esperado

### 5.1 Tarefa do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `indices_b3` (nova) | 08:00, 20:00 e ao iniciar | Completa os anos que faltam de IBOV e IFIX desde 2016 (um pedido a cada 2 s); busca o ano atual; grava (substitui o valor do dia se a B3 corrigiu); confere os pregões publicados sem fechamento. Situação da execução como na SPEC-007 (`sucesso`, `parcial`, `falha`) |

### 5.2 Rotas

| Rota | Quem | Muda | Detalhes |
|---|---|---|---|
| `GET /api/portfolios/:id/performance` (SPEC-019) | Usuário dono | Ganha campos | `benchmarks`: lista com `code` (`cdi`, `ibov`, `ifix`), `return` (% com 2 casas, ou `null` sem dados), `until` (último dia com dado, ou `null`), `endValue` ("o mesmo dinheiro" em `until`, decisão 3) e `source` (`bcb` ou `b3`); `cdiShare` ("61", ou `null`, §4.1 decisão 4); `baseDate` (§4.2). Cada ponto de `series` ganha `benchmarks` (`{ cdi, ibov, ifix }`, % acumulada ou `null` depois do último dia com dado) e `benchmarkValues` (o mesmo, em reais). Sem novos erros |
| `GET /api/collaborator/indices` (nova) | Colaborador | — | Para cada índice: primeira e última data guardadas, quantos dias, última execução (`at`, `status`) e quantos pregões sem fechamento. 403 para usuário |

### 5.3 Telas

| Onde | O que aparece |
|---|---|
| Painel **Rentabilidade**, abaixo dos três números | "No mesmo período: **CDI** +14,29% teria R$ 26.654,53 · **Ibovespa** +9,92% · **IFIX** +1,04%", com as fontes, e "Sua carteira rendeu **61% do CDI**". Cada número com a cor de alta ou queda da SPEC-019 e o sinal escrito (+/−), não só a cor |
| Referência incompleta | "Ibovespa até 06/11/2026" ao lado do número; "Ibovespa ainda não carregado: o processador busca na B3" sem dados |
| Gráfico | Seletor **"Em reais" / "Em %"** (dois botões com `aria-pressed`, como os períodos) e, ao lado, o botão **"Comparar com os índices"** (`aria-pressed`). Com ele ligado, em %: a carteira em linha cheia e as referências tracejadas ou pontilhadas, com legenda; o cursor do teclado e do mouse lê "6 de nov. de 2026: carteira +8,68%, CDI +14,29%, Ibovespa +9,92%, IFIX +1,04%". Em reais: as linhas "No CDI", "No Ibovespa" e "No IFIX", com uma nota que explica "o mesmo dinheiro", e o cursor lê também o valor de cada uma |
| Início do colaborador | "Ibovespa e IFIX: de 04/01/2016 a 06/11/2026 · atualizados hoje às 20:00"; aviso em âmbar se o último fechamento tiver mais de 2 pregões ou se a última execução falhou, como o CDI (SPEC-007 §5.3) |

Tudo em português e inglês, pelo teclado, a 480 px e com contraste (RNF04, RNF18, RNF20). Na carteira histórica continua o rótulo "Simulação histórica" (DA17).

## 6. Modelo de dados

| Tabela | Colunas | Regras |
|---|---|---|
| `indice_bolsa` (nova) | `id`, `sigla`, `nome` | `sigla` única. A migração cadastra **IBOV** (Ibovespa) e **IFIX** (Índice de Fundos de Investimentos Imobiliários) |
| `fechamento_indice` (nova) | `indice_id`, `data`, `valor`, `fonte`, `gravado_em` | Chave (`indice_id`, `data`); `valor` decimal(12,2) maior que zero; nunca em fim de semana (CHECK); `fonte` em lista fechada (`b3_estatisticas`) |
| `carga_indice` (nova) | `indice_id`, `ano`, `carregada_em`, `registros` | Chave (`indice_id`, `ano`): o ano fechado já carregado, que não é pedido de novo (como `carga_indexador`, SPEC-007) |
| `tarefa_ingestao` (enum) | + `indices_b3` | — |

Os índices ficam fora de `indexador` e `taxa_diaria` (SPEC-007), que guardam taxas entre 0 e 1 e exigem a série do Banco Central. No modelo de domínio, entram **INDICE_BOLSA** e **FECHAMENTO_INDICE** (a "representação não definida" do mapa, OPEN-21). A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A tarefa carrega IBOV e IFIX desde 04/01/2016, um pedido a cada 2 s, sem pedir de novo os anos fechados; valores do §4.4 conferidos no banco |
| CA02 | Leitura pelo texto ("168.498,45"); data inválida, fim de semana, futura e valor ≤ 0 recusados e registrados; pregão sem fechamento depois de 1 pregão vira erro da execução; falha da B3 não apaga o que já está gravado (RNF13) |
| CA03 | Núcleo puro com testes de unidade (RNF16): os exemplos do §4.3 com os dados reais; CDI com os dias sem pregão; dia-base com e sem patrimônio anterior; referência que para antes do fim |
| CA04 | `/performance` com `benchmarks` (com `endValue`), `cdiShare`, `baseDate` e as referências por ponto, em % e em reais ("o mesmo dinheiro", com os aportes e retiradas nos mesmos dias), nos períodos da SPEC-019 e no personalizado; pontos semanais acima de 2 anos com as mesmas datas |
| CA05 | IFIX só com FII no período; "% do CDI" só com a carteira positiva (e o CDI acima de 0%) |
| CA06 | Hoje: referências até o último dia publicado, com o "até" na tela; índice não carregado não quebra o painel |
| CA07 | Painel em menos de 2 s com 50 ativos desde 2016 (RNF06), como medido na SPEC-019 |
| CA08 | Telas: números das referências com as fontes e o "teria", "% do CDI", gráfico "Em reais"/"Em %" com o botão "Comparar com os índices" nos dois, legenda e cursor lido pelo leitor de tela, avisos; português e inglês; teclado; 480 px; contraste (RNF04, RNF18, RNF20) |
| CA09 | Início do colaborador com o período dos índices, a última atualização e os avisos; rota 403 para usuário |
| CA10 | Tabelas com as restrições do §6, IBOV e IFIX cadastrados, migração desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-21 | ✅ Resolvida (decisão 1): Ibovespa e IFIX pelas estatísticas históricas da B3 |
| PE06 | ✅ Resolvida junto com a OPEN-21 (arquitetura §11) |
| — | ⏳ **Horário em que a B3 publica o fechamento do dia** na página de estatísticas: conferir na implementação e ajustar os horários da tarefa (08:00 e 20:00 são a proposta) |
| — | Termos de uso do site da B3: mesmas regras da SPEC-042 §4.3 (uso acadêmico, só dentro do app, "Fonte: B3") |

## 9. Verificação (08/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | Núcleo `financial-calculation/benchmarks.ts` (`cdiBenchmark`, `indexBenchmark`, `cdiShare`), puro. O `performance.ts` da SPEC-019 passou a devolver o dia-base e os ativos em posição no período (para o IFIX). O serviço é o `TradingService.performance`; a porta `PortfolioMarket` ganhou `cdiRates` e `indexCloses`, ligadas no `api/src/portfolio-market.ts` |
| Carga | `MarketIndexIngestion` (Dados de Mercado), com o adaptador `B3IndexHttpSource` e o `PrismaMarketIndexRepository`. O registro da execução ficou comum ao CDI (`SeriesRunLog`, tirado da `cdi-ingestion.ts`, sem mudar o comportamento) |
| Ano fechado | Só fica marcado a partir de 08/01 do ano seguinte (antes, é pedido de novo); um ano sem nenhum fechamento na resposta não fica marcado |
| Pregões sem fechamento | Contam os pregões que já têm 2 pregões depois; sem nenhum dado, a conta é 0 (a tela diz "carregando") |
| "Até" na tela | Comparado com o último ponto do gráfico, não com o fim do período (que pode ser um sábado) |
| Fontes na tela | A nota cita o IFIX só quando ele aparece |
| Gráficos | Um hook comum (`useChartCursor`) para a largura e o cursor dos dois gráficos; o "Em reais" da SPEC-019 passou a usá-lo, sem mudar o comportamento |
| "O mesmo dinheiro" (ajuste de 08/11) | Núcleo `sameMoney`: a partir do fator exato de cada ponto (`factors`, que as referências passaram a devolver) e dos aportes e retiradas de cada ponto (a diferença do total aportado entre pontos). Proventos não entram: no índice, eles já estão no preço; no CDI, não existem. A linha para no último dia com dado |

| Critério | Resultado |
|---|---|
| CA01 | ✅ Carga real da B3 no banco de teste: 22 pedidos em 46 s, 2.695 fechamentos de cada índice de 04/01/2016 a 06/11/2026, anos 2016 a 2025 marcados, valores do §4.4 conferidos no banco. Na segunda execução: 2 pedidos (o ano atual) e nada mudou. Testes em `market-index-ingestion.test.ts` |
| CA02 | ✅ `b3-index.test.ts` e `market-index-ingestion.test.ts`: leitura pelo texto, fim de semana, formato, dia que não existe, zero, novas tentativas, falha que não apaga o guardado, pregão sem fechamento e valor em dia sem pregão |
| CA03 | ✅ `benchmarks.test.ts` com os dados reais do §4.3: 2025 (CDI +14,30%, Ibovespa +33,95%, IFIX +21,15%), 12 meses (+14,29%, +9,92%, +1,04%), no ano (+11,98%, +4,58%, −3,90%) e "61% do CDI"; CDI com 24/12 e 31/12, dia-base com e sem patrimônio, referência parada, 10 anos sem erro na % |
| CA04 | ✅ `benchmark-routes.test.ts` e `performance-routes.test.ts`: `benchmarks`, `cdiShare`, `baseDate` e as referências por ponto, nos períodos e no personalizado; as referências são calculadas dia a dia antes de escolher um ponto por semana |
| CA05 | ✅ IFIX só com FII no período (e não num período antes da compra); "% do CDI" só com a carteira positiva |
| CA06 | ✅ Ibovespa até o último fechamento ("até 6 de nov. de 2026"); CDI e índices não carregados: referências sem dado, painel inteiro |
| CA07 | ✅ Medido no banco de teste com os índices reais: leitura de 10 anos dos dois índices em 15 a 20 ms (118 ms com o banco frio) e a conta em 5 a 12 ms. O painel continua na faixa medida na SPEC-019 (0,88 a 0,98 s com 50 ativos) |
| CA08 | ✅ Pré-visualização das telas com as respostas no formato da API e os índices e o CDI reais de 12 meses: "No mesmo período" com as fontes, "Sua carteira rendeu 68% do CDI", gráfico "Em %" (o cursor lê "6 de out. de 2026: Carteira +22,22%, CDI +13,08%, Ibovespa +34,27%, IFIX +8,86%"), "até", "ainda não carregado", inglês, 480 px sem rolagem lateral. ⏳ Abrir no Electron com os índices carregados no banco de desenvolvimento |
| CA09 | ✅ `market-index-routes.test.ts` (período, execução, parado há mais de 2 pregões, pregão sem fechamento, 403 e 401) e o Início do colaborador conferido na pré-visualização, com os avisos em âmbar |
| CA10 | ✅ `prisma-market-index.db.test.ts` (IBOV e IFIX cadastrados, gravação idempotente, correção, fim de semana, zero e negativo recusados). Migração `20261108120000_indices_bolsa` sem diferença para o esquema do Prisma, desfeita e refeita no banco de teste e aplicada no de desenvolvimento |

**Ajuste de 08/11 (botão "Comparar" e "o mesmo dinheiro"):** testes de unidade de `sameMoney` (sem aportes, aporte e retirada no dia, carteira nova, linha que para, R$ 23.321,46 por 12 meses no CDI = R$ 26.654,53 com os dados reais) e de rota (`benchmarkValues` e `endValue`, com o dia-base com e sem patrimônio). Na pré-visualização: o botão começa desligado, liga as linhas nos dois gráficos (três linhas em %, "No CDI", "No Ibovespa" e "No IFIX" em reais, com a nota), fica ligado ao trocar de reais para % e aparece ligado com o contorno na cor de destaque; o "teria R$ …" ao lado de cada referência.

Total: **952 testes** passando, com o banco de teste, mais lint, tipos e formatação.

**Dado da B3 a notar:** o Ibovespa cai de 205.082 para 176.608 pontos em 26/10/2026, no mesmo dia da queda da MGLU3 sem evento que a SPEC-019 encontrou. É o que a B3 publica; o gráfico "Em %" mostra a queda.
