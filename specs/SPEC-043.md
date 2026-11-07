# SPEC-043 — Proventos e eventos corporativos na carteira

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 06/11/2026 pela Nicoly; aprovada por ela no mesmo dia com as recomendações do §4.1 ("Aprovar e fazer") e implementada (§9) |
| Fase | 3 — Núcleo da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-016 |
| Prioridade | Should (mapa); fecha a Fase 3 |
| Depende de | [SPEC-013](SPEC-013.md) (caixa), [SPEC-014](SPEC-014.md) (compra e venda, posições), [SPEC-015](SPEC-015.md) (estorno, `activeLedger`), [SPEC-016](SPEC-016.md) (carteira histórica), [SPEC-042](SPEC-042.md) (proventos do Investidor10 e eventos da B3) |
| Muda | SPEC-013 (saldo e extrato contam os proventos), SPEC-014 (posições com a quantidade e o preço médio corrigidos; sai o aviso "Proventos e desdobramentos ainda não entram nesta carteira"), SPEC-015 (a conferência do livro conta os proventos), SPEC-016 (sai o aviso de evento depois da compra; o caixa "naquela data" conta os proventos pagos até ela) |
| Requisitos | RF13, RF14; RB05, RB06, RB08, RB09, RB10, RB13, RB25, RB28; RNF12, RNF16 |
| Casos de uso | Consultar carteira, extrato e posições (efeito dos proventos); cenário da P01 com dividendos |
| Drivers | OBJ01, FAS01, QA01 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) |

---

## 1. Objetivo

Nas carteiras **ao vivo e histórica**, o resultado passa a contar o que os ativos pagaram e os eventos que mudaram a quantidade:

- **proventos** (dividendos, JCP, rendimentos e amortizações de FII) entram no **caixa** de quem tinha o ativo no fim da **data com**, na **data de pagamento**;
- **desdobramentos, grupamentos e bonificações** corrigem a **quantidade** e o **preço médio** da posição no dia seguinte à data com;
- os dois vêm dos dados que a SPEC-042 já guarda; nada novo é coletado.

Com isso some o aviso da SPEC-016 ("o valor atual ainda não considera isso") e a posição volta a mostrar o valor atual e a variação.

## 2. Valor

- **Usuário (P01):** "e se eu tivesse comprado MXRF11 em 2019?" passa a contar os rendimentos de todos os meses, que são quase todo o resultado de um FII; quem comprou MGLU3 antes de 2020 não vê a carteira "cair 75%" no desdobramento.
- **Projeto:** caixa (RB05) e posição (RB06) certos; base para a rentabilidade (SPEC-019).

## 3. Escopo

### 3.1 Inclui

1. **Crédito dos proventos** no caixa, nas duas carteiras, com o JCP já sem o IR (§4.1, decisão 3).
2. **Proventos a receber:** data com já passou e o pagamento ainda não chegou.
3. **Correção da posição** nos eventos, com as frações vendidas em dinheiro (§4.1, decisão 5).
4. **Extrato** com os proventos e os eventos, e **posições** com o total recebido por ativo.
5. **Conferências** de compra, retirada e estorno contando os proventos (o caixa que eles deram pode ser gasto).

### 3.2 Não inclui

- **Rentabilidade por período** e gráfico da evolução: SPEC-019 (calcula sobre o mesmo livro).
- **Imposto sobre ganho de capital**, sobre dividendos acima de R$ 50 mil por mês e custos da corretora: fora (RB21 continua só como aviso).
- **Reinvestir os proventos sozinho:** o usuário compra com o caixa, como qualquer compra.
- **Subscrição, cisão, incorporação e troca de ticker:** a SPEC-042 não traz esses eventos; ficam como aviso (§4.2).
- **Exportar os proventos** (SPEC-034): pela autorização do Investidor10, nada dele sai do app (§4.1, decisão 7).

## 4. Decisões

### 4.1 Aceitas pela Nicoly em 06/11/2026 (as recomendações, OPEN-06)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Gravar ou calcular** | Os proventos e eventos **não viram lançamentos gravados**: o núcleo de cálculo (DA10) os junta ao livro (`activeLedger`) cada vez que a carteira é lida, a partir das tabelas da SPEC-042. O livro do usuário continua só com o que ele lançou (DA09) | Um provento que chega depois (o processador visita o Investidor10 toda semana) ou uma correção da fonte entram sozinhos, sem um robô varrendo as carteiras. Estornar uma compra já tira os proventos dela, sem regra nova |
| 2 | **Quem recebe e quando** | Recebe quem tinha o ativo **no fim da data com** (negociações com data até a data com, inclusive). O dinheiro entra na **data de pagamento**; antes dela, o provento aparece como **"a receber"** e não pode ser gasto. Sem data de pagamento ("provisionado"), fica "a receber, sem data" | É a regra da B3: quem compra na data com recebe; quem compra no dia seguinte ("data ex"), não. Gastar antes do pagamento seria dinheiro que a corretora ainda não deu |
| 3 | **JCP** | Entra **líquido**: o valor bruto menos o IR retido na fonte, **15% até 31/12/2025 e 17,5% a partir de 01/01/2026** (pela data de pagamento). O extrato mostra bruto, IR e líquido. Dividendos e rendimentos de FII entram inteiros (isentos para pessoa física) | É o que cai na conta de verdade. A alíquota de 2026 precisa ser conferida na lei antes da implementação (§8) |
| 4 | **Amortização de FII** | Entra no caixa como os rendimentos e **reduz o preço médio** da posição pelo valor por cota (sem ficar negativo) | É devolução de parte do capital: o custo da cota cai. Sem isso, a variação da posição sairia menor do que é |
| 5 | **Desdobramento, grupamento e bonificação** | No dia seguinte à data com, a quantidade é multiplicada pelo multiplicador da SPEC-042 (`shareMultiplier`) e o **custo total não muda** (preço médio dividido pelo multiplicador, 6 casas). Se sobra **fração** de ação, ela é vendida: entra no caixa a fração × o fechamento da data com dividido pelo multiplicador, arredondado para baixo em centavos; sem fechamento nesse dia, a fração é descartada | A B3 leiloa as frações e paga em dinheiro; o fechamento ajustado é a melhor estimativa que temos. A bonificação usaria o "custo atribuído" que a empresa anuncia, que não temos; tratar como desdobramento mantém o custo total |
| 6 | **Arredondamento** | Cada provento: quantidade × valor por ação, **arredondado para baixo** em centavos; o IR do JCP arredondado para cima. Tudo em decimal como texto (RNF12) | A corretora paga os centavos inteiros e não arredonda a favor do cliente |
| 7 | **Fonte e autorização** | Os proventos aparecem com **"Fonte: Investidor10"** no extrato e nas posições. Com o interruptor `INVESTIDOR10_ENABLED` desligado (ou depois da autorização), **nenhum provento entra**: as carteiras mostram "Proventos desligados: o caixa não conta os dividendos" e ficam só com os eventos da B3. A exportação não leva proventos | Mesmas condições da SPEC-042: nada do Investidor10 sai do app nem aparece sem a fonte |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Ordem no livro** | No mesmo dia, os eventos vêm **antes** das negociações e os proventos **antes** de aportes e negociações (eles contam do início do dia) | Uma compra no dia do pagamento já pode usar o provento; uma compra no dia ex já é em ações novas |
| **Conferência do livro** (`firstBreak`, SPEC-015) | Conta os proventos pagos e as frações. Uma retirada ou compra que só cabe com um provento é aceita; um estorno de compra que faria um gasto posterior ficar sem caixa (porque o provento dela some) é recusado com `ledger_break`, como já é | Regra única: o livro sem o lançamento continua válido |
| **Proventos que somem** | Se a fonte é desligada ou corrige um provento já gasto, o caixa pode ficar **negativo**. A carteira não apaga nada: mostra "O caixa ficou negativo porque um provento deixou de constar da fonte" e só aceita aporte até voltar ao positivo | Não dá para desfazer lançamentos (DA09); avisar é melhor que esconder |
| **Data do pagamento depois de hoje** | Na histórica e na ao vivo, igual: só entra quando a data chega (hoje, 409 proventos no banco estão nesse caso) | A histórica é avaliada até hoje (DA17) |
| **Caixa "naquela data"** (SPEC-016) | O `cash` da cotação da histórica conta os proventos pagos até a data escolhida | O que o investidor tinha naquele dia |
| **Ativo sem proventos carregados** | Se o processador ainda não visitou o ativo no Investidor10 (SPEC-041), a posição mostra "Proventos deste ativo ainda não carregados" | Não confundir com "não pagou nada" |
| **Evento que a SPEC-042 não traz** | Ativo que saiu da bolsa ou trocou de ticker continua com o último fechamento (SPEC-016, decisão 4); sem aviso novo | Fora desta Spec |
| **Telas** | **Extrato:** linhas "Dividendo PETR4 — 100 × R$ 0,4715 (data com 21/08/2026)", "JCP PETR4 — bruto R$ 67,40, IR R$ 11,80, líquido R$ 55,60", "Desdobramento MGLU3 — 100 → 400 (preço médio R$ 40,00 → R$ 10,00)", "Venda de fração MGLU3 — 0,5 ação, R$ 6,60". **Posições:** coluna "Proventos recebidos" e, embaixo, "A receber: R$ 9,50 em 16/11/2026". **Resumo:** "Proventos recebidos" e "A receber" ao lado do caixa | Mostra de onde veio cada centavo |
| **Rotas** | Sem rota nova: `GET /cash` (SPEC-013) e `GET /positions` (SPEC-014) passam a trazer os itens novos (§5.1) | Mesma tela, mesma conta |
| **Onde fica** | Núcleo: `financial-calculation/corporate-actions.ts` (pura, DA10) junta livro, proventos e eventos numa linha do tempo só. A porta `PortfolioMarket` ganha `incomeFrom(assetId, date)` (proventos com data com a partir da data, já respeitando o interruptor), ligada no `api/src/portfolio-market.ts` | Arquitetura §6, sem um módulo conhecer o outro |

### 4.3 Exemplos (com dados reais do banco)

Hoje = 06/11/2026.

| Situação | Resultado |
|---|---|
| 100 MXRF11 compradas em 01/09/2026; rendimento de R$ 0,10 com data com 30/09/2026, pago em 15/10/2026 | Caixa +R$ 10,00 em 15/10/2026 |
| As mesmas 100 MXRF11; rendimento de R$ 0,095 com data com 30/10/2026, pagamento 16/11/2026 | "A receber: R$ 9,50 em 16/11/2026"; ainda não pode ser gasto |
| Compra de 100 MXRF11 em 31/10/2026 (dia depois da data com) | Não recebe os R$ 9,50 |
| 100 PETR4 na data com 21/08/2026; JCP de R$ 0,67407131, pago em 23/11/2026 | A receber: bruto R$ 67,40, IR 17,5% R$ 11,80, líquido R$ 55,60 |
| Histórica: 100 MGLU3 compradas em 2019 a R$ 40,00; desdobramento de 300% com data com 13/10/2020 | Em 14/10/2020: 400 ações a R$ 10,00 (custo R$ 4.000,00 igual); o valor atual volta a aparecer |
| Depois, 405 MGLU3 no grupamento de 10 para 1 (data com 24/05/2024) | 40 ações; a fração de 0,5 é vendida pelo fechamento de 24/05/2024 (R$ 1,32) × 10 × 0,5 = R$ 6,60 |
| 120 ITSA4 na bonificação de 2% (data com 18/12/2025) | 122 ações (custo igual); fração 0,4 vendida em dinheiro |
| Estorno da compra de MXRF11 de 01/09/2026 | Os R$ 10,00 de outubro somem junto; se já tinham sido gastos, o estorno é recusado (`ledger_break`) |
| Interruptor do Investidor10 desligado | Sem proventos no caixa nem no extrato; desdobramento de MGLU3 continua corrigido |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Muda |
|---|---|
| `GET /api/portfolios/:id/cash` (SPEC-013) | O extrato ganha itens `kind: "income"` (tipo do provento, ativo, quantidade, valor por ação, bruto, IR, líquido, data com, `date` = pagamento, `source: "investidor10"`) e `kind: "fraction"` (venda de fração); o saldo os conta. Ganha `pendingIncome` (lista e total a receber) e `incomeEnabled` (o interruptor) |
| `GET /api/portfolios/:id/positions` (SPEC-014/016) | Quantidade e preço médio já corrigidos; `marketValue`, `change` e `changePercent` voltam com eventos; cada posição ganha `income` (total recebido) e `incomeLoaded`; `events` passa a listar os eventos aplicados (tipo, data com, antes → depois) |
| `GET /api/portfolios/:id/trade-quote` e `POST .../trades` | `cash` e `held` contam proventos e eventos até a data (na ao vivo, até hoje) |
| `POST /api/portfolios/:id/cash` e `.../reversals` | A conferência do livro conta os proventos (§4.2) |

### 5.2 Telas

As do §4.2, em português e inglês, pelo teclado, a 480 px, com "Fonte: Investidor10" junto de todo provento.

## 6. Modelo de dados

**Nenhuma tabela nova** (decisão 1). Usa `provento` e `evento_corporativo` da SPEC-042 e o livro das SPECs 013 a 016. Um índice em `provento (ativo_id, data_com)` se a leitura das posições passar de 200 ms (RNF16).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Provento entra no caixa na data de pagamento para quem tinha o ativo no fim da data com; compra no dia ex não recebe; os exemplos do §4.3 |
| CA02 | Pagamento futuro ou sem data: "a receber", fora do saldo e das conferências |
| CA03 | JCP líquido com a alíquota pela data de pagamento; extrato com bruto, IR e líquido; dividendos e rendimentos inteiros |
| CA04 | Amortização de FII: caixa e preço médio reduzido |
| CA05 | Desdobramento, grupamento e bonificação: quantidade e preço médio corrigidos, custo total igual, fração vendida pelo fechamento ajustado (ou descartada sem fechamento); o aviso da SPEC-016 some e o valor atual volta |
| CA06 | Conferência do livro com os proventos: gasto que só cabe com provento aceito; estorno que tira um provento já gasto recusado |
| CA07 | Interruptor desligado: nenhum provento nas carteiras, aviso na tela, eventos continuam; caixa negativo avisado se um provento gasto deixar de constar |
| CA08 | Histórica: `cash` da data conta os proventos pagos até ela; resultado igual ao da ao vivo para os mesmos lançamentos |
| CA09 | Exportação sem proventos (continua na `version` 6) |
| CA10 | Telas: extrato, posições com "Proventos recebidos" e "A receber", resumo, "Fonte: Investidor10"; português e inglês; teclado; 480 px; contraste (RNF04, RNF18, RNF20) |
| CA11 | Núcleo puro com testes de unidade dos arredondamentos (RNF12); posições de uma carteira com 20 ativos e 10 anos de proventos em menos de 200 ms (RNF16) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-06 | ✅ Resolvida com as decisões do §4.1 |
| — | ✅ Alíquota do JCP conferida: 17,5% a partir de 01/01/2026 pela Lei Complementar 224/2025 (que mudou o art. 9º da Lei 9.249/1995), e não pela Lei 15.270/2025 |
| — | ⏳ Eventos da B3 incompletos para alguns ativos (§9): falta um aviso ou uma segunda fonte, numa Spec futura |
| — | Depois da autorização do Investidor10, os proventos precisam de outra fonte (já anotado na SPEC-042) |

## 9. Verificação (06/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | `financial-calculation/corporate-actions.ts` (`timeline`, `firstTimelineBreak`), pura. A porta `PortfolioMarket` trocou `eventsFrom` por `corporateEvents` (com o fechamento da data com), `income`, `incomeEnabled` e `incomeLoaded`, ligados no `api/src/portfolio-market.ts`. O `cashLedger` ganhou o tipo `income` (põe dinheiro) |
| Eventos no extrato | O extrato é do caixa: o evento aparece na **posição** ("Desdobramento em 13/10/2020: 100 → 400"), e no extrato só a **venda de fração**, que mexe no caixa |
| Preço médio no evento | Dividido pelo multiplicador (6 casas, meio para cima). Com fração vendida, o custo das ações que ficam cai na parte da fração, que sai com o dinheiro dela |
| Venda maior que a posição | Uma venda gravada antes desta Spec, depois de um grupamento, pode passar da posição já corrigida. A conta vende tudo e segue; o estorno aponta essa venda (`ledger_break`, `position`) |
| Ordem no mesmo dia | Eventos e pagamentos no começo do dia, o "quem tinha" da data com no fim; no extrato, o provento tem a hora de meia-noite de Brasília |
| Proventos iguais | A SPEC-042 não dá id ao provento: a chave é ativo, tipo, data com, pagamento e valor; dois iguais (parcelas do mesmo JCP) ganham um número e entram os dois |
| JCP sem data de pagamento | Fica a receber com o IR de 17,5% (a alíquota de agora) |
| "Ainda não carregados" | Vale para o ativo que o processador ainda não visitou no Investidor10; o visitado sem página conta como carregado (não há proventos) |
| Data mínima do aporte na histórica | A tela ignora as linhas de provento para achar o último lançamento (RB25 é só dos lançamentos do usuário) |
| Índice | Não foi preciso: posições em 26 a 41 ms com 17 ativos desde 2016 (CA11) |

**Limitação encontrada (SPEC-042):** a página da B3 não traz todos os eventos de todas as empresas. A MGLU3 tem os de 2020, 2024 e 2025, mas não os desdobramentos de 2017 e 2019 (os fechamentos caem para 13% em 05/09/2017 e em 06/08/2019). Por isso, a MGLU3 comprada em 10/06/2019 sai com −98,84%. Quem comprou depois de 2019 sai certo. Sugestão: uma Spec que avise quando o preço teve um salto sem evento conhecido depois da compra (os saltos já são detectados pela SPEC-010) ou que use uma segunda fonte de eventos.

| Critério | Resultado |
|---|---|
| CA01 | ✅ Testes de unidade com os exemplos do §4.3 (MXRF11, compra no dia ex, venda na data com) e rota (`income-routes.test.ts`). Dados reais: histórica de 2019 com MGLU3, MXRF11, PETR4 e ITSA4, com R$ 5.812,53 de proventos pagos até hoje |
| CA02 | ✅ Pagamento futuro e sem data a receber, fora do saldo e das conferências; ao vivo: compra na data com de hoje fica a receber (R$ 10,00 em 20/11/2026) |
| CA03 | ✅ JCP: R$ 67,40 bruto vira R$ 57,29 líquido em 2025 e R$ 55,60 em 2026. Com dados reais: PETR4 R$ 13,50 − R$ 2,03 (2025) e R$ 35,04 − R$ 6,14 (2026) |
| CA04 | ✅ Amortização no caixa e no preço médio, que não fica negativo |
| CA05 | ✅ MGLU3 real: 100 → 400 (2020), 400 → 40 (2024), 40 → 42 (2025); ITSA4 real: 120 → 122 e a fração de 0,4 vendida por R$ 4,54 (fechamento ajustado R$ 11,37); grupamento de 405 com fração de 0,5 a R$ 6,60; o aviso da SPEC-016 saiu e o valor atual voltou |
| CA06 | ✅ Retirada que só cabe com o provento aceita; conferência do estorno com os proventos (`firstTimelineBreak`) |
| CA07 | ✅ Interruptor desligado: sem proventos no caixa nem no extrato, aviso; caixa negativo (−R$ 58,50) recusa retirada e aceita aporte |
| CA08 | ✅ `cash` da histórica em 20/05/2019: o dividendo de 02/05 entra, o JCP de 03/06 não (R$ 7.520,00) |
| CA09 | ✅ Exportação sem mudança (`version` 6, só os lançamentos do usuário) |
| CA10 | ✅ Conferido na pré-visualização das telas do app, com as respostas da API real de uma conta de teste local (histórica de 2019 com PETR4, MXRF11, ITSA4 e MGLU3): extrato com provento, IR e "Fonte: Investidor10"; "A receber" em ordem de pagamento (ajuste feito na conferência); posições com "Proventos recebidos", "A receber" com o próximo pagamento e os eventos aplicados ("Grupamento em 24 de mai. de 2024: 100 → 10"); a nota de rodapé nova; português e inglês; 480 px em cartões. Os avisos de proventos desligados e de caixa negativo ficaram nos testes de rota. ⏳ Abrir no Electron, com a ponte real |
| CA11 | ✅ Núcleo com 12 testes de unidade dos arredondamentos; 17 ativos desde 2016, 1.446 linhas no extrato: posições em 26 a 41 ms e extrato em 21 a 27 ms |

Total: **883 testes** passando e **118 com o banco** de teste, mais lint, tipos e formatação.
