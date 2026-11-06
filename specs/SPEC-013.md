# SPEC-013 — Aportes e retiradas de caixa

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 05/11/2026 com as recomendações aceitas pelo Luís (§4.1), aprovada por ele em 06/11/2026 e implementada (§9) |
| Fase | 3 — Núcleo da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-012 |
| Prioridade | *Must* (RF13) |
| Depende de | [SPEC-005](SPEC-005.md) (calendário), [SPEC-012](SPEC-012.md) (carteiras: tabela, tela e formulário de criação) |
| Muda | SPEC-012 (campo "Valor inicial" na criação e saldo na tela da carteira), SPEC-016 (passa a cuidar só de compra e venda na histórica), SPEC-034 (lançamentos de caixa na exportação), `requisições.md` (versão 1.9: RB11 só para compra e venda) |
| Requisitos | RF13; RB08, RB09, RB11, RB12, RB13, RB25, RB26; RNF12, RNF15, RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | Consultar posição e saldo (sem caso de uso de aporte, OPEN-43); P01 passo 4 |
| Drivers | FAS01, QA01, QA11, QA13 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) |

---

## 1. Objetivo

A carteira passa a ter **dinheiro fictício**, registrado num **livro-razão** (DA09):

- o usuário faz **aportes** (põe dinheiro) e **retiradas** (tira dinheiro) na carteira;
- cada um vira um **lançamento que nunca é alterado nem apagado** (RB08); um erro se corrige com estorno (SPEC-015);
- o **saldo em caixa** é sempre a conta dos lançamentos (RB09), nunca um número guardado;
- ao criar a carteira, o campo opcional **"Valor inicial"** já registra o primeiro aporte (OPEN-11, decidida na SPEC-012).

## 2. Valor

- **Usuário (P01, passo 4):** define quanto dinheiro fictício tem para simular, e vê de onde vem cada real do caixa.
- **Sistema:** o livro-razão que as compras e vendas (SPEC-014) usam: a compra só acontece com saldo (RB05).
- **Projeto:** a regra de lançamento imutável (DA09) começa a valer de verdade.

## 3. Escopo

### 3.1 Inclui

1. **Aporte e retirada** nas duas carteiras: na ao vivo, no momento atual; na histórica, numa data passada escolhida (§4.1).
2. **"Valor inicial"** na criação da carteira (formulário da SPEC-012).
3. **Saldo e extrato** na tela da carteira: saldo atual e a lista de lançamentos, com o saldo depois de cada um.
4. **Conta do caixa** em função pura do núcleo de cálculo (DA10), testada sem banco (RNF16).
5. **Exportação** (SPEC-034): os lançamentos de caixa entram no arquivo.
6. **Requisitos 1.9:** a RB11 passa a valer só para compra e venda (§4.1, decisão 1).

### 3.2 Não inclui

- **Compra e venda** (que também mexem no caixa): SPEC-014 na ao vivo, SPEC-016 na histórica.
- **Estorno** de lançamento: SPEC-015.
- **Proventos** creditados no caixa (dividendos, rendimentos de FII): ficam com a SPEC-014 (posição) e a SPEC-019 (rentabilidade), com os dados da SPEC-042.
- **Rendimento do caixa parado** (CDI sobre o saldo): fora do escopo; o dinheiro no caixa não rende.
- **Saldo na lista de carteiras:** junto com o valor e a rentabilidade, na SPEC-019.

## 4. Decisões

### 4.1 Respondidas pelo Luís em 05/11/2026 (as recomendações)

| # | Tema | Decisão | Motivo |
|---|---|---|---|
| 1 | **Dia sem pregão na ao vivo** | Aporte e retirada na carteira **ao vivo** são aceitos **em qualquer dia e hora**, inclusive sábado, domingo e feriado. A **RB11** passa a falar só de **compra e venda** (requisitos 1.9). Na **histórica**, a data do aporte ou da retirada continua tendo de ser **dia de pregão** | É só dinheiro no caixa, não negociação na bolsa. Na histórica, a data em dia de pregão mantém a ordem certa com as compras e vendas, que só acontecem nesses dias |
| 2 | **Valores** | De **R$ 0,01 a R$ 10.000.000,00** por lançamento, com **2 casas decimais** (RB13). Mais casas, zero, negativo ou acima do teto: `validation_error` | Cobre qualquer simulação de pessoa física sem deixar números absurdos |
| 3 | **Data** | **Ao vivo:** sempre o **momento atual**, definido pelo servidor (DA17); o usuário não escolhe. **Histórica:** escolhida pelo usuário — dia de pregão, **não antes da data de início** da carteira, **não antes do último lançamento** (RB25) e **até o último pregão antes de hoje** (RB12) | DA17 e RB25: sem lançamento "no meio" do histórico, nenhum lançamento já aceito fica inválido depois |
| 4 | **Correção** | Por **estorno** (SPEC-015), nunca editando nem apagando (RB08). Até a SPEC-015, o lançamento errado fica; por isso a tela pede **confirmação** antes de registrar e avisa que não dá para alterar depois | DA09; avisar antes evita surpresa |
| 5 | **"Valor inicial"** | Campo **opcional** no formulário de criação. Preenchido, registra o **primeiro aporte** na mesma operação da criação: na ao vivo, no momento da criação; na histórica, na data de início. Vazio, a carteira nasce sem dinheiro | OPEN-11 (SPEC-012): o caixa vem só dos aportes, sem `saldo_inicial` |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Retirada maior que o caixa** | Recusada: `insufficient_cash`, com o saldo disponível na resposta (RB26). Na histórica, conta o saldo **na data** da retirada, que é o saldo atual, porque não há lançamento depois dela (RB25) | O caixa nunca fica negativo |
| **Dois pedidos ao mesmo tempo** | A carteira fica **travada** enquanto um lançamento é conferido e gravado: duas retiradas juntas nunca passam do saldo | Sem isso, dois cliques rápidos poderiam deixar o caixa negativo |
| **Conta do caixa** | Função pura no núcleo de cálculo: soma dos aportes menos as retiradas (e, com a SPEC-014, menos as compras e mais as vendas), em decimal (RNF12), na ordem dos lançamentos (data e depois o momento do registro). Devolve o saldo final e o saldo depois de cada lançamento | DA10 e RNF16: a regra mais sensível do sistema, testada sem banco |
| **Auditoria (RNF15)** | O próprio livro-razão é o registro: cada lançamento guarda quando foi registrado, e o banco **recusa alteração** (gatilho, como no registro de auditoria). Apagar só acontece junto com a carteira (SPEC-012) ou com a conta (SPEC-034) | DA09: nada se apaga nem se altera por fora |
| Formato do valor | Na tela, no formato do idioma ("1.234,56" em português, "1,234.56" em inglês), sempre em reais; na API, decimal em texto com até 2 casas ("1234.56") | RNF12 e RNF20 |
| **Confirmação** | Antes de registrar: "Aportar R$ 1.000,00 em {carteira} {em 15/03/2019}? Lançamentos não podem ser alterados nem apagados; um erro se corrige com estorno." | Decisão 4 |
| **Extrato** | Na tela da carteira: saldo atual em destaque e a lista dos lançamentos, **do mais recente ao mais antigo**, com data (e hora, na ao vivo), tipo, valor (aporte com +, retirada com −) e saldo depois. Até 100 por vez, com **Mostrar mais** | O usuário confere de onde veio cada real |
| Data na histórica (tela) | Campo de data que já mostra o primeiro e o último dia aceitos ("de 02/01/2019 a 04/11/2026"); dia sem pregão é recusado com o motivo | Menos tentativa e erro |
| **Exportação (SPEC-034)** | Cada carteira da seção `portfolios` ganha `cashEntries` (tipo, valor, data, momento do registro). `version` passa a **3** | Cada Spec entrega a sua parte |
| **SPEC-016** | Passa a cuidar só de **compra e venda** na carteira histórica; os aportes e retiradas dela já ficam aqui | O caixa da histórica é o mesmo livro-razão, com as mesmas regras; separar só complicaria |
| Onde fica | Módulo **Carteiras** da SPEC-012; a conta do caixa no núcleo de cálculo | Arquitetura §6, DA10 |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Ao vivo: aporte de R$ 1.000,00 num sábado | Aceito; data do sábado, com a hora; saldo R$ 1.000,00 |
| Ao vivo: retirada de R$ 1.200,00 com R$ 1.000,00 em caixa | `insufficient_cash`, disponível R$ 1.000,00 |
| Histórica (início 02/01/2019): aporte em 15/03/2019 e depois retirada em 10/03/2019 | A retirada é recusada: `date: before_last_entry` |
| Histórica: aporte em 21/04/2021 (Tiradentes) | `date: not_trading_day` |
| Aporte de R$ 0,001 ou de R$ 10.000.000,01 | `validation_error` (`amount`) |
| Carteira criada com "Valor inicial" R$ 5.000,00, histórica com início 02/01/2019 | Primeiro lançamento: aporte de R$ 5.000,00 em 02/01/2019 |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `POST /api/portfolios` (SPEC-012, muda) | Usuário | Novo campo opcional `initialAmount` | 201; com valor, a carteira já vem com o primeiro aporte | Os da SPEC-012 e o `validation_error` de `initialAmount` |
| `GET /api/portfolios/:id/cash` (nova) | Usuário dono | `offset` (opcional) | 200 com `balance`, `entries` (`id`, `type`: `deposit` ou `withdrawal`, `amount`, `date`, `recordedAt`, `balanceAfter`), `hasMore` e `total` | 404 `portfolio_not_found`; 401; 403 |
| `POST /api/portfolios/:id/cash` (nova) | Usuário dono | `type`, `amount`, `date` (só na histórica; na ao vivo, enviar é `validation_error`) | 201 com `entry` e o novo `balance` | 400 `validation_error` (`amount`, `date`: `not_trading_day`, `before_start`, `before_last_entry`, `future`); 409 `insufficient_cash` (com `available`), `calendar_not_published`; 404; 401; 403 |

Nenhuma rota altera ou apaga lançamento (RB08).

### 5.2 Telas

| Situação | Tela |
|---|---|
| Nova carteira (SPEC-012) | Campo **Valor inicial (opcional)**, com a dica "Vira o primeiro aporte da carteira" |
| Tela da carteira | **Saldo em caixa** em destaque; botões **Aportar** e **Retirar**; extrato abaixo |
| Aportar ou retirar | Valor (e data, na histórica); confirmação da §4.2; depois, "Aporte registrado." e o saldo novo |
| Carteira sem lançamentos | "Esta carteira ainda não tem dinheiro. Faça um aporte para começar a simular." |
| Saldo insuficiente | "Saldo insuficiente: há R$ 1.000,00 em caixa." no campo do valor |
| 480 px | Saldo, botões e extrato um embaixo do outro; o extrato em cartões |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `lancamento_caixa` (nova) | `id`, `carteira_id`, `tipo` (`aporte` ou `retirada`), `valor`, `data` (dia), `registrado_em` (momento) | `carteira_id` aponta para `carteira`, **apagando em cascata** (exclusão de carteira e de conta); `tipo` em lista fechada; `valor` decimal(15,2) maior que zero e até 10.000.000,00; `data` de 04/01/2016 em diante e não depois do dia de `registrado_em`; **alteração recusada por gatilho** (RB08) |

Na ao vivo, `data` é o dia de `registrado_em` no horário de Brasília. A migração tem `down.sql` (RNF17). O `exclusao_carteira.lancamentos` (SPEC-012) passa a contar os lançamentos de caixa.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Conta do caixa em função pura (sem banco): aportes menos retiradas, em decimal, na ordem dos lançamentos, com o saldo depois de cada um; casos calculados à mão, inclusive centavos e o teto |
| CA02 | Ao vivo: aporte e retirada no momento atual, em qualquer dia; enviar `date` é recusado |
| CA03 | Histórica: data em dia de pregão, não antes do início nem do último lançamento, até o último pregão antes de hoje; cada caso recusado com o motivo; ano sem calendário: `calendar_not_published` |
| CA04 | Retirada maior que o saldo: `insufficient_cash` com o disponível; duas retiradas ao mesmo tempo nunca deixam o caixa negativo (teste com o banco) |
| CA05 | Valores de R$ 0,01 a R$ 10.000.000,00 com até 2 casas; fora disso, `validation_error` |
| CA06 | "Valor inicial" na criação registra o primeiro aporte na mesma operação (na histórica, na data de início); se a criação falhar, nada é gravado |
| CA07 | Lançamento nunca é alterado: não há rota, e o banco recusa a alteração; apagar a carteira ou a conta apaga os lançamentos, e o registro de exclusão conta quantos eram |
| CA08 | Extrato do mais recente ao mais antigo, com o saldo depois de cada lançamento, 100 por vez com **Mostrar mais**; carteira de outro usuário: 404 |
| CA09 | Exportação com `cashEntries` em cada carteira, `version` 3 |
| CA10 | Telas: valor inicial, saldo, aportar e retirar com confirmação, extrato, saldo insuficiente; português e inglês; teclado; 480 px; contraste (RNF04, RNF18, RNF20) |
| CA11 | `requisições.md` 1.9 (RB11 só para compra e venda); a tabela existe com as restrições do §6; a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-11 | ✅ Decidida na SPEC-012; aqui ganha o campo "Valor inicial" e a RB26 |
| OPEN-08 | ⏳ Compra e venda com a bolsa fechada: SPEC-014. Aporte e retirada não dependem dela (decisão 1) |
| OPEN-43 | ⏳ Falta o caso de uso de aporte no diagrama de casos de uso |
| Rendimento do caixa | Fora do escopo; se a equipe quiser o caixa rendendo CDI, vira uma Spec própria |

## 9. Verificação (06/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Saldo disponível no erro | O corpo de erro ganhou o campo `details`: `insufficient_cash` responde `{ error, message, details: { available: "1000.00" } }`. As próximas Specs usam o mesmo campo (a SPEC-014, para a posição e a cotação nova) |
| Valores | A API aceita "1000", "1000.5" ou "1000.50"; a resposta sempre traz 2 casas ("1000.00"). Na tela, a pedido do Luís (06/11/2026), o campo é como nos apps de banco e de corretora: "R$" fixo na frente, teclado numérico e os dígitos enchendo o valor a partir dos centavos, já com o ponto do milhar e a vírgula (digitar 5, 5, 5 mostra R$ 0,05, R$ 0,55, R$ 5,55; "1,234.56" em inglês) |
| Motivos de recusa | Novos códigos de campo: `invalid_amount` (formato, zero ou negativo), `above_max`, `not_allowed` (data enviada na ao vivo), `before_start` e `before_last_entry` |
| Trava | A carteira é travada (`SELECT … FOR UPDATE`) enquanto o lançamento é conferido e gravado. A exclusão da carteira usa a mesma trava, para contar os lançamentos certo; de quebra, excluir uma carteira que acabou de ser apagada por outro pedido responde 404 em vez de erro inesperado |
| Dia do lançamento | O banco recusa `data` depois do dia de `registrado_em` no fuso `America/Sao_Paulo` e antes de 04/01/2016 |
| Extrato | Mostra "X de Y lançamentos" acima do **Mostrar mais**; `offset` que não é número dá 400 |
| Confirmação | O nome da carteira vai entre aspas ("Aportar R$ 500,00 na carteira “E se em 2019”, com data de 3 de jun. de 2019?"), porque nomes com "em" ficavam confusos |

| Critério | Resultado |
|---|---|
| CA01 | ✅ `cash-ledger.test.ts`: sem lançamentos, contas feitas à mão, 0,10 + 0,20 = 0,30, o teto somado 12 vezes, a ordem do livro (dia, momento, id) e valor inválido como erro |
| CA02 | ✅ Ao vivo num sábado às 15h30 e às 23h30 de Brasília (já domingo em UTC): o dia é o de Brasília; data enviada: `not_allowed` |
| CA03 | ✅ Sem data, antes do início, sábado, Tiradentes, hoje e futuro recusados com o motivo; antes do último lançamento: `before_last_entry`; o mesmo dia do último é aceito; ano sem calendário: `calendar_not_published` |
| CA04 | ✅ `insufficient_cash` com o disponível; retirar o saldo inteiro deixa R$ 0,00; duas retiradas de R$ 600,00 ao mesmo tempo com R$ 1.000,00: uma passa e a outra é recusada (em memória e no PostgreSQL) |
| CA05 | ✅ Zero, negativo, 3 casas, "1.000,00", número fora de texto e acima do teto recusados; R$ 0,01 e R$ 10.000.000,00 aceitos |
| CA06 | ✅ Valor inicial na ao vivo (dia da criação) e na histórica (data de início); valor inválido não cria a carteira; no PostgreSQL, nome repetido não deixa o aporte gravado |
| CA07 | ✅ Nenhuma rota altera ou apaga; o gatilho recusa a alteração; excluir a carteira apaga os lançamentos e o registro conta quantos eram; excluir a conta também leva |
| CA08 | ✅ 105 lançamentos: os 100 mais recentes com o saldo depois de cada um, e o resto com `offset=100`; carteira de outro usuário: 404 com o aviso no log |
| CA09 | ✅ Exportação na versão 3, com `cashEntries` em cada carteira na ordem do livro |
| CA10 | ✅ Conferido na pré-visualização (dados simulados): saldo, Aportar e Retirar com confirmação, saldo insuficiente com o disponível, histórica (antes do último lançamento, feriado, mesmo dia), extrato e **Mostrar mais** (107 lançamentos), carteira sem dinheiro, valor inicial (inclusive inválido) em português e inglês; 480 px sem rolagem lateral, com o extrato em cartões; o foco abre no Valor, vai para o botão de confirmar e volta para Aportar ou Retirar. ⏳ Conferir na tela do Electron com o servidor de verdade |
| CA11 | ✅ Requisitos 1.9 (feito junto com a Spec); migração `20261106120000_lancamentos_caixa` sem diferença para o esquema do Prisma, desfeita e refeita no banco de teste |

Total: **805 testes** passando (com o banco real), lint, tipos e formatação.

**Para as próximas Specs:** a SPEC-014 acrescenta compra e venda à conta do caixa (`cash-ledger.ts`) e ao extrato, e usa a mesma trava da carteira.
