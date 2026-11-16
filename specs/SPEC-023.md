# SPEC-023 — Salvar e recuperar simulações: nova carteira a partir de outra

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 16/11/2026, a pedido do Luís; aprovada por ele no mesmo dia, como escrita ("Aprovo, pode implementar"), e implementada (§9) |
| Fase | 5 — Acompanhamento da carteira ([mapa de specs](mapa_specs.md)), a última, depois da SPEC-022 |
| Prioridade | Should (RF20) |
| Depende de | [SPEC-012](SPEC-012.md) (carteiras), [SPEC-013](SPEC-013.md) (aportes e retiradas), [SPEC-014](SPEC-014.md) e [SPEC-016](SPEC-016.md) (compras e vendas nos dois tipos), [SPEC-015](SPEC-015.md) (estornos: a cópia leva o livro sem os estornados), [SPEC-022](SPEC-022.md) (o atalho "Comparar as duas") |
| Muda | `requisições.md` (versão 1.12: RF20 reescrito), `modelo_dominio.md` (CARTEIRA ganha `origem_id`; nota na SIMULACAO), SPEC-034 (campo `copiedFrom` na seção `portfolios`, versão 7), lista de carteiras e tela da carteira (botão **Copiar**), nova rota |
| Requisitos | RF20; RB02, RB03, RB08, RB24, RB25, RB26, RB28; RNF04, RNF11, RNF15, RNF17, RNF18, RNF20 |
| Casos de uso | Criar carteira (SPEC-012); P01 ("altera a distribuição dos investimentos e compara"); P02 passos 6, 7 e 9 e o cenário de uso (Cenário A e Cenário B); "Consultar histórico de simulações" (tabela das personas) |
| Drivers | OBJ02, QA13 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md) (a cópia é um livro-razão novo, só incluído), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) (mesmo tipo e mesmo início) |

---

## 1. Objetivo

O usuário cria uma carteira **a partir de outra** que já tem: **mesmo tipo e mesmo início**, com um nome próprio e, à escolha, com **tudo** (aportes, retiradas, compras e vendas) ou **só o dinheiro** (aportes e retiradas), até hoje ou, na histórica, até uma data. A cópia nasce **independente**: o que o usuário fizer nela não muda a original, e vice-versa.

É o "altera a distribuição dos investimentos e compara os resultados das duas simulações" da P01 e o "cria duas simulações: o Cenário A mantém a composição original; o Cenário B reduz petróleo e aumenta FIIs" da P02.

Também é o que sobra do RF20 ("salvar e recuperar simulações anteriores"): com cenário = carteira (SPEC-022), **salvar** uma simulação é ter a carteira na lista e **recuperar** é abri-la, o que a SPEC-012 já faz. O que faltava era montar o cenário B sem redigitar o A.

## 2. Valor

- **Usuário (P01):** testa outra distribuição com o mesmo dinheiro, nas mesmas datas, sem redigitar os aportes.
- **Usuário (P02):** cria o cenário B igual ao A até hoje (ou até uma data), muda só o que quer testar e compara as duas (SPEC-022).
- **Projeto:** fecha a OPEN-22 (a parte do RF20), e o RF20 passa a dizer o que o app faz.

## 3. Escopo

### 3.1 Inclui

1. Botão **Copiar** em cada carteira da lista (ao lado de Renomear e Excluir) e **Copiar carteira** na tela da carteira.
2. Formulário **Nova carteira a partir de «{nome}»**: nome (sugerido "{nome} (cópia)"), **o que copiar** (tudo ou só o dinheiro) e, na histórica, **Copiar até** (opcional).
3. A cópia: mesmo tipo e mesmo início; os lançamentos copiados mantêm a data, o horário, o valor, a quantidade, o preço e a cotação usada; **sem** os lançamentos estornados e sem os estornos.
4. Na tela da cópia, **"Criada em {data} a partir de «{nome}»"**, com o link para a original, e o atalho **Comparar as duas** (SPEC-022).
5. Exportação (SPEC-034): `copiedFrom` na seção `portfolios`.
6. `requisições.md` 1.12 (RF20 reescrito) e `modelo_dominio.md`.

### 3.2 Não inclui

- **Mudar o tipo ou o início na cópia** (RB24): "a mesma carteira começando em outra data" é outra carteira, com outros preços; copiar é repetir a mesma simulação.
- **Copiar os estornos e os lançamentos estornados**: a cópia nasce com o livro limpo (o que vale hoje).
- **Copiar parte dos ativos** ("só as ações"): quem quer isso copia tudo e vende o resto.
- **Manter a cópia ligada à original** (sincronizar lançamentos): a ligação é só informativa.
- **Modelos de carteira** ("carteira padrão da plataforma"): nada na Visão pede.
- **Carteira de outro usuário** (RB03) e **projeção para o futuro** (a SIMULACAO do modelo fica com a SPEC-031, como decidido na SPEC-022).

## 4. Decisões

### 4.1 Recomendações para o Luís aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que a SPEC-023 vira** (OPEN-22, a parte do RF20) | **"Nova carteira a partir de outra"**, e o **RF20 é reescrito** na versão 1.12 dos requisitos: "Criar uma carteira a partir de outra, com o mesmo tipo e o mesmo início, copiando os aportes e retiradas ou todos os lançamentos (na histórica, até uma data), para montar e comparar cenários; cada carteira fica salva e é reaberta pela lista (RF11)". A alternativa é marcar a Spec como coberta pela SPEC-012 e não fazer nada | "Salvar e recuperar" já existe desde a SPEC-012. Sem esta Spec, a P01 e a P02 redigitam cada aporte e cada compra para montar o cenário B; com 6 compras já cansa, e com uma histórica de anos é inviável |
| 2 | **O que copiar** | Dois cartões no formulário, como os do tipo. **Tudo** (padrão): aportes, retiradas, compras e vendas, com as mesmas datas e os mesmos preços; a cópia fica igual à original até hoje, e o usuário muda a partir daí. **Só o dinheiro**: aportes e retiradas nas mesmas datas, sem as compras e vendas; o usuário monta outra distribuição com o mesmo dinheiro. Nos dois, sem os estornados | "Tudo" é o Cenário B da P02 ("reduz petróleo": vende um pouco de PETR4 e compra FIIs). "Só o dinheiro" é a P01 ("altera a distribuição"). Os proventos e eventos (SPEC-043) são calculados a partir das compras, então vêm sozinhos com "tudo" |
| 3 | **Copiar até uma data** (só na histórica) | Campo opcional **Copiar até**: entram só os lançamentos até esse dia, inclusive. O próximo lançamento da cópia segue a RB25 a partir do último copiado. Na carteira **ao vivo** não há o campo: a cópia vai até agora | Na histórica, a P02 quer "a partir de março, vendo petróleo": sem a data, a cópia vai até o último lançamento e o cenário B só pode divergir depois dele (RB25). Na ao vivo, cada lançamento é do momento em que foi feito (DA17): cortar no passado daria uma carteira parada no meio, e o que o usuário fizer nela é sempre de hoje |
| 4 | **Ligação com a original** | A cópia guarda **de qual carteira nasceu** (`origem_id`). A tela dela mostra "Criada em 16/11/2026 a partir de «Cenário A»", com o link; se a original foi excluída, "a partir de uma carteira já excluída". O arquivo "Baixar meus dados" ganha `copiedFrom`. Pode cair, se preferir: o resto da Spec não depende disso | É o "consultar histórico de simulações" da tabela das personas (P02). E mantém a honestidade da DA17: numa cópia de carteira ao vivo, o passado antes da data da cópia é o da original, e a tela diz isso. Custa uma coluna |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Rota** | `POST /api/portfolios/:id/copies`, com `name`, `scope` (`all` ou `cash`) e, na histórica, `until` opcional (§5.1). Responde 201 com a carteira nova e `copied` (quantos aportes e retiradas e quantas negociações entraram) | A cópia é uma carteira nova criada "a partir de" outra: a rota fica embaixo da original, e o resto da API de carteiras não muda |
| **Numa transação só** | O servidor **trava a original** (como na exclusão), confere o limite de 20 dentro da trava, cria a carteira (tipo e início da original, `origem_id`) e insere os lançamentos copiados. Se algo falhar (nome repetido, limite), **nada fica** | A foto do livro é de um instante só: um lançamento chegando na original ao mesmo tempo entra antes ou não entra. E o limite deixa de ter a corrida anotada na SPEC-012 §9, ao menos aqui |
| **O que cada lançamento copiado mantém** | Aporte e retirada: tipo, valor, data e **horário de registro**. Compra e venda: ativo, tipo, quantidade, preço, total, data, horário de registro e, na ao vivo, horário, nível e fonte da cotação. Só o id e a carteira são novos. Os **estornados e os estornos ficam de fora** | O banco exige que a data case com o horário de registro (na ao vivo, o mesmo dia; na histórica, antes dele): registrar "agora" uma compra de ontem seria recusado. E a ordem do livro é por data, horário e id: manter o horário mantém a ordem de duas negociações do mesmo dia |
| **"Só o dinheiro" que deixaria o caixa negativo** | Antes de gravar, o servidor refaz o caixa só com os aportes e retiradas copiados. Se uma retirada ficar sem saldo (na original, o dinheiro veio de uma venda ou de um provento), responde 409 `copy_breaks_cash`, com a data e o valor dela; a tela sugere copiar tudo ou copiar só até antes dela | A cópia nasce com o livro válido (RB26), como qualquer carteira. Sem as vendas, uma retirada do lucro não tem de onde sair |
| **A cópia depois de criada** | É uma carteira comum (SPEC-012): renomeia, exclui, aporta, compra, vende e estorna pelas regras de sempre. Na ao vivo, os lançamentos novos são de agora; os copiados de dias anteriores não se estornam (RB28), os de hoje sim. Na histórica, o próximo lançamento é no dia do último copiado ou depois (RB25) e antes de hoje. As posições, o preço médio, o caixa, a rentabilidade, os proventos e as frações de uma cópia com "tudo" são **iguais aos da original no momento da cópia**, porque saem do mesmo livro e dos mesmos dados de mercado | Nenhuma regra nova de lançamento; a independência vem do livro próprio (DA09) |
| **Nome sugerido** | "{nome} (cópia)"; se já existe, "(cópia 2)", "(cópia 3)"…, com o nome da original cortado para caber em 60 caracteres. O usuário muda à vontade; o servidor só confere a unicidade (SPEC-012) | Não trava quem copia duas vezes |
| **Formulário** | Título "Nova carteira a partir de «{nome}»". Linha fixa com o tipo e o início ("Simulação histórica · desde 02/01/2025"), com a dica "A cópia tem o mesmo tipo e o mesmo início da original". Campo **Nome**, com o sugerido. **O que copiar**, em dois cartões: **Tudo** ("aportes, retiradas, compras e vendas, até hoje: mude só o que quiser testar") e **Só o dinheiro** ("aportes e retiradas nas mesmas datas: monte outra distribuição com o mesmo dinheiro"). Na histórica, **Copiar até (opcional)**, com a dica "Entram só os lançamentos até esse dia. Vazio: todos". Botões **Criar cópia** e **Cancelar**. Na lista, abre no lugar do formulário de "Nova carteira"; na tela da carteira, acima do caixa | O mesmo padrão do formulário da SPEC-012; os cartões explicam a escolha para quem está começando (QA13) |
| **Depois de criar** | A cópia abre, com o aviso "Criada a partir de «{nome}»: {n} aportes e retiradas e {m} negociações copiados" e o botão **Comparar as duas**, que abre a Comparação (SPEC-022) com a original e a cópia. O foco vai para o título da cópia | É o passo seguinte das duas personas |
| **Cabeçalho da cópia** | Abaixo de "desde {data}": "Criada em {data} a partir de «{nome}»", com o nome como link para a original; se ela já foi excluída, "a partir de uma carteira já excluída" (decisão 4) | Quem abre a cópia meses depois sabe de onde ela veio |
| **Exclusões** | Excluir a original não mexe na cópia (fica só a frase da decisão 4). Excluir a cópia grava o registro da SPEC-012, contando os lançamentos dela. Excluir a conta leva tudo (DA13) | A cópia é uma carteira como as outras |
| **Exportação (SPEC-034)** | Cada carteira ganha `copiedFrom`: `{ id, name }` da original (`name` nulo se ela foi excluída) ou `null`. `version` passa a **7**. Os lançamentos copiados saem como os outros, com o horário original | O arquivo diz de onde cada carteira veio |
| **Erros** | Original de outro usuário ou inexistente: 404 `portfolio_not_found`, com a tentativa no log (SPEC-012). `name`: as regras da SPEC-012 (`required`, `too_long`, `portfolio_name_in_use`). `scope` ausente ou fora de `all`/`cash`: `validation_error`. `until`: `invalid` (formato), `not_allowed` (carteira ao vivo), `before_start` (antes do início), `future` (hoje ou depois). 21ª carteira: `portfolio_limit_reached`. Colaborador: 403 | Os mesmos códigos das outras rotas de carteira |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| P01: "Primeira" (histórica, desde 02/01/2025): aporte de R$ 5.000,00 em 02/01/2025 e compras de PETR4, VALE3 e MXRF11 no mesmo dia. Copiar com **Só o dinheiro** | "Primeira (cópia)", histórica desde 02/01/2025, com o aporte de R$ 5.000,00 em 02/01/2025 e o caixa em R$ 5.000,00, sem posições. Ele compra outra divisão em 02/01/2025 e compara as duas |
| P02: "Cenário A" (ao vivo, desde 03/11/2026) com 2 aportes e 6 compras. Copiar com **Tudo** em 16/11/2026, nome "Cenário B" | "Cenário B", ao vivo desde 03/11/2026, com os mesmos 2 aportes e 6 compras, nas mesmas datas, horários e preços; o caixa, as posições e o preço médio iguais aos de A agora. Em B, ela vende parte de PETR4 e compra HGLG11 hoje. Na Comparação, "Em comum" vai desde 03/11/2026; as linhas se separam a partir de hoje |
| "E se 2024" (histórica, desde 02/01/2024) com lançamentos até 10/11/2026. Copiar com **Tudo** e **Copiar até** 28/02/2025 | A cópia tem só os lançamentos até 28/02/2025. O próximo lançamento dela tem que ser em 28/02/2025 ou depois (RB25) e antes de hoje |
| Original com um aporte estornado e uma compra estornada | A cópia não tem nem os dois nem os estornos; os outros lançamentos entram |
| Original ao vivo com uma compra feita hoje, copiada hoje | Na cópia, a compra copiada é de hoje e pode ser estornada hoje (RB28); as de ontem, não |
| Original: aporte de R$ 1.000,00; compra de R$ 900,00; venda por R$ 1.500,00; retirada de R$ 1.500,00. Copiar com **Só o dinheiro** | 409 `copy_breaks_cash` (a retirada de R$ 1.500,00 em {data} ficaria sem saldo). A tela sugere "Tudo" ou "Copiar até" antes dela |
| **Copiar até** numa carteira ao vivo | `validation_error`, `until: not_allowed` |
| **Copiar até** 30/12/2024 numa histórica desde 02/01/2025 | `validation_error`, `until: before_start` |
| Usuário com 20 carteiras | `portfolio_limit_reached`; o botão Copiar fica desativado na lista, como "Nova carteira" |
| Nome "Cenário B" já existe | `portfolio_name_in_use`; o sugerido teria sido "Cenário A (cópia)" |
| A original é excluída depois | A cópia continua, com "a partir de uma carteira já excluída" |
| Copiar a carteira de outro usuário (pelo id) | 404 `portfolio_not_found`, e a tentativa no log |

### 4.4 Conferido em 16/11/2026

| Pergunta | Resposta |
|---|---|
| O que as personas pedem | P01: "altera a distribuição dos investimentos e compara os resultados das duas simulações". P02 (comportamento, passos 6, 7 e 9): "criar uma nova simulação", "alterar pesos ou ativos", "salvar a simulação para análise posterior"; no cenário de uso, "cria duas simulações": A mantém a composição, B reduz petróleo e aumenta FIIs. Na tabela das personas, "Gerar cenários de simulação" (P01 e P02) e "Consultar histórico de simulações" (P02) |
| O que o RF20 e o modelo dizem | RF20: "Salvar e recuperar simulações anteriores" (Should). A SIMULACAO do modelo de domínio é "projeção gerada a partir de uma carteira" (`gerada_em`, `horizonte`): é a dos cenários por sentimento (SPEC-031), como decidido na SPEC-022 |
| Caso de uso | O modelo de casos de uso (imagem) não tem um caso para o RF20; o mapa já ligou isso à OPEN-22 |
| O que o banco exige dos lançamentos | `lancamento_caixa`: a data é de 04/01/2016 em diante e **não passa do dia do registro**. `transacao`: na ao vivo, a data **é o dia do registro e o da cotação**; na histórica, a data é **anterior ao dia do registro**. Ou seja: copiar um lançamento registrando "agora" seria recusado na ao vivo; a cópia tem que manter o horário original |
| Como o livro ordena | Por data, horário de registro e id (`compareMovements`): mantendo o horário, duas negociações do mesmo dia ficam na mesma ordem da original |
| O que a cópia de "só o dinheiro" pode quebrar | Uma retirada que na original saiu do dinheiro de uma venda ou de um provento (RB26); por isso a conferência antes de gravar |
| Tamanho | O livro de uma histórica com uma negociação por pregão desde 2016 tem uns 2.700 lançamentos: uma inserção em lote por tabela, numa transação |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Muda | Detalhes |
|---|---|---|---|
| `POST /api/portfolios/:id/copies` | Usuário dono da original | Nova | Corpo: `name`, `scope` (`all` ou `cash`), `until` (dia, opcional, só na histórica). Sucesso: 201 com `portfolio` (a cópia, com `copiedFrom`) e `copied` (`cashEntries`, `trades`). Erros do §4.2: 400 `validation_error`; 404 `portfolio_not_found`; 409 `portfolio_name_in_use`, `portfolio_limit_reached`, `copy_breaks_cash` (com `details.date` e `details.amount`); 401; 403 |
| `GET /api/portfolios` e `GET /api/portfolios/:id` (SPEC-012) | Usuário | Muda | Cada carteira ganha `copiedFrom`: `{ id, name }` (`name` nulo se a original foi excluída) ou `null` |

### 5.2 Telas

| Situação | Tela |
|---|---|
| Lista | Em cada carteira, **Copiar** ao lado de Renomear e Excluir (desativado com 20 carteiras). Durante a escolha para comparar (SPEC-022), some como os outros |
| Tela da carteira | Botão **Copiar carteira** no cabeçalho, ao lado do rótulo do tipo |
| Formulário | O do §4.2: tipo e início fixos, Nome sugerido, os dois cartões, Copiar até (só na histórica), Criar cópia e Cancelar; os erros embaixo do campo (`until`) ou do formulário (`copy_breaks_cash`, com a data e o valor da retirada) |
| Cópia criada | A cópia abre com o aviso e **Comparar as duas**; o foco no título |
| Cabeçalho da cópia | "Criada em {data} a partir de «{nome}»" (link) ou "… a partir de uma carteira já excluída" |
| 480 px | Os cartões um embaixo do outro; o resto como na SPEC-012 |

Em português e em inglês, pelo teclado, a 480 px e com contraste (RNF04, RNF18, RNF20).

## 6. Modelo de dados

| Tabela | Mudança | Restrições |
|---|---|---|
| `carteira` | Nova coluna `origem_id` (uuid, nula) | **Sem chave estrangeira**, como `exclusao_carteira.carteira_id`: a cópia continua sabendo que é cópia depois que a original é excluída, e o id sozinho não é dado pessoal (DA13). Preenchida só na criação; a rota de renomear não a aceita |
| `lancamento_caixa`, `transacao` | Nenhuma | As linhas copiadas passam pelas restrições de sempre (data × horário de registro, imutáveis por gatilho) |

A migração `20261116120000_carteira_origem` tem `down.sql` (RNF17). No `modelo_dominio.md`, CARTEIRA ganha `origem_id` ("carteira de que esta foi copiada, se foi") e o auto-relacionamento CARTEIRA 0..1 : N CARTEIRA "origina cópia"; a SIMULACAO ganha a nota de que é a projeção da SPEC-031.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | **Tudo:** a cópia tem o mesmo tipo e início; os aportes, retiradas, compras e vendas ativos entram com data, horário, valor, quantidade, preço, total, horário, nível e fonte da cotação iguais; os estornados e os estornos ficam de fora; o caixa, as posições, o preço médio, a rentabilidade, os proventos e as frações da cópia são iguais aos da original, nos dois tipos de carteira |
| CA02 | **Só o dinheiro:** só aportes e retiradas; o caixa é a diferença deles; sem posições. Quando uma retirada ficaria sem saldo, 409 `copy_breaks_cash` com a data e o valor, e nada é gravado |
| CA03 | **Copiar até** (histórica): só os lançamentos até o dia, inclusive; o próximo lançamento respeita a RB25 a partir do último copiado; na ao vivo, `not_allowed`; antes do início e hoje ou depois recusados com o motivo |
| CA04 | Transação única com a original travada: com nome repetido ou 21ª carteira, nenhuma linha fica; o nome é único por usuário (SPEC-012) |
| CA05 | Original de outro usuário ou inexistente: 404 e a tentativa no log; colaborador: 403; sem sessão: 401 |
| CA06 | Independência: lançamento, estorno e exclusão numa carteira não mudam a outra; excluir a original deixa a cópia com `copiedFrom.name` nulo; a exportação traz `copiedFrom` e `version` 7; excluir a conta leva as duas |
| CA07 | Na cópia, os lançamentos novos seguem as regras de sempre: ao vivo, de agora e com o estorno de compra e venda só no mesmo dia (RB28); histórica, no dia do último copiado ou depois (RB25) |
| CA08 | Telas: Copiar na lista e na carteira; o formulário com o nome sugerido único, os dois cartões, Copiar até e os erros; a cópia aberta com o aviso, Comparar as duas e o cabeçalho "Criada em … a partir de"; em português e inglês; pelo teclado; a 480 px; com contraste |
| CA09 | `requisições.md` 1.12 (RF20), `modelo_dominio.md` (`origem_id` e a nota da SIMULACAO), SPEC-034 (`copiedFrom`) e o mapa (OPEN-22 resolvida) atualizados |
| CA10 | Migração com `down.sql`, desfeita e refeita (RNF17). Copiar uma carteira com uns 2.700 lançamentos leva menos de 2 s, medido com o banco |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-22 | ✅ **Resolvida** (decisão 1 do §4.1, aprovada em 16/11/2026): a parte do RF20 virou "Nova carteira a partir de outra", com o RF20 reescrito na versão 1.12 dos requisitos; a SIMULACAO do modelo fica com a SPEC-031 |
| SPEC-012 §9 | O limite de 20 não era atômico na criação; aqui a contagem fica dentro da trava. A rota de criar (SPEC-012) pode ganhar o mesmo cuidado depois, se quiserem |

## 9. Verificação (16/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | `PortfolioService.copy` decide o que entra (livro sem os estornados, `until`, a conferência do caixa com "só o dinheiro") e o repositório grava: `PrismaPortfolioRepository.copyLocked` trava a original, conta as carteiras do dono, lê o livro, cria a carteira com `origem_id` e insere os lançamentos em lote, numa transação só. `namesOf` resolve o nome da original para `copiedFrom` na lista, na carteira, na cópia recém-criada e na exportação |
| Validação compartilhada | `validateNewPortfolioCopy` (nome, `scope`, formato de `until`) e `suggestCopyName` (o "(cópia)" numerado, cabendo em 60 caracteres), com testes de unidade; o sufixo vem da tradução ("cópia" / "copy") |
| Nome da original na tela | As aspas ficam na tradução («…» em português, "…" em inglês) |
| Pré-visualização | A pasta `app/.previa` (mock do `window.api`, fora do Git) serve só para olhar as telas; nada dela entra no app |

| Critério | Resultado |
|---|---|
| CA01 | ✅ `copy-routes.test.ts`: cópia com "tudo" da histórica (1 aporte e 3 negociações; o aporte estornado e o estorno ficam de fora), com o extrato igual ao da original linha a linha (tipo, valor, data, horário, negociação e saldo depois), ids novos e as posições iguais; na ao vivo, a negociação copiada mantém o dia, o horário e a cotação usada, e as posições são iguais às da original. Com o banco: `prisma-portfolio.db.test.ts` confere dono, tipo, início, `origem_id` e os lançamentos iguais com ids novos |
| CA02 | ✅ "Só o dinheiro": só o aporte, caixa R$ 10.000,00, sem posições. A retirada do lucro de uma venda (R$ 1.020,00 em 20/05/2019): 409 `copy_breaks_cash` com `details.date` e `details.amount`, nenhuma carteira a mais; a mesma carteira copia com "tudo" |
| CA03 | ✅ `until` 15/03/2019 copia 1 aporte e 2 negociações, `lastEntryDate` 15/03/2019, aporte em 13/03/2019 recusado (`before_last_entry`) e em 15/03/2019 aceito; na ao vivo `not_allowed`; antes do início `before_start`; hoje e depois `future`; "15/03/2019" `invalid_date`; vazio é o mesmo que não mandar; a original não muda |
| CA04 | ✅ Nome repetido (sem maiúsculas) 409 e nada gravado; da 2ª à 20ª cópia 201 e a 21ª `portfolio_limit_reached` com 20 na lista; nome vazio e `scope` inválido 400 com os campos. Com o banco: nome repetido não deixa a carteira nem o aporte gravados |
| CA05 | ✅ Original de outro usuário: 404 com "tentativa de acessar carteira de outro usuário" no log e sem o nome da carteira; id inexistente 404; colaborador 403; sem sessão 401 |
| CA06 | ✅ A lista traz `copiedFrom` com o nome; retirada na cópia não muda o caixa da original; excluir a original deixa a cópia com `copiedFrom.name` nulo; a exportação sai na versão 7 com `copiedFrom`. Com o banco: excluir a original mantém `origem_id` na cópia, e copiar uma carteira já excluída é `portfolio_not_found` |
| CA07 | ✅ Na cópia da ao vivo, a compra copiada de ontem não se estorna (`reversible: false`) e a venda feita hoje na cópia é de hoje e se estorna; na histórica, o próximo lançamento segue a RB25 a partir do último copiado (CA03) |
| CA08 | ✅ Pré-visualização das telas com o mock: **Copiar** em cada carteira da lista e **Copiar carteira** na tela da carteira; o formulário com "E se eu tivesse começado em 2019 (cópia)" sugerido, tipo e início fixos, os dois cartões, "Copiar até" (só na histórica) com o erro "Escolha um dia a partir do início da carteira." embaixo do campo, e a mensagem de `copy_breaks_cash` com o valor e a data; a cópia aberta com "Criada em 16 de nov. de 2026 a partir de «…»" (link), o aviso "3 aportes e retiradas e 4 negociações copiados" e **Comparar as duas**, que abre a Comparação; em inglês ("New portfolio from “…”", "Everything" / "Only the money", "Compare both"); a 480 px sem rolagem lateral, com os cartões um embaixo do outro; pelo teclado (os cartões são rádios). ⏳ Abrir no Electron, com a ponte real |
| CA09 | ✅ `requisições.md` 1.12 (RF20 reescrito), `modelo_dominio.md` (`origem_id` em CARTEIRA, o auto-relacionamento "origina cópia" e a nota na SIMULACAO), `PERSONAL_DATA_VERSION` 7 com `copiedFrom`, mapa v1.52 (OPEN-22 resolvida) |
| CA10 | ✅ Migração `20261116120000_carteira_origem` sem diferença para o esquema do Prisma, desfeita (`down.sql`) e refeita no banco de teste; aplicada no banco de desenvolvimento. Medido no banco de teste: copiar uma histórica com **2.826 lançamentos** (um aporte e uma compra por dia útil de 2016 a 2026) levou **0,52 s** |

Total: **1.014 testes** passando (128 com o banco de teste), mais lint, tipos e formatação.
