# SPEC-019 — Rentabilidade e evolução patrimonial

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 06/11/2026 pela Nicoly; aprovada por ela no mesmo dia com as recomendações do §4.1 ("Aprovar e fazer") e implementada (§9) |
| Fase | 5 — Acompanhamento da carteira ([mapa de specs](mapa_specs.md)), a primeira depois da Fase 3 |
| Prioridade | Must (RF15, RF17) |
| Depende de | [SPEC-013](SPEC-013.md) (caixa), [SPEC-014](SPEC-014.md) (posições), [SPEC-015](SPEC-015.md) (estorno, `activeLedger`), [SPEC-016](SPEC-016.md) (carteira histórica), [SPEC-043](SPEC-043.md) (proventos e eventos), [SPEC-008](SPEC-008.md) (fechamentos da B3), [SPEC-010](SPEC-010.md) (saltos de preço) |
| Muda | Tela da carteira (ganha o painel **Rentabilidade**, acima do Caixa) |
| Requisitos | RF14, RF15, RF17; RB09, RB13, RB20; RNF03, RNF06, RNF12, RNF16 |
| Casos de uso | Acompanhar rentabilidade (inclui Consultar cotação); Consultar posição e saldo; P01 passo 6 |
| Drivers | OBJ01, QA01, QA04, PA05 |
| ADRs | [DA08](../adr/DA08-cache-dois-niveis-offline-leitura.md), [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) |

---

## 1. Objetivo

Responder "teria ganho ou perdido?" (Visão §12) nas carteiras **ao vivo e histórica**. Para isso, o usuário escolhe um período e vê:

- a **rentabilidade** em %: a da cota (§4.1, decisão 1), que aportes e retiradas não distorcem;
- o **resultado** em reais, isto é, quanto o patrimônio mudou sem contar o dinheiro que entrou ou saiu;
- o **gráfico da evolução**: o patrimônio dia a dia (caixa + ativos) e, ao lado, o total aportado.

Tudo é refeito a partir do livro (RB09, DA09), com os proventos e eventos da SPEC-043. Nada é gravado.

## 2. Valor

- **Usuário (P01):** "se eu tivesse colocado R$ 10.000 em PETR4 e MXRF11 em 2019, quanto teria hoje e quanto rendeu?"
- **Projeto:** base da comparação com CDI e Ibovespa (SPEC-020, que usa a mesma cota), da distribuição (SPEC-021) e da comparação de carteiras (SPEC-022).

## 3. Escopo

### 3.1 Inclui

1. **Rentabilidade da cota** e **resultado em R$** num período (§4.1, decisões 1 e 2).
2. **Períodos:** 1 mês, 6 meses, 12 meses, no ano, desde o início e **personalizado** (de/até).
3. **Gráfico da evolução patrimonial**: patrimônio e total aportado por dia de pregão, com a rentabilidade acumulada ao passar o mouse ou o foco.
4. **Aviso de salto sem evento conhecido** (§4.1, decisão 5), para o problema encontrado na SPEC-043.
5. Nas **duas carteiras**: a histórica, avaliada até hoje (DA17).

### 3.2 Não inclui

- **CDI e Ibovespa no gráfico:** SPEC-020 (já há o CDI, da SPEC-007; falta a fonte do Ibovespa, OPEN-21).
- **Rentabilidade por ativo** e distribuição por classe e setor: SPEC-021.
- **Comparar carteiras:** SPEC-022.
- **Custos e impostos sobre ganho de capital** (RB20): fora, como em toda a carteira.
- **TIR** (taxa interna de retorno, a que pesa o dinheiro): fica de fora; a cota é a medida do projeto (decisão 1).

## 4. Decisões

### 4.1 Aceitas pela Nicoly em 06/11/2026 (as recomendações)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Como medir a rentabilidade** | **Pela cota**, como nos fundos e nas corretoras (rentabilidade ponderada pelo tempo): a cada pregão, rendimento do dia = patrimônio no fechamento ÷ (patrimônio do pregão anterior + aportes − retiradas do dia) − 1, e os dias se multiplicam. O aporte do dia conta como feito **antes** do fechamento. Proventos não são aporte: entram como ganho | Com a conta simples (lucro ÷ aportes), um aporte grande no fim muda a %. A cota mede só o que os investimentos renderam e é a mesma base do CDI e do Ibovespa (SPEC-020) |
| 2 | **Resultado em R$** | Patrimônio no fim − patrimônio no início − (aportes − retiradas) no período | "Quanto ganhei", em dinheiro, sem contar o que eu mesmo coloquei |
| 3 | **Preço de cada dia** | O **fechamento da B3** como publicado (SPEC-008), com a quantidade já corrigida pelos eventos (SPEC-043). Ativo sem negócio no dia: o último fechamento antes. Na carteira **ao vivo**, o dia de hoje usa a cotação do pregão, como as posições (o total do painel bate com o total das posições) | É o preço que valia naquele dia. Preço ajustado com quantidade corrigida contaria o evento duas vezes |
| 4 | **Pontos do gráfico** | Um ponto por **pregão**, do início do período até hoje. Acima de 2 anos, um ponto por **semana** (o último pregão de cada), para a tela não ficar pesada; a rentabilidade e o resultado continuam calculados dia a dia | Mais de 500 pontos não aparecem na tela de qualquer jeito |
| 5 | **Salto sem evento conhecido** | Se um ativo em posição teve, no período, um salto de preço que a SPEC-010 marca (`isPriceJump`: alta ou queda de mais de 1,8 vez num pregão) e que não tem evento da B3 no mesmo dia, o painel avisa: "MGLU3 teve um salto de preço em 06/08/2019 sem desdobramento ou grupamento conhecido: o resultado pode estar errado." A conta não muda | A SPEC-043 mostrou que a B3 não traz todos os eventos (MGLU3 em 2017 e 2019). Avisar é melhor que mostrar −98% como se fosse certo |
| 6 | **Cache (RNF03)** | Sem Redis: o servidor calcula a cada pedido, lendo os fechamentos do PostgreSQL. Medido: 114 mil fechamentos (50 ativos desde 2016) em 130 ms | Cabe nos 2 s da RNF06 sem mais uma peça para instalar. A RNF03 fica como na SPEC-009 (PostgreSQL), até a medida mostrar que precisa |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Início do período** | O primeiro dia é o pregão de início pedido ou, se a carteira começou depois, o primeiro dia com lançamento. "Desde o início" começa no primeiro aporte | Antes do primeiro aporte não há patrimônio para render |
| **Patrimônio zero** | Dia com patrimônio zero e sem aporte rende 0%; a cota recomeça no próximo aporte | Divisão por zero |
| **Carteira sem lançamentos** | Painel com "Faça um aporte para ver a rentabilidade" | Nada a medir |
| **Hoje na histórica** | A histórica também vai até hoje (DA17), com a cotação do pregão de hoje quando houver | O "quanto valeria hoje" |
| **Proventos a receber** | Não entram no patrimônio até a data de pagamento (SPEC-043) | O patrimônio é o que já está na carteira |
| **Arredondamento** | Patrimônio em centavos (RB13); a cota com 10 casas na conta; a % com 2 casas, meio para cima | Sem acumular erro em 10 anos de dias |
| **Ativo sem fechamento nenhum** | Antes do primeiro fechamento do ativo, vale o preço da compra; o painel avisa "PETR4 sem fechamento até 15/03/2019" | Raro (o histórico é desde 2016) |
| **Rota** | `GET /api/portfolios/:id/performance?period=1m\|6m\|12m\|ytd\|all` ou `?from=AAAA-MM-DD&to=AAAA-MM-DD` | Uma rota para o painel e o gráfico |
| **Telas** | Painel **Rentabilidade** no topo da carteira: botões dos períodos e "Personalizado" (duas datas); três números: **Rentabilidade** (+12,34%), **Resultado** (+R$ 1.234,56) e **Patrimônio** (R$ 11.234,56); o gráfico de linhas (patrimônio e total aportado), com a linha do patrimônio também em tabela para leitores de tela; os avisos do §4.1 (decisão 5) | Como o gráfico da ficha (SPEC-010) |
| **Onde fica** | Núcleo novo `financial-calculation/performance.ts` (puro, DA10), que percorre os dias uma vez, usando a linha do tempo da SPEC-043. A porta `PortfolioMarket` ganha `closesBetween(assetIds, from, to)` e `jumps(assetIds, from, to)`, ligadas no `api/src/portfolio-market.ts` | Arquitetura §6 |
| **Exportação (SPEC-034)** | Sem mudança: a rentabilidade é calculada, não é dado guardado | Nada novo a exportar |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Aporte de R$ 10.000,00 em 02/01; compra de 100 PETR4 a R$ 25,30; no fechamento do dia seguinte, R$ 26,00 | Patrimônio R$ 10.070,00; rentabilidade +0,70%; resultado +R$ 70,00 |
| No terceiro dia, aporte de R$ 5.000,00 e PETR4 parada em R$ 26,00 | Patrimônio R$ 15.070,00; a rentabilidade continua +0,70%; o resultado continua +R$ 70,00 (o aporte não é ganho) |
| Carteira dobra de R$ 10.000 para R$ 20.000 em janeiro; o usuário aporta R$ 100.000 em 31/01; em fevereiro cai 10% | Cota: (1 + 100%) × (1 − 10%) − 1 = **+80%**. Pela conta simples, daria (108.000 − 110.000) ÷ 110.000 = −1,8%, como se tivesse perdido |
| Retirada de R$ 2.000,00 num dia em que nada mudou de preço | Rentabilidade do dia 0%; resultado não muda |
| Dividendo de R$ 50,00 pago no caixa | Entra como ganho: o patrimônio sobe R$ 50,00 e a rentabilidade também |
| MGLU3 comprada em 10/06/2019 | O aviso de salto em 06/08/2019 aparece no painel (§4.1, decisão 5) |
| Histórica de 2019, período "desde o início" | Do primeiro aporte até hoje, com a cotação de hoje no último ponto |

## 5. Comportamento esperado

### 5.1 Rota

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/portfolios/:id/performance` (nova) | Usuário dono | `period` ou `from` e `to` | `from`, `to`, `startValue`, `endValue`, `netFlows` (aportes − retiradas), `result`, `return` (% com 2 casas), `series` (`date`, `equity`, `invested`, `return` acumulado), `weekly` (se os pontos são por semana), `warnings` (saltos sem evento, ativo sem fechamento) | 400 `validation_error` (`period` desconhecido; `from` depois de `to`; data inválida; `to` no futuro); 404 da carteira (SPEC-012) |

### 5.2 Telas

As do §4.2, em português e inglês, pelo teclado (os períodos são botões; o gráfico tem o resumo em texto), a 480 px e com o rótulo "Simulação histórica: resultado calculado com dados já conhecidos" na histórica (DA17).

## 6. Modelo de dados

**Nenhuma tabela nova.** Lê o livro (SPECs 013 a 016), os proventos e eventos (SPEC-042) e os fechamentos (SPEC-008), com a chave primária `cotacao_diaria (ativo_id, data)`, que já serve à leitura por período.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Rentabilidade da cota com os exemplos do §4.3; aporte e retirada não mudam a % nem o resultado; provento conta como ganho |
| CA02 | Resultado em R$ = patrimônio final − inicial − aportes líquidos do período |
| CA03 | Preço de cada dia: fechamento da B3 com a quantidade corrigida; sem negócio, o último fechamento; hoje na ao vivo, a cotação do pregão; o patrimônio de hoje bate com o total das posições |
| CA04 | Períodos 1m, 6m, 12m, ytd, all e personalizado; validação das datas; início no primeiro lançamento quando o período começa antes |
| CA05 | Gráfico com um ponto por pregão até 2 anos e por semana acima; patrimônio e total aportado |
| CA06 | Aviso de salto sem evento conhecido para ativo em posição no período (MGLU3 de 2019 com os dados reais) |
| CA07 | Carteira histórica avaliada até hoje; carteira sem lançamentos com a mensagem do §4.2 |
| CA08 | Núcleo puro com testes de unidade (RNF16, RNF12): cota, dia com patrimônio zero, arredondamento em 10 anos |
| CA09 | Painel em menos de 2 s com 50 ativos desde 2016 (RNF06), medido com os dados reais |
| CA10 | Telas: períodos, números, gráfico com resumo em texto, avisos; português e inglês; teclado; 480 px; contraste (RNF04, RNF18, RNF20) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-06 | ✅ Já resolvida na SPEC-043; aqui só o aviso de salto sem evento (decisão 5) |
| OPEN-21 | ⏳ Fonte do Ibovespa, para a SPEC-020 |
| — | ⏳ Se o tempo passar de 2 s em algum caso, guardar a cota diária por carteira (cache recalculável) numa Spec futura |

## 9. Verificação (06/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | Núcleo `financial-calculation/performance.ts` (puro). O serviço é o `TradingService.performance`, que já tinha o livro, o calendário e o mercado. A porta `PortfolioMarket` ganhou só `closesFrom` (os fechamentos da SPEC-010). Os saltos são conferidos no núcleo, com o `isPriceJump` da SPEC-010 e o `eventBetween` da SPEC-042, sem uma porta `jumps` |
| Posições de cada dia | Mudam só nos dias de negociação e no dia seguinte à data com de um evento: em cada um, a linha do tempo da SPEC-043 até ele |
| Cota | 12 casas na conta (o §4.2 dizia 10); 2.500 pregões de +0,01% ficam a menos de 0,01 ponto do valor exato |
| Período | 1m, 6m e 12m como a ficha (o mesmo dia, N meses antes); "No ano" a partir de 1º de janeiro; sem `period`, desde o início. `from` depois de `to` é `after_end`; `to` depois de hoje é `after_today` (revisão de 08/11: antes reaproveitava o `future` da SPEC-016, cuja mensagem pede um dia antes de hoje) |
| Último preço (revisão de 08/11) | No período que vai até hoje, o último dia da conta usa o mesmo último preço das posições (a cotação do pregão; sem ela, o último fechamento). Antes, só a cotação do próprio dia valia: no fim de semana ou antes da abertura, o patrimônio podia ficar diferente do total das posições |
| Lançamento depois do último pregão | Um aporte de sábado na ao vivo entra no pregão seguinte; se ainda não houve pregão depois dele, o dia do aporte fecha a conta |
| "Calculando…" | Aparece ao trocar o período; ao recarregar por um lançamento novo, os números de antes ficam até chegarem os novos |
| Telas | Painel **Rentabilidade** acima do Caixa, com os botões de período (os da ficha), o formulário "Personalizado", os três números, o patrimônio no início e os aportes do período, o gráfico (patrimônio em linha cheia e total aportado tracejado, cursor pelo mouse e pelo teclado com o texto para leitor de tela) e os avisos |

| Critério | Resultado |
|---|---|
| CA01 | ✅ Exemplos do §4.3 em `performance.test.ts`: +0,70% com PETR4, aporte de R$ 5.000,00 e retirada de R$ 2.000,00 sem mudar a %, a cota de +80% contra −1,8% da conta simples, dividendo como ganho |
| CA02 | ✅ Resultado = fim − início − aportes líquidos (ex.: R$ 13.070,00 − 0 − R$ 13.000,00 = R$ 70,00) |
| CA03 | ✅ Fechamento do dia ou o último antes; desdobramento sem salto falso; hoje com a cotação do pregão. Com dados reais: a conta de teste (histórica de 2019 com PETR4, MXRF11, ITSA4 e MGLU3) fecha em R$ 25.345,87, igual ao total das posições. Revisão de 08/11: também no sábado, com a cotação de sexta (`performance-routes.test.ts`) |
| CA04 | ✅ Períodos e validação (`performance-routes.test.ts` e o pacote compartilhado); com dados reais, 12 meses: +8,68% (R$ 23.321,46 → R$ 25.345,87) |
| CA05 | ✅ Desde 2019: 410 pontos semanais; 12 meses: 248 pregões |
| CA06 | ✅ MGLU3 de 2019 no teste de rota; com dados reais, o aviso apareceu para a queda da MGLU3 em 26/10/2026 (de R$ 12,69 para R$ 5,30, sem evento na B3) e para 9 saltos nos 50 ativos mais negociados desde 2016 |
| CA07 | ✅ Histórica até hoje; carteira sem lançamentos com a mensagem; carteira de outra pessoa: 404 |
| CA08 | ✅ 11 testes de unidade no núcleo (cota, patrimônio zero, aporte de fim de semana, sem fechamento, salto, 10 anos) |
| CA09 | ✅ 50 ativos desde 04/01/2016 (566 pontos): 0,88 a 0,98 s, abaixo dos 2 s da RNF06. Pela API local, a conta de teste: 357 ms (desde o início) e 37 a 69 ms (períodos curtos) |
| CA10 | ✅ Conferido na pré-visualização das telas do app, com as respostas da API real da conta de teste: períodos, Personalizado, números, gráfico (o cursor lê "6 de nov. de 2026: patrimônio R$ 25.345,87, aportado R$ 20.000,00, rentabilidade +26,73%"), aviso, português e inglês, 480 px sem rolagem lateral. ⏳ Abrir no Electron, com a ponte real |

Total: **902 testes** passando e **118 com o banco** de teste, mais lint, tipos e formatação.

**Para as próximas Specs:** a SPEC-020 põe o CDI (e o Ibovespa, com a fonte da OPEN-21) no mesmo gráfico, com a mesma cota; a SPEC-021 usa as posições de cada dia do núcleo para a distribuição.
