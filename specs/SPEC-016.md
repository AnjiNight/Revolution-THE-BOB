# SPEC-016 — Compra e venda na carteira histórica

| Campo | Conteúdo |
|---|---|
| Status | Escrita em 06/11/2026 para a Nicoly implementar. As decisões do §4.1 são **recomendações** e aguardam a resposta do Luís; o resto aguarda a aprovação |
| Fase | 3 — Núcleo da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-015 |
| Prioridade | Sem MoSCoW nos requisitos (decisão DA17); é o cenário da P01 ("e se eu tivesse investido?") |
| Depende de | [SPEC-008](SPEC-008.md) (fechamentos da B3 desde 2016), [SPEC-013](SPEC-013.md) (caixa da histórica), [SPEC-014](SPEC-014.md) (compra e venda, posições), [SPEC-015](SPEC-015.md) (estorno), [SPEC-042](SPEC-042.md) (eventos corporativos) |
| Muda | SPEC-014 (rota e telas de compra e venda aceitam a carteira histórica; a ficha do ativo oferece as carteiras históricas; "Calcular por valor" ganha "% do caixa"), SPEC-034 (negociações da histórica na exportação, sem horário de cotação) |
| Requisitos | RF12; RB05, RB06, RB07, RB08, RB09, RB10, RB11, RB12, RB13, RB20, RB21, RB25, RB27, RB28; RNF12, RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | Registrar compra ou venda (variante histórica, fora do diagrama, OPEN-43); fluxo 7.1 da arquitetura (ramo histórico); cenário da P01 |
| Drivers | OBJ01, FAS01, QA01 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md), [DA18](../adr/DA18-historico-cotacoes-arquivos-b3.md) |

---

## 1. Objetivo

Na **carteira histórica**, o usuário passa a **comprar e vender** numa data passada:

- o preço é o **fechamento da B3** do dia escolhido (RB07), como a B3 publicou;
- a data segue as regras da histórica que a SPEC-013 já usa no caixa: dia de pregão, não antes do início da carteira nem do último lançamento (RB25), antes de hoje (RB12);
- o resto é o mesmo da carteira ao vivo (SPEC-014): caixa na compra (RB05), posição na venda (RB06), quantidade inteira (RB27), preço médio (RB10), estorno (RB28);
- as posições são avaliadas **até hoje** (DA17), com a cotação de agora ou o último fechamento.

## 2. Valor

- **Usuário (P01):** "e se eu tivesse comprado PETR4 em 2019?", com o preço daquele dia e o valor de hoje.
- **Projeto:** fecha a Fase 3 (núcleo da carteira) com os dois tipos de carteira completos.

## 3. Escopo

### 3.1 Inclui

1. **Compra e venda** na carteira histórica, com a data escolhida e o fechamento da B3 do dia.
2. **Cotação para negociar** na histórica: o fechamento do dia ou o motivo de não dar.
3. **Posições** na histórica, como na ao vivo, com o aviso de evento corporativo depois da compra (§4.1, decisão 2).
4. **"% do caixa"** no "Calcular por valor" (§4.1, decisão 3), nas duas carteiras.
5. **Comprar pela ficha** também nas carteiras históricas (§4.1, decisão 5).
6. **Exportação** (SPEC-034): as negociações da histórica, com o fechamento usado.

### 3.2 Não inclui

- **Proventos e eventos na carteira** (somar dividendos ao caixa, corrigir a quantidade num desdobramento): SPEC-043.
- **Rentabilidade por período** e gráfico da evolução: SPEC-019.
- **Montar a carteira inteira de uma vez** (vários ativos com percentuais numa operação só): fora; o "% do caixa" resolve um ativo por vez (§4.1, decisão 3).
- **Preço ajustado** para negociar: a negociação usa o preço publicado; o ajuste fica no gráfico da ficha (SPEC-042).

## 4. Decisões

### 4.1 Recomendações (aguardam a resposta do Luís)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Preço** | O **fechamento da B3 do dia escolhido, como publicado** (sem ajuste). Se o ativo não teve negócio naquele dia, a negociação é recusada (`no_close_that_day`), e a tela diz qual foi o último dia com negócio antes dele | É o preço que se pagava de verdade naquele dia. Preço de outro dia seria inventar |
| 2 | **Evento corporativo depois da compra** (OPEN-06) | Até a SPEC-043, quando o ativo teve **desdobramento, grupamento ou bonificação** depois da primeira compra ainda em posição, a posição mostra o aviso "Teve desdobramento em 15/03/2021: o valor atual ainda não considera isso" e **não mostra** valor atual nem variação. Recomendo fazer a **SPEC-043 logo depois** desta | Sem corrigir a quantidade, o valor de hoje sai muito errado (num desdobramento de 1 para 8, a carteira pareceria ter perdido quase 90%). Melhor não mostrar um número errado |
| 3 | **Por percentual** (OPEN-24) | O "Calcular por valor" (SPEC-014) ganha a opção **"% do caixa"**: o usuário digita, por exemplo, 50%, e a tela mostra quantas unidades cabem em metade do caixa. Vale nas duas carteiras. Montar vários ativos de uma vez fica fora | Atende o cenário da P01 ("50% em PETR4") sem regra nova no servidor: a API continua recebendo só a quantidade (RF12) |
| 4 | **Ativo desativado** | Na histórica, pode ser comprado se teve negócio no dia escolhido (por exemplo, uma empresa que saiu da bolsa depois). A posição dele é avaliada pelo último fechamento | Na data escolhida, ele estava na bolsa. Recusar seria apagar parte da história |
| 5 | **Comprar pela ficha** | O botão **Comprar** da ficha oferece também as carteiras históricas, com o rótulo do tipo; na histórica, o formulário abre pedindo a data | O usuário vê o ativo e pergunta "e se eu tivesse comprado em 2019?" |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Data da negociação** | As mesmas regras do aporte na histórica (SPEC-013): dia de pregão (`not_trading_day`), não antes do início (`before_start`), não antes do último lançamento que vale (`before_last_entry`, RB25; o estornado não conta, RB28), antes de hoje (`future`); ano sem calendário: `calendar_not_published` | Uma regra só para todos os lançamentos da histórica |
| **Histórico do ativo** | Se o histórico do ativo ainda não foi carregado (SPEC-008), `history_pending`: "O histórico de preços deste ativo ainda está sendo carregado." | Não confundir com "não teve negócio" |
| **Fechamento do dia ainda não chegou** | O dia de ontem pode ainda não ter o arquivo da B3. Nesse caso, `no_close_that_day`, com a mensagem "O fechamento desse dia ainda não chegou da B3" quando o dia é o último pregão | O processador carrega o arquivo do dia seguinte |
| **Cotação mudou** | Não existe na histórica: o fechamento de um dia passado não muda. O pedido manda a **data**, não o horário da cotação | Mais simples que a ao vivo |
| **Ordem no livro** | Como em todo lançamento da histórica: o dia escolhido e, no mesmo dia, a ordem do registro | Igual à SPEC-013 |
| **Avaliação até hoje** (DA17) | Posições da histórica avaliadas como na ao vivo: a cotação do pregão de agora ou, sem ela, o último fechamento | O "quanto valeria hoje" |
| **Estorno** | Igual à SPEC-015: sem prazo na histórica, com a conferência do livro | Já aprovado |
| **Confirmação** | "Comprar 100 PETR4 a R$ 25,30 (fechamento de 15/03/2019) por R$ 2.530,00? O caixa fica com R$ 7.470,00 nessa data. Lançamentos não podem ser alterados nem apagados; um erro se corrige com estorno." | Como nas outras Specs |
| **Exportação (SPEC-034)** | As negociações da histórica entram em `trades`, com `quotedAt` e `level` `null` e `source: "b3"`. `version` passa a **6** | Cada Spec entrega a sua parte |
| Onde fica | Módulo **Carteiras**, no mesmo serviço de negociação da SPEC-014. A porta `PortfolioMarket` ganha "fechamento do dia", "último dia com negócio antes" e "eventos depois de uma data", ligados no `api/src/portfolio-market.ts` | Arquitetura §6, sem um módulo conhecer o outro |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Histórica com início em 02/01/2019 e R$ 10.000,00; compra de 100 PETR4 em 15/03/2019 (fechamento R$ 25,30) | Aceita; total R$ 2.530,00; caixa R$ 7.470,00; posição avaliada com o preço de hoje |
| Compra em 05/03/2019 (Carnaval) | `not_trading_day` |
| Compra em 10/03/2019 com um aporte já em 15/03/2019 | `before_last_entry` |
| Ativo sem negócio em 15/03/2019 | `no_close_that_day`; "O último negócio antes foi em 13/03/2019" |
| Venda de 60 PETR4 em 20/05/2019 | Aceita, com o fechamento de 20/05/2019; preço médio não muda |
| Ativo com desdobramento em 2021, comprado em 2019 | A posição mostra o aviso do desdobramento, sem valor atual nem variação (até a SPEC-043) |
| "Calcular por valor" com 50% do caixa de R$ 7.470,00 a R$ 25,30 | Cabem 147 (R$ 3.719,10); sobram R$ 15,90 da metade |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/portfolios/:id/trade-quote` (SPEC-014, muda) | Usuário dono | `assetId` e, na histórica, `date` | Na histórica: `tradable: true` com `price` (o fechamento), `date`, `source: "b3"`, `cash` e `held` **naquela data**; ou `tradable: false` com `reason` (os da data, `no_close_that_day` com `lastTradingDay`, `history_pending`) | Os da SPEC-014 |
| `POST /api/portfolios/:id/trades` (SPEC-014, muda) | Usuário dono | Na histórica: `type`, `assetId`, `quantity` e `date` (sem `quotedAt`) | 201 como na SPEC-014, com `quotedAt` e `level` `null` | Na histórica: 400 `validation_error` (`date`: `required`, `not_trading_day`, `before_start`, `before_last_entry`, `future`); 409 `no_close_that_day`, `history_pending`, `insufficient_cash`, `insufficient_position`, `calendar_not_published`. Na ao vivo, mandar `date` é `validation_error` (`not_allowed`) |
| `GET /api/portfolios/:id/positions` (SPEC-014, muda) | Usuário dono | — | Na histórica também; cada posição ganha `events` (desdobramentos, grupamentos e bonificações depois da primeira compra em posição, com tipo e data com); com eventos, `marketValue`, `change` e `changePercent` vêm `null` | Os da SPEC-014 |

O `held` e o `cash` da `trade-quote` na histórica são os do livro até a data escolhida, que é o mesmo de hoje, porque nada vem depois dela (RB25).

### 5.2 Telas

| Situação | Tela |
|---|---|
| Carteira histórica | Ganha **Posições**, com **Comprar** e **Vender**, como a ao vivo, no lugar do aviso "chega numa próxima versão" |
| Comprar ou vender na histórica | Ativo (busca), **Data** (do primeiro ao último dia aceitos, como no aporte da histórica) e, com os dois, a linha "Fechamento de 15/03/2019: R$ 25,30 (B3)"; quantidade com **Máximo**, **Tudo** e "Calcular por valor"; aviso de custos (RB21); confirmação do §4.2 |
| Sem negócio no dia | "Não houve negócio com PETR4 em 15/03/2019. O último antes foi em 13/03/2019." |
| "Calcular por valor" | Alterna entre **R$** e **% do caixa** (nas duas carteiras) |
| Posição com evento depois da compra | No lugar do valor atual e da variação: "Teve desdobramento em 15/03/2021: o valor atual ainda não considera isso." |
| Ficha do ativo | **Comprar** lista as carteiras ao vivo e históricas, com o rótulo do tipo |

Português e inglês; tudo pelo teclado; 480 px; o rótulo "Simulação histórica: resultado calculado com dados já conhecidos" continua no topo da carteira (DA17).

## 6. Modelo de dados

| Tabela | Muda | Restrições |
|---|---|---|
| `transacao` (SPEC-014) | `cotacao_em` e `nivel_cotacao` passam a aceitar vazio | A restrição do dia vira duas: **ao vivo** (com `cotacao_em` e `nivel_cotacao`): o dia é o do registro e o da cotação, como antes; **histórica** (sem os dois): `fonte_cotacao` é `b3_cotahist` e o dia é **antes** do dia do registro. Nunca em fim de semana, nos dois casos |

A carteira não fica gravada na negociação de outro jeito: o tipo da carteira já diz qual regra vale. A migração tem `down.sql` (RNF17), que só funciona sem negociações históricas gravadas (o `down.sql` avisa).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Compra e venda na histórica com o fechamento da B3 do dia; caixa, posição e preço médio como na SPEC-014; os exemplos do §4.3 |
| CA02 | Data: dia de pregão, não antes do início nem do último lançamento que vale (estornado não conta), antes de hoje; cada caso recusado com o motivo; ano sem calendário: `calendar_not_published` |
| CA03 | Sem negócio no dia: `no_close_that_day` com o último dia com negócio antes; histórico não carregado: `history_pending` |
| CA04 | Ativo desativado com negócio no dia pode ser comprado na histórica; na ao vivo continua `asset_inactive` |
| CA05 | Posições da histórica avaliadas até hoje; com evento corporativo depois da primeira compra em posição: `events` preenchido e sem valor atual nem variação |
| CA06 | Estorno de negociação da histórica sem prazo, com a conferência do livro (SPEC-015) |
| CA07 | Banco: negociação da histórica sem horário nem nível de cotação, com fonte da B3 e dia antes do registro; a da ao vivo continua com as regras da SPEC-014; a migração pode ser desfeita e refeita (RNF17) |
| CA08 | "% do caixa" no "Calcular por valor", nas duas carteiras (ex.: 50% de R$ 7.470,00 a R$ 25,30 = 147 unidades) |
| CA09 | Exportação com as negociações da histórica (`quotedAt` e `level` `null`, `source` "b3"), `version` 6 |
| CA10 | Telas: Posições na histórica, Comprar com data, fechamento do dia, sem negócio no dia, aviso de evento, "% do caixa", Comprar pela ficha nas históricas; português e inglês; teclado e foco; 480 px; contraste (RNF04, RNF18, RNF20) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-24 | ⏳ Recomendação 3 (§4.1): "% do caixa" no "Calcular por valor"; montar vários ativos de uma vez fica fora |
| OPEN-06 | ⏳ Recomendação 2: até a SPEC-043, aviso no lugar do valor quando houve evento depois da compra; SPEC-043 logo depois desta |
| OPEN-43 | ⏳ O diagrama de casos de uso continua sem a carteira histórica |
