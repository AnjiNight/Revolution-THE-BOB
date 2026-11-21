# SPEC-015 — Estorno de lançamento

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 06/11/2026; as recomendações do §4.1 foram aceitas pelo Luís, a Spec aprovada por ele no mesmo dia e implementada (§9) |
| Fase | 3 — Núcleo da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-014 |
| Prioridade | *Must* (RF12 e RF13: a correção de um lançamento) |
| Depende de | [SPEC-013](SPEC-013.md) (aportes e retiradas), [SPEC-014](SPEC-014.md) (compras e vendas) |
| Muda | SPEC-013 (o extrato marca os estornados e ganha **Estornar**; a regra do último lançamento da histórica ignora os estornados), SPEC-014 (posições e caixa sem os estornados), SPEC-034 (estornos na exportação), `requisições.md` (versão 1.11: nova RB28) |
| Requisitos | RF12, RF13; RB05, RB06, RB08, RB09, RB10, RB25, RB26, RB28; RNF12, RNF15, RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | — (o diagrama ainda não tem o estorno, OPEN-43) |
| Drivers | FAS01, QA11 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) |

---

## 1. Objetivo

O usuário **corrige um lançamento errado** sem apagá-lo nem alterá-lo (RB08, DA09):

- o **estorno** é um registro novo, ligado ao lançamento original;
- a partir dele, as contas **ignoram o original**, como se ele não tivesse acontecido: caixa, posição e preço médio são calculados de novo (RB09);
- o original continua no extrato, **marcado como estornado**, para a história da carteira ficar completa (QA11).

## 2. Valor

- **Usuário:** desfaz um aporte com o valor errado ou uma compra do ativo errado, sem precisar criar outra carteira.
- **Sistema:** a correção passa pelo livro-razão, sem quebrar a regra de lançamento imutável.
- **Projeto:** fecha o caminho mínimo até a rentabilidade (SPEC-019).

## 3. Escopo

### 3.1 Inclui

1. **Estornar** aporte, retirada, compra e venda, nas carteiras ao vivo e histórica (§4.1).
2. **Conferência do livro** sem o lançamento estornado, em função pura do núcleo de cálculo (DA10), testada sem banco (RNF16).
3. **Extrato** com os estornados riscados e o botão **Estornar** em cada lançamento que pode ser estornado.
4. **Exportação** (SPEC-034): o momento do estorno de cada lançamento.
5. **Requisitos 1.11:** nova RB28 (§4.1).

### 3.2 Não inclui

- **Editar** um lançamento: não existe (RB08). Para corrigir, estorna e lança de novo.
- **Estornar vários de uma vez:** um por vez.
- **Motivo do estorno** (texto livre): fora (§4.1, decisão 5).
- **Compra e venda na carteira histórica:** SPEC-016. Quando ela chegar, o estorno já vale para essas negociações.

## 4. Decisões

### 4.1 Respondidas pelo Luís em 06/11/2026 (as recomendações)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que pode ser estornado** (OPEN-14) | **Aporte, retirada, compra e venda**, nas duas carteiras. Cada lançamento só pode ser estornado **uma vez**, e o estorno **não pode ser estornado**: para refazer, lança de novo | Cobre qualquer erro de digitação. Estorno de estorno só complicaria a conta e a tela |
| 2 | **O que o estorno faz** (OPEN-14) | **Anula** o lançamento: as contas passam a ignorar o original, como se ele nunca tivesse acontecido, e o caixa, a posição e o **preço médio** saem de novo. O original continua no extrato, riscado, com "Estornado em 06/11/2026, 14:32" | A outra saída, um lançamento contrário no fim do livro, não conserta o preço médio: estornar uma compra viraria uma venda, e a venda não muda o preço médio (RB10) |
| 3 | **Lançamentos posteriores** (OPEN-14) | O estorno só é aceito se o livro **sem o original** continuar válido **em todos os momentos**: o caixa nunca fica negativo (RB05, RB26) e nenhuma venda passa da posição (RB06). Se ficar, o estorno é recusado e a tela diz qual lançamento quebraria: "Esse estorno deixaria o caixa negativo na compra de 100 PETR4 de 06/11. Estorne essa compra antes." | Nenhum lançamento aceito fica inválido depois. A alternativa de estornar só o último lançamento é mais simples, mas obriga a desfazer tudo o que veio depois |
| 4 | **Prazo na carteira ao vivo** (OPEN-14) | Compra e venda só podem ser estornadas **no mesmo dia** em que foram feitas (dia de Brasília). Aporte e retirada, a qualquer momento. Na carteira **histórica**, sem prazo | Sem prazo, daria para desfazer uma compra ruim depois de ver o preço cair, e o resultado da carteira ao vivo deixaria de ser honesto (DA17). Na histórica, os dados já são conhecidos, e a tela já avisa |
| 5 | **Motivo** | Sem campo de motivo. O extrato mostra **quando** o lançamento foi estornado | Menos um texto livre para guardar e exportar (DA13); o "quando" já basta para conferir |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Nova RB28** | "O estorno anula um lançamento: as contas passam a ignorá-lo, e o original fica registrado como estornado. Só é aceito se, sem o original, o caixa nunca ficar negativo e nenhuma venda passar da posição. Na carteira ao vivo, compra e venda só podem ser estornadas no dia em que foram feitas. Estorno não se estorna" | As regras do §4.1 nos requisitos |
| **Conferência do livro** | Função pura no núcleo de cálculo: percorre os lançamentos que valem, na ordem do livro, e devolve o primeiro que quebra: caixa negativo ou venda maior que a posição. Usada no estorno; os testes mostram que o livro de hoje sempre passa | DA10 e RNF16 |
| **RB25 na histórica** | O "último lançamento", para a data de um lançamento novo, passa a ser o último **que vale**: estornado não conta | Sem isso, um lançamento estornado travaria as datas para sempre |
| **Dois pedidos ao mesmo tempo** | A mesma **trava da carteira** das SPECs 013 e 014 | Um estorno e uma compra juntos não deixam o caixa negativo |
| **Auditoria (RNF15)** | O estorno guarda o lançamento original e o momento; o banco **recusa alteração** (gatilho). Apagar só acontece junto com a carteira ou com a conta | DA09 |
| **Confirmação** | "Estornar a compra de 100 PETR4 a R$ 31,20 de 06/11/2026, 14:32? Ela continua no extrato, riscada, e deixa de contar no caixa e nas posições. Não dá para desfazer o estorno." | Como nas SPECs 013 e 014 |
| **Botão Estornar** | Em cada linha do extrato que pode ser estornada agora (o servidor diz qual: não estornada e, na ao vivo, compra e venda do dia). A conferência dos lançamentos posteriores só acontece ao confirmar | A tela não oferece o que o servidor vai recusar pelo prazo |
| **Extrato** | O estornado aparece riscado, com "Estornado em {data, hora}" e sem "saldo depois"; os outros mostram o saldo **sem** os estornados. O saldo do topo e o "X de Y lançamentos" também | O saldo de cada linha é o de verdade |
| **Exportação (SPEC-034)** | Cada aporte, retirada, compra e venda ganha `reversedAt` (momento do estorno ou `null`). `version` passa a **5** | Cada Spec entrega a sua parte |
| **Exclusão** | `exclusao_carteira.lancamentos` conta também os estornos | Mesmo registro, sem dado pessoal |
| Onde fica | Módulo **Carteiras**; a conferência no núcleo de cálculo | Arquitetura §6, DA10 |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Aporte de R$ 5.000,00 digitado no lugar de R$ 500,00, nada depois | Estorno aceito; caixa R$ 0,00; o aporte aparece riscado. O usuário lança R$ 500,00 |
| Aporte de R$ 5.000,00 e depois compra de R$ 3.120,00; estornar o aporte | Recusado: o caixa ficaria negativo na compra. Estornando a compra antes (no mesmo dia), o aporte pode ser estornado |
| Compras de 100 PETR4 a R$ 10,00 e de 100 a R$ 20,00 (errada); estornar a segunda | Posição 100, preço médio volta para R$ 10,00 (com um lançamento contrário, ficaria R$ 15,00) |
| Compra de 100 PETR4 e venda de 60; estornar a compra | Recusado: a venda passaria da posição. Estornando a venda antes, a compra pode ser estornada |
| Carteira ao vivo: compra de ontem | Sem **Estornar**; pela rota, `reversal_window_closed`. O caminho é vender, com o preço de agora |
| Estornar o mesmo lançamento de novo | `already_reversed` |
| Histórica: o último lançamento (10/03/2019) foi estornado; o anterior é de 01/02/2019 | Um aporte em 15/02/2019 é aceito |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `POST /api/portfolios/:id/reversals` (nova) | Usuário dono | `entryId` (aporte, retirada, compra ou venda da carteira) | 201 com `reversal` (`entryId`, `type` do original, `reversedAt`) e o novo `cash` | 404 `entry_not_found` (também de outra carteira); 409 `already_reversed`, `reversal_window_closed`, `reversal_breaks_cash` e `reversal_breaks_position` (com `details`: o lançamento que quebraria, o tipo, a data e, na posição, o ticker); 404 `portfolio_not_found`; 401; 403 |
| `GET /api/portfolios/:id/cash` (SPECs 013 e 014, muda) | Usuário dono | — | Cada lançamento ganha `reversedAt` (ou `null`) e `reversible`; o estornado vem com `balanceAfter: null`; o saldo e os outros `balanceAfter` não contam os estornados | Os de antes |
| `GET /api/portfolios/:id/positions` e `trade-quote` (SPEC-014, mudam) | Usuário dono | — | Sem as negociações estornadas | Os de antes |

Nenhuma rota altera ou apaga um lançamento ou um estorno (RB08).

### 5.2 Telas

| Situação | Tela |
|---|---|
| Extrato | Em cada lançamento que pode ser estornado agora, o botão **Estornar** (com o rótulo completo para o leitor de tela: "Estornar a compra de 100 PETR4 de 06/11"). O estornado aparece riscado, com "Estornado em 06/11/2026, 14:32" |
| Estornar | Confirmação do §4.2 no lugar da linha; o foco vai para **Confirmar estorno**; Esc cancela e o foco volta ao **Estornar** |
| Depois | "Lançamento estornado." e o caixa, o extrato e as posições recalculados; o foco vai para o aviso |
| Recusado | A mensagem com o lançamento que quebraria, na própria confirmação |
| 480 px | O botão fica no cartão do lançamento |

Português e inglês; tudo pelo teclado; o riscado também vem escrito ("Estornado"), nunca só pela aparência (RNF18).

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `estorno` (nova) | `id`, `carteira_id`, `lancamento_caixa_id`, `transacao_id`, `registrado_em` | Exatamente um dos dois lançamentos preenchido; cada um **único** (um lançamento só se estorna uma vez); todas as chaves apontam para a mesma carteira e **apagam em cascata** (só com a carteira ou a conta); **alteração recusada por gatilho** (RB08) |

O lançamento não ganha coluna: "estornado" é ter um estorno ligado a ele. A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Conferência do livro em função pura (sem banco): devolve o primeiro lançamento que deixa o caixa negativo ou vende mais que a posição; casos do §4.3 calculados à mão |
| CA02 | Estorno de aporte, retirada, compra e venda; caixa, posição e preço médio calculados sem o original (o exemplo do preço médio do §4.3) |
| CA03 | Recusas: `already_reversed`; `reversal_breaks_cash` e `reversal_breaks_position` com o lançamento que quebraria; nada é gravado |
| CA04 | Ao vivo: compra e venda só no dia (relógio fixo nos testes); aporte e retirada a qualquer momento; histórica sem prazo |
| CA05 | Histórica: a data de um lançamento novo ignora os estornados (RB25) |
| CA06 | Um estorno e uma compra ao mesmo tempo nunca deixam o caixa negativo (teste com o banco) |
| CA07 | O estorno nunca é alterado: não há rota, e o banco recusa; um lançamento não aceita dois estornos (banco); apagar a carteira ou a conta apaga os estornos, e o registro de exclusão os conta |
| CA08 | Extrato com `reversedAt`, `reversible` e o saldo sem os estornados; posições sem as negociações estornadas; carteira de outro usuário: 404 com o aviso no log; colaborador: 403 |
| CA09 | Exportação com `reversedAt` em cada lançamento, `version` 5 |
| CA10 | Telas: Estornar, confirmação, recusa com o motivo, estornado riscado e escrito; português e inglês; teclado e foco; 480 px; contraste (RNF04, RNF18, RNF20) |
| CA11 | `requisições.md` 1.11 (RB28); a tabela existe com as restrições do §6; a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-14 | ✅ Decisões 1 a 4 (§4.1): os quatro tipos, uma vez só; o estorno anula; aceito só se o livro sem o original continuar válido; compra e venda da ao vivo só no mesmo dia |
| OPEN-43 | ⏳ O diagrama de casos de uso continua sem o estorno, o aporte e a carteira histórica |

## 9. Verificação (06/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Detalhe da recusa | `reversal_breaks_cash` e `reversal_breaks_position` trazem em `details` o lançamento que quebraria: `entryId`, `type`, `date`, `amount` e, na negociação, `ticker` e `quantity`. A tela monta a mensagem combinada ("Esse estorno deixaria o caixa negativo na compra de 100 PETR4 de 06/11. Estorne essa compra antes.") |
| Mesma carteira | Além do serviço, um gatilho do banco confere que o lançamento estornado é da mesma carteira do estorno |
| Extrato | Ganhou a coluna das ações (o botão **Estornar**). Enquanto uma confirmação está aberta, os outros botões ficam desativados, e o foco volta ao **Estornar** que a abriu quando ela fecha. Depois de uma recusa, o foco volta ao **Confirmar estorno** (que fica desativado enquanto espera o servidor) |
| Cartão em 480 px | O tipo, o detalhe da negociação e o "Estornado em…" ficam num bloco só, à direita do rótulo |
| Contas | Uma função só (`activeLedger`) tira os estornados do livro antes de qualquer conta: caixa, extrato, posições, a cotação para negociar e o "último lançamento" da carteira histórica |

| Critério | Resultado |
|---|---|
| CA01 | ✅ `positions.test.ts`: livro válido; sem o aporte, a compra deixaria o caixa negativo; sem a compra, a venda passaria da posição; o caixa pode chegar a zero, mas não abaixo |
| CA02 | ✅ Estorno de aporte (caixa R$ 0,00 e o aporte riscado no extrato) e de compra (o preço médio volta de R$ 15,00 para R$ 10,00, o exemplo do §4.3) |
| CA03 | ✅ `already_reversed`; `reversal_breaks_cash` e `reversal_breaks_position` com o lançamento que quebraria, sem gravar nada; estornando antes o que quebra, o estorno passa; lançamento de outra carteira: `entry_not_found` |
| CA04 | ✅ Ao vivo: a compra de sexta não se estorna na segunda (`reversal_window_closed`, e o extrato já diz que não dá); o aporte, sim. Histórica: sem prazo |
| CA05 | ✅ Histórica: com o último lançamento (11/03/2019) estornado, um aporte em 15/02/2019 é aceito |
| CA06 | ✅ Um estorno do aporte e uma compra ao mesmo tempo: um passa e o outro é recusado; o caixa nunca fica negativo |
| CA07 | ✅ No PostgreSQL: o gatilho recusa alterar o estorno; o mesmo lançamento não aceita dois estornos; lançamento de outra carteira e estorno sem lançamento são recusados; excluir a carteira apaga os estornos e o registro os conta; excluir a conta também leva |
| CA08 | ✅ Extrato com `reversedAt`, `reversible` e `balanceAfter: null` no estornado; posições sem as negociações estornadas; carteira de outro: 404 com o aviso no log; colaborador: 403; sem sessão: 401 |
| CA09 | ✅ Exportação na versão 5, com `reversedAt` em cada aporte, retirada, compra e venda |
| CA10 | ✅ Conferido na pré-visualização (dados simulados): **Estornar** com o rótulo completo para o leitor de tela, confirmação com o foco no botão, recusa com a mensagem do lançamento que quebraria, Esc com o foco de volta, estornado riscado e escrito, caixa e posições recalculados, foco no aviso "Lançamento estornado."; português e inglês; 480 px sem rolagem lateral. ⏳ Conferir no Electron |
| CA11 | ✅ Requisitos 1.11 (RB28); migração `20261106220000_estornos` sem diferença para o esquema do Prisma, desfeita e refeita no banco de teste; aplicada no banco de desenvolvimento |

Total: **854 testes** passando (com o banco real), lint, tipos e formatação.

**Para as próximas Specs:** a SPEC-016 (compra e venda na histórica) já nasce com o estorno; a SPEC-019 (rentabilidade) e a SPEC-043 (proventos) calculam sobre `activeLedger`.
