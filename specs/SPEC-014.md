# SPEC-014 — Compra e venda na carteira ao vivo, com posição e preço médio

| Campo | Conteúdo |
|---|---|
| Status | Escrita em 05/11/2026. As decisões do §4.1 são **recomendações** e aguardam a resposta do Luís; o resto aguarda a aprovação. Implementar só depois da SPEC-013 pronta e revisada |
| Fase | 3 — Núcleo da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-013 |
| Prioridade | *Must* (RF12, RF14) |
| Depende de | [SPEC-009](SPEC-009.md) (cotações do pregão), [SPEC-013](SPEC-013.md) (caixa e extrato), [SPEC-005](SPEC-005.md) (calendário), [SPEC-010](SPEC-010.md) (ficha do ativo) |
| Muda | SPEC-013 (a conta do caixa passa a incluir compras e vendas, e o extrato as mostra), SPEC-010 (botão **Comprar** na ficha), SPEC-034 (negociações na exportação), `requisições.md` (versão 1.10: RB07 e nova RB27), modelo de domínio (TRANSACAO) |
| Requisitos | RF12, RF14; RB05, RB06, RB07, RB08, RB09, RB10, RB11, RB12, RB13, RB20, RB21, RB27; RNF12, RNF15, RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | Registrar compra ou venda (inclui Consultar cotação); Consultar posição e saldo; fluxo 7.1 da arquitetura (ramo ao vivo) |
| Drivers | FAS01, QA01, QA05, QA10, QA11, PA02, PA05 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA12](../adr/DA12-autorizacao-planos-no-servidor.md), [DA16](../adr/DA16-cotacoes-por-plano.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) |

---

## 1. Objetivo

Na **carteira ao vivo**, o usuário passa a **comprar e vender** ações e FIIs com o preço de agora:

- o preço é a **última cotação do pregão** disponível para o plano do usuário (DA16), e a negociação guarda o preço, o horário e o nível dessa cotação (RB07);
- a compra precisa de **caixa** (RB05) e a venda, de **posição** (RB06);
- cada negociação é um **lançamento que nunca é alterado nem apagado** (RB08), no mesmo livro-razão do caixa (DA09);
- a **posição** de cada ativo (quantidade e **preço médio**) é sempre calculada a partir das negociações (RB09, RB10), nunca guardada.

## 2. Valor

- **Usuário:** simula uma decisão de investimento com preço real e vê quanto a posição vale hoje.
- **Sistema:** as posições que a rentabilidade (SPEC-019), o estorno (SPEC-015) e a carteira histórica (SPEC-016) vão usar.
- **Projeto:** o comportamento central do produto; com a 013, fecha o caminho mínimo até a SPEC-015.

## 3. Escopo

### 3.1 Inclui

1. **Compra e venda** na carteira ao vivo, com a cotação do próprio dia (§4.1).
2. **Posições** na tela da carteira: quantidade, preço médio, último preço, valor atual e variação sobre o preço médio; totais de caixa, ativos e patrimônio.
3. **Conta das posições e do preço médio** em função pura do núcleo de cálculo (DA10), testada sem banco (RNF16).
4. **Caixa e extrato** da SPEC-013 com as compras e vendas.
5. Botão **Comprar** na ficha do ativo (SPEC-010).
6. **Exportação** (SPEC-034): as negociações entram no arquivo.
7. **Requisitos 1.10:** RB07 com "cotação do próprio dia" e a nova RB27 (quantidade inteira).

### 3.2 Não inclui

- **Carteira histórica:** compra e venda com data passada e preço de fechamento ficam com a SPEC-016. Até lá, a carteira histórica não mostra **Comprar**, e a rota responde `historical_portfolio`.
- **Estorno:** SPEC-015.
- **Proventos e eventos corporativos** (dividendos, JCP e rendimentos de FII no caixa; desdobramento e grupamento na quantidade): nova SPEC-043 (§4.1, decisão 4).
- **Rentabilidade** da carteira num período e o gráfico da evolução: SPEC-019. Aqui fica só a variação de cada posição sobre o preço médio, sem custos nem proventos.
- **Cotação do nível assinante:** SPEC-026. Até lá só existe o nível gratuito.
- **Ordem para a abertura** (comprar agora para executar no próximo pregão): fora do escopo (§4.1, decisão 1).
- **Montagem por percentual** ("50% em PETR4", cenário da P01): fica para a SPEC-016, onde está o cenário da P01 (§4.1, decisão 3).

## 4. Decisões

### 4.1 Recomendações (aguardam a resposta do Luís)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Bolsa fechada** (OPEN-08) | Compra e venda só em **dia de pregão** (RB11) e com **cotação do próprio dia** (hoje, no horário de Brasília). Sábado, domingo e feriado: `market_closed`, com a data do próximo pregão. Dia de pregão antes da primeira cotação do dia (por volta das 10h30; 13h30 na Quarta-feira de Cinzas): `no_quote_today`. Depois do fechamento, vale a última cotação do dia, que é praticamente o fechamento, até a meia-noite. Sem ordem agendada | A negociação nunca usa preço de outro dia (RB07). À noite ainda dá para simular com o preço do dia, o que ajuda quem testa depois da aula. A ordem para a abertura precisaria de fila e de um preço que ninguém conhece na hora |
| 2 | **Quantidade** (OPEN-12) | Só **inteira**, de **1 a 1.000.000** por negociação, para ações e FIIs. Sem lote padrão de 100: o simulador não separa o mercado fracionário. Nova **RB27** | Na B3, ação e cota de FII não têm fração. Lote padrão só mudaria o código de negociação (PETR4F), sem efeito no preço |
| 3 | **Por quantidade ou por valor** (OPEN-24) | A API recebe só a **quantidade** (RF12). A tela tem um atalho **"Calcular por valor"**: o usuário digita uma quantia em reais e a tela mostra quantas unidades cabem, arredondando para baixo, e a sobra. Botões **Máximo** na compra (o que o caixa paga) e **Tudo** na venda. A montagem por percentual fica para a SPEC-016 | Atende o "quanto compro com R$ 1.000" sem fração nem regra nova no servidor; o cenário por percentual da P01 é de carteira histórica |
| 4 | **Proventos e eventos** (OPEN-06) | Fora desta Spec. Uma **nova SPEC-043** ("Proventos e eventos na carteira") credita no caixa dividendos, JCP e rendimentos de FII e corrige a quantidade em desdobramento e grupamento, **para os dois tipos de carteira**, com os dados da SPEC-042. Até lá, a tela de posições avisa: "Proventos e desdobramentos ainda não entram nesta carteira." | Mexem no caixa (RB05) e na posição (RB06), então precisam entrar na mesma conta da 013 e da 014, e não só na rentabilidade (SPEC-019). As regras (data com, data de pagamento, IR do JCP) são grandes o bastante para uma Spec própria |
| 5 | **Cotação mudou** | O pedido leva o **horário da cotação** que o usuário viu. Se, na hora de gravar, já houver uma cotação mais nova, a negociação **não é gravada**: `quote_changed`, com o preço e o horário novos, e a tela pede uma nova confirmação | O usuário nunca paga um preço que não viu. A coleta é a cada 30 min, então isso é raro |
| 6 | **Comprar pela ficha** | Botão **Comprar** na ficha do ativo (só para o usuário): abre a escolha entre as **carteiras ao vivo** dele e, depois, o mesmo formulário da carteira. Sem carteira ao vivo: "Crie uma carteira ao vivo para comprar." | É o caminho natural: o usuário vê o ativo e decide. O formulário é o mesmo, então custa pouco |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Preço da negociação** | A última cotação do pregão do **nível do usuário** (até a SPEC-026, sempre `gratuito`), arredondada a **2 casas**, meio para cima (RB13). Total = quantidade × preço, exato em centavos | A B3 negocia em centavos; com quantidade inteira, o total não precisa de arredondamento |
| **Preço médio** (RB10) | Na compra: (preço médio × quantidade + total da compra) ÷ nova quantidade, guardado na conta com **6 casas** (a escala do núcleo), meio para cima; a tela mostra 2. Na venda, **não muda**. Posição zerada sai da lista, e a próxima compra começa um preço médio novo | Regra de RB10. As 6 casas evitam que o arredondamento a cada compra se acumule |
| **Conta das posições** | Função pura no núcleo de cálculo: recebe as negociações em ordem (dia e depois o momento do registro) e devolve, por ativo, a quantidade e o preço médio. A conta do caixa da SPEC-013 passa a receber também as negociações: menos o total das compras, mais o das vendas | DA10 e RNF16: as regras mais sensíveis, testadas sem banco |
| **Caixa insuficiente** (RB05) | `insufficient_cash`, com o saldo disponível | O caixa nunca fica negativo (RB26) |
| **Posição insuficiente** (RB06) | `insufficient_position`, com a quantidade que o usuário tem | Mensagem clara |
| **Ativo** | Compra só de ativo **ativo** do catálogo (`asset_inactive`). Venda de qualquer ativo da posição que tenha cotação de hoje. Ativo desativado deixa de ser coletado (SPEC-009); a posição fica, avaliada pelo último preço conhecido, e a venda volta se ele for reativado | Não se compra o que saiu da bolsa; a posição não some |
| **Dois pedidos ao mesmo tempo** | A mesma **trava da carteira** da SPEC-013: duas compras juntas nunca passam do caixa; duas vendas juntas nunca passam da posição | Dois cliques rápidos não quebram RB05 nem RB06 |
| **Auditoria (RNF15)** | Como na SPEC-013: o livro-razão é o registro. Cada negociação guarda quando foi registrada e a cotação usada; o banco **recusa alteração** (gatilho). Apagar só acontece com a carteira ou com a conta | DA09 |
| **Último preço nas posições** | A última cotação do pregão do nível do usuário; sem ela (mais de 30 dias ou ativo desativado), o último fechamento do histórico. Sempre com o horário ou a data: "Cotação das 14:30 (atraso de até 45 min)" ou "Fechamento de 31/10" | DA16: nunca "tempo real"; sempre o horário |
| **Variação da posição** | Valor atual (quantidade × último preço) menos o custo (quantidade × preço médio), em reais e em %, com sinal (+ e −, nunca só pela cor), com a nota "sem custos de operação nem proventos" | Mostra o resultado sem invadir a rentabilidade por período (SPEC-019) |
| **Aviso de custos (RB21)** | No formulário de compra e de venda: "Corretagem, emolumentos da B3 e taxa de custódia não entram na simulação." | RB20 e RB21 |
| **Confirmação** | "Comprar 100 PETR4 a R$ 31,20 (cotação das 14:30) por R$ 3.120,00? O caixa fica com R$ 1.880,00. Lançamentos não podem ser alterados nem apagados; um erro se corrige com estorno." Na venda, o mesmo com "Vender" e o caixa depois | Como na SPEC-013 |
| **Cotação na tela** | O formulário busca a cotação ao abrir e de novo a cada **5 minutos** enquanto está aberto | A coleta é às :00 e às :30; com 5 minutos, a tela quase nunca cai no `quote_changed`. Só consulta o nosso servidor, sem gastar a cota da brapi |
| **Extrato** (SPEC-013) | Passa a mostrar também **Compra** e **Venda**, com ticker, quantidade e preço ("Compra · 100 PETR4 a R$ 31,20"), o valor (compra com −, venda com +) e o saldo depois | O usuário vê de onde veio e para onde foi cada real |
| **Exportação (SPEC-034)** | Cada carteira da seção `portfolios` ganha `trades` (tipo, ticker, quantidade, preço, total, dia, momento do registro, horário e nível da cotação). `version` passa a **4** | Cada Spec entrega a sua parte |
| **Exclusão** | `exclusao_carteira.lancamentos` (SPEC-012) passa a contar também as negociações | Mesmo registro, sem dado pessoal |
| Onde fica | Módulo **Carteiras**; a cotação vem do módulo **Dados de mercado** por uma porta ligada no `main.ts`; as contas no núcleo de cálculo | Arquitetura §6, DA10 |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Caixa R$ 5.000,00; compra de 100 PETR4 a R$ 31,20 | Aceita; total R$ 3.120,00; caixa R$ 1.880,00; posição 100 a R$ 31,20 |
| Depois, compra de 50 PETR4 a R$ 32,10 | Total R$ 1.605,00; posição 150; preço médio (3.120,00 + 1.605,00) ÷ 150 = R$ 31,50 |
| Depois, venda de 60 PETR4 a R$ 33,00 | Caixa + R$ 1.980,00; posição 90, preço médio **continua** R$ 31,50 (RB10) |
| Compra de 1 a R$ 10,00 e de 2 a R$ 10,01 | Preço médio 30,02 ÷ 3 = 10,006667 na conta, R$ 10,01 na tela |
| Venda de 100 com 90 na posição | `insufficient_position`, você tem 90 |
| Compra que custa R$ 2.000,00 com R$ 1.880,00 em caixa | `insufficient_cash`, disponível R$ 1.880,00 |
| Sábado, ou 25/12 | `market_closed`, próximo pregão na segunda (ou no dia útil seguinte) |
| Terça, 9h | `no_quote_today`: "A primeira cotação de hoje chega por volta das 10h30." |
| Terça, 21h | Aceita, com a última cotação do dia (das 18h30) |
| Quantidade 2,5 ou 0 | `validation_error` (`quantity`) |
| Cotação vista das 14:00; às 14:31 chegou a das 14:30 | `quote_changed`, com o preço novo; nada é gravado |
| "Calcular por valor" com R$ 1.000,00 e preço R$ 31,20 | 32 unidades (R$ 998,40), sobra R$ 1,60 |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/portfolios/:id/positions` (nova) | Usuário dono | — | 200 com `cash`, `positionsValue`, `total` e `positions` (`assetId`, `ticker`, `name`, `class`, `quantity`, `averagePrice`, `lastPrice`, `lastPriceAt`, `lastPriceKind`: `intraday` ou `close`, `marketValue`, `change`, `changePercent`) | 404 `portfolio_not_found`; 401; 403 |
| `GET /api/portfolios/:id/trade-quote` (nova) | Usuário dono | `assetId` | 200 com `tradable: true`, `price`, `quotedAt`, `level`, `delayMinutes`, `cash` e `held` (quantidade na posição); ou `tradable: false` e `reason` (`market_closed` com `nextTradingDay`, `no_quote_today`, `asset_inactive`, `historical_portfolio`, `calendar_not_published`) | 404 `portfolio_not_found`, `asset_not_found`; 401; 403 |
| `POST /api/portfolios/:id/trades` (nova) | Usuário dono | `type` (`buy` ou `sell`), `assetId`, `quantity`, `quotedAt` | 201 com `trade` (`id`, `type`, `ticker`, `quantity`, `price`, `total`, `date`, `recordedAt`, `quotedAt`, `level`), o novo `cash` e a `position` do ativo | 400 `validation_error` (`quantity`, `type`, `quotedAt`); 409 `insufficient_cash` (com `available`), `insufficient_position` (com `held`), `quote_changed` (com `price` e `quotedAt` novos), `market_closed`, `no_quote_today`, `asset_inactive`, `historical_portfolio`, `calendar_not_published`; 404; 401; 403 |
| `GET /api/portfolios/:id/cash` (SPEC-013, muda) | Usuário dono | — | `entries` ganham os tipos `buy` e `sell`, com `trade` (`ticker`, `quantity`, `price`) | Os da SPEC-013 |

Nenhuma rota altera ou apaga negociação (RB08). Colaborador recebe 403 e carteira de outro usuário dá 404, com o aviso no log, como na SPEC-012.

### 5.2 Telas

| Situação | Tela |
|---|---|
| Carteira ao vivo | Abaixo do caixa: **Posições** (tabela; cartões em 480 px) e os totais **Caixa**, **Em ativos** e **Total**. Botão **Comprar**; em cada posição, **Vender** e o ticker como link para a ficha |
| Comprar | Busca do ativo (a mesma da lista Ativos), cotação com o horário e o atraso, quantidade com **Máximo** e **Calcular por valor**, total, caixa depois, aviso de custos (RB21), **Revisar** → confirmação → "Compra registrada." com a posição nova |
| Vender | Ativo já escolhido; quantidade com **Tudo**; o resto igual à compra |
| Bolsa fechada | Formulário com a mensagem no lugar da cotação: "A bolsa está fechada. Compras e vendas voltam no próximo pregão, {segunda, 9 de novembro}." O botão de revisar fica desativado |
| Antes da primeira cotação | "A primeira cotação de hoje chega por volta das 10h30." |
| Cotação mudou | Na confirmação: "A cotação mudou para R$ 31,40 (das 14:30). Confirmar com o novo preço?" |
| Sem posições | "Nenhum ativo nesta carteira ainda. Use **Comprar** para começar." |
| Carteira histórica | Sem **Comprar**; o espaço das posições diz que a compra e venda na histórica chega numa próxima versão |
| Ficha do ativo | Botão **Comprar** (só usuário); com mais de uma carteira ao vivo, pede qual |
| Aviso de proventos | Abaixo das posições: "Proventos e desdobramentos ainda não entram nesta carteira." (até a SPEC-043) |

Português e inglês; tudo pelo teclado, com o foco no primeiro campo ao abrir o formulário e de volta no botão que o abriu ao fechar; nenhuma tela escreve "tempo real".

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `transacao` (nova) | `id`, `carteira_id`, `ativo_id`, `tipo` (`compra` ou `venda`), `quantidade`, `preco_unitario`, `valor_total`, `data` (dia), `registrado_em`, `cotacao_em`, `nivel_cotacao`, `fonte_cotacao` | `carteira_id` aponta para `carteira`, **apagando em cascata**; `ativo_id` aponta para `ativo` (sem apagar); `tipo` em lista fechada; `quantidade` inteira de 1 a 1.000.000 (RB27); `preco_unitario` decimal(15,2) positivo; `valor_total` decimal(15,2) igual a quantidade × preço; `data` é o dia de `registrado_em` e o de `cotacao_em` em Brasília, nunca em fim de semana; `nivel_cotacao` em lista fechada (`gratuito`, `assinante`); **alteração recusada por gatilho** (RB08) |

Índice por (`carteira_id`, `data`, `registrado_em`) para a conta na ordem. A migração tem `down.sql` (RNF17). A SPEC-016 decide como a mesma tabela guarda a negociação histórica (sem horário de cotação).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Posições em função pura (sem banco): quantidade e preço médio por ativo, na ordem das negociações, com os exemplos do §4.3 calculados à mão, inclusive o preço médio com dízima, a venda que não muda o preço médio e a posição zerada que recomeça |
| CA02 | Caixa da SPEC-013 com as negociações: aportes − retiradas − compras + vendas, em decimal; extrato com compras e vendas e o saldo depois de cada lançamento |
| CA03 | Compra: `insufficient_cash` com o disponível; ativo desativado `asset_inactive`; quantidade inteira de 1 a 1.000.000, fora disso `validation_error`; carteira histórica `historical_portfolio` |
| CA04 | Venda: `insufficient_position` com a quantidade; o preço médio não muda |
| CA05 | Bolsa (com relógio fixo nos testes): sábado e feriado `market_closed` com o próximo pregão; dia de pregão sem cotação de hoje `no_quote_today`; depois do fechamento, aceita com a última cotação do dia; ano sem calendário `calendar_not_published` |
| CA06 | Preço = última cotação do nível do usuário arredondada a 2 casas; a negociação guarda preço, total, horário, nível e fonte da cotação; `quotedAt` diferente da cotação mais nova → `quote_changed`, sem gravar nada |
| CA07 | Duas compras ao mesmo tempo nunca passam do caixa; duas vendas ao mesmo tempo nunca passam da posição (teste com o banco) |
| CA08 | Negociação nunca é alterada: não há rota, e o banco recusa; apagar a carteira ou a conta apaga as negociações, e o registro de exclusão as conta |
| CA09 | Posições: quantidade, preço médio, último preço com horário (ou o fechamento com a data), valor atual e variação com sinal; totais de caixa, ativos e patrimônio; carteira de outro usuário 404; colaborador 403 |
| CA10 | Exportação com `trades` em cada carteira, `version` 4 |
| CA11 | Telas: comprar (com Máximo e Calcular por valor), vender (com Tudo), confirmação, cotação mudou, bolsa fechada, aviso de custos e de proventos, botão Comprar na ficha; português e inglês; teclado e foco; 480 px; contraste (RNF04, RNF18, RNF20); nenhum "tempo real" |
| CA12 | `requisições.md` 1.10 (RB07 e RB27) e modelo de domínio atualizados; a tabela existe com as restrições do §6; a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-08 | ⏳ Recomendação 1 (§4.1): só em dia de pregão, com cotação do próprio dia |
| OPEN-12 | ⏳ Recomendação 2: quantidade inteira, sem lote (RB27) |
| OPEN-24 | ⏳ Recomendação 3: quantidade na API, "Calcular por valor" na tela; percentual na SPEC-016 |
| OPEN-06 | ⏳ Recomendação 4: tratamento na carteira na nova SPEC-043, para os dois tipos |
| OPEN-09 | ✅ RB07 já reescrita na SPEC-012; aqui ganha "do próprio dia" |
| OPEN-43 | ⏳ O diagrama de casos de uso continua sem a carteira histórica e o aporte |
