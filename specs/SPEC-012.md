# SPEC-012 — Criação e gestão de carteiras (ao vivo e histórica)

| Campo | Conteúdo |
|---|---|
| Status | Escrita em 05/11/2026 com as recomendações aceitas pelo Luís para as OPEN-09, OPEN-11 e OPEN-15 (§4.1). Aguarda a aprovação da Spec inteira |
| Fase | 3 — Núcleo da carteira ([mapa de specs](mapa_specs.md)), a primeira |
| Prioridade | *Must* (RF11) |
| Depende de | [SPEC-002](SPEC-002.md) (contas), [SPEC-005](SPEC-005.md) (calendário: a data de início da carteira histórica é um dia de pregão), [SPEC-034](SPEC-034.md) (exportação e exclusão de dados pessoais) |
| Muda | `requisições.md` (versão 1.8: RB07 reescrita, RF11, novas RB24 a RB26), `modelo_dominio.md` (sai `saldo_inicial`, entram `tipo` e `inicio_em`), SPEC-034 (seção de carteiras na exportação) |
| Requisitos | RF11; RB02, RB03, RB04, RB24, RB25, RB26; RNF04, RNF11, RNF15, RNF17, RNF18, RNF20 |
| Casos de uso | Criar carteira; P01 passo 3 |
| Drivers | OBJ01, FAS01, QA05, QA07, QA13 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA12](../adr/DA12-autorizacao-planos-no-servidor.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) |

---

## 1. Objetivo

O usuário passa a ter **carteiras de simulação**:

- **cria** uma carteira com nome e **tipo** — **ao vivo** (opera com o preço de agora) ou **histórica** (opera no passado, a partir de uma data de início) —, e o tipo **não muda depois** (DA17);
- **vê** só as próprias carteiras (RB03), **renomeia** e **exclui** com confirmação;
- abre cada carteira numa tela própria, que as próximas Specs enchem: aportes e retiradas (SPEC-013), compra e venda (SPEC-014), estorno (SPEC-015), lançamentos com data passada (SPEC-016) e rentabilidade (SPEC-019).

Esta Spec também fecha as regras que as próximas precisam: o preço de cada tipo de carteira (RB07), o tipo imutável, a ordem dos lançamentos na histórica e de onde vem o dinheiro da carteira.

## 2. Valor

- **Usuário (P01, passo 3):** organiza as simulações, por exemplo "Dividendos" e "Crescimento", ou "E se eu tivesse começado em 2019?".
- **Sistema:** todo lançamento futuro já nasce com dono (RB02) e tipo definidos.
- **Projeto:** as regras de DA16 e DA17 passam para o documento de requisitos (OPEN-09), em vez de ficarem só nas ADRs.

## 3. Escopo

### 3.1 Inclui

1. **Criar carteira:** nome, tipo e, na histórica, a **data de início**.
2. **Listar** as carteiras do usuário, com nome, tipo e data de início.
3. **Renomear** e **excluir** (exclusão definitiva, com confirmação e registro sem dado pessoal).
4. **Tela da carteira** com o cabeçalho (nome, tipo, rótulo da DA17, data de início) e o espaço para os lançamentos das próximas Specs.
5. **Requisitos e modelo atualizados** (OPEN-09 e OPEN-11).
6. **Exportação e exclusão de conta** (SPEC-034): as carteiras entram no arquivo baixado e são apagadas com a conta.

### 3.2 Não inclui

- **Dinheiro na carteira:** aportes e retiradas são da SPEC-013, que também traz o campo "Valor inicial" na criação (§4.1, decisão 2).
- **Compra, venda, posição e preço médio:** SPEC-014. **Estorno:** SPEC-015. **Lançamentos com data passada:** SPEC-016.
- **Valor e rentabilidade da carteira** na lista: SPEC-019.
- **Arquivar** carteira em vez de excluir: pode vir depois, se pedirem.
- **Carteira de colaborador:** a conta da equipe não tem carteiras (§4.2).
- **Carteira real** (corretora de verdade): fora do escopo (OPEN-42).

## 4. Decisões

### 4.1 Respondidas pelo Luís em 05/11/2026 (as recomendações)

| # | Tema (ponto em aberto) | Decisão | Motivo |
|---|---|---|---|
| 1 | **Regras de preço e de tipo (OPEN-09)** | `requisições.md` passa à versão 1.8, já nesta Spec: **RB07 reescrita** — na carteira **ao vivo**, a compra e a venda usam a **última cotação disponível para o plano do usuário**, e o lançamento guarda o horário e o nível dessa cotação (DA16); na **histórica**, o **fechamento do pregão da data escolhida**. Novas **RB24** (o tipo da carteira é escolhido na criação e não muda) e **RB25** (na histórica, cada lançamento tem data igual ou posterior à do último e não anterior à data de início). **RF11** passa a incluir a escolha do tipo. Os ajustes de RF09 e RF33 (nível assinante) ficam com a SPEC-026 | Só documento, sem código; destrava as SPECs 014 e 016 |
| 2 | **Saldo inicial × aportes (OPEN-11)** | **Sai o `saldo_inicial`** do modelo: o caixa vem **só dos lançamentos** de aporte e retirada, no livro-razão (DA09). Para não perder a praticidade, a SPEC-013 acrescenta na criação o campo opcional **"Valor inicial"**, que registra o primeiro aporte (na histórica, com a data de início). **Retirada maior que o caixa é recusada** (nova **RB26**: o caixa nunca fica negativo), como a compra sem saldo (RB05) | Uma só fonte para o caixa; nenhum número que possa discordar dos lançamentos |
| 3 | **Exclusão de carteira (OPEN-15)** | **Exclusão definitiva**, com confirmação, levando junto todos os lançamentos. Fica um **registro sem dado pessoal**: o id da carteira, o tipo, quantos lançamentos tinha e quando foi excluída (sem nome nem dono) | São simulações, sem dinheiro de verdade; a LGPD favorece apagar o que a pessoa pediu (RB04, DA13). A RB08 (lançamento imutável) vale enquanto a carteira existe: apagar a carteira inteira não é editar o histórico |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| Quem tem carteira | Só a conta de **usuário**. Colaborador recebe 403 nas rotas de carteira (DA12) | A conta da equipe cuida do catálogo e do calendário; quem quiser simular usa uma conta de usuário |
| **Nome** | De **1 a 60 caracteres**, sem espaços nas pontas e com os espaços repetidos trocados por um. **Único para cada usuário**, sem diferenciar maiúsculas e acentos ("Dividendos" e "dividendos" são o mesmo nome). Repetido: `portfolio_name_in_use` | Na lista, duas carteiras com o mesmo nome confundem |
| **Limite** | Até **20 carteiras** por usuário; a 21ª dá `portfolio_limit_reached` | Suficiente para comparar estratégias (P02), sem deixar uma conta crescer sem fim |
| **Tipo** | Escolhido na criação, em dois cartões com a explicação: **"Ao vivo — opera com o preço de agora"** e **"Histórica — opera no passado, com dados já conhecidos"**. Sem rota para mudar; o banco também recusa a troca (gatilho, como a classe do ativo) | RB24 (DA17); a explicação ajuda quem está começando (QA13) |
| **Data de início (histórica)** | Obrigatória: um **dia de pregão** (SPEC-005) de **04/01/2016** (o primeiro pregão do histórico de cotações e do CDI) até **o último pregão antes de hoje**. Fora disso: `validation_error` com o motivo (`before_history`, `future`, `not_trading_day`). Ano sem calendário publicado: `calendar_not_published` | DA17, ponto em aberto 1: o mesmo limite do histórico disponível (DA18). Hoje ainda não tem fechamento da B3, então não serve de início |
| Data de início (ao vivo) | O **dia da criação**, no horário de Brasília, definido pelo servidor | Ao vivo começa agora (DA17) |
| A data de início muda? | **Não** nesta Spec. Corrigir o início é apagar a carteira e criar outra | Com lançamentos (SPEC-013 em diante), mudar o início mudaria o passado deles |
| **Rótulos (DA17)** | Na lista e na tela da carteira: **"Simulação ao vivo"** ou **"Simulação histórica: resultado calculado com dados já conhecidos"** | Quem olha uma carteira histórica não confunde com acompanhamento real |
| Ordem da lista | As criadas mais recentemente primeiro | A última criada costuma ser a que a pessoa quer abrir |
| Carteira de outro usuário | Responde **404** (`portfolio_not_found`), como se não existisse, e o servidor registra a tentativa no log (sem dados da carteira) | QA05: negar e registrar, sem revelar que o id existe |
| **Excluir** | Confirmação na tela: "Excluir a carteira **{nome}**? Isso apaga a carteira e todos os lançamentos dela. Não dá para desfazer." Botão **Excluir carteira** em vermelho, como a exclusão de conta | Ação sem volta (SPEC-034 usou o mesmo cuidado) |
| **Exportação (SPEC-034)** | O arquivo ganha a seção `portfolios` (nome, tipo, data de início, criação e alteração; os lançamentos entram com as Specs deles). `version` passa a **2** | Cada Spec que guarda dado do usuário entrega a sua parte (SPEC-034) |
| **Exclusão de conta** | Apaga as carteiras junto, de vez (DA13), sem gravar o registro de exclusão de carteira (a exclusão da conta já tem o seu) | Nada da pessoa fica |
| Onde fica | Novo módulo **Carteiras** no servidor (arquitetura §6). O calendário chega por uma porta, como nos outros módulos | Separação já prevista |
| Navegação | Novo item **Carteiras** no menu do usuário, entre Início e Ativos. O Início ganha o atalho "Criar carteira" quando a pessoa ainda não tem nenhuma | É o centro do simulador |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| "Dividendos", ao vivo, em 05/11/2026 | Criada; início em 05/11/2026; "Simulação ao vivo" |
| "E se em 2019", histórica, início 02/01/2019 | Criada; "Simulação histórica: resultado calculado com dados já conhecidos" |
| Histórica com início em 25/12/2023 (Natal) | `validation_error`, `startDate: not_trading_day` |
| Histórica com início em 30/12/2015 | `validation_error`, `startDate: before_history` |
| Segunda carteira chamada "dividendos" | `portfolio_name_in_use` |
| Renomear e mandar `type` junto | `validation_error`, `type: immutable` |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/portfolios` | Usuário | — | 200 com `portfolios` (`id`, `name`, `type`, `startDate`, `createdAt`, `updatedAt`), da mais recente para a mais antiga, e `limit` (20) | 401; 403 colaborador |
| `POST /api/portfolios` | Usuário | `name`, `type` (`live` ou `historical`), `startDate` (só na histórica) | 201 com `portfolio` | 400 `validation_error`; 409 `portfolio_name_in_use`, `portfolio_limit_reached`, `calendar_not_published`; 401; 403 |
| `GET /api/portfolios/:id` | Usuário dono | — | 200 com `portfolio` | 404 `portfolio_not_found`; 401; 403 |
| `PATCH /api/portfolios/:id` | Usuário dono | `name` | 200 com `portfolio`; o mesmo nome não grava nada | 400 (inclusive `type`/`startDate` enviados: `immutable`); 404; 409 `portfolio_name_in_use`; 401; 403 |
| `DELETE /api/portfolios/:id` | Usuário dono | — | 204; carteira e lançamentos apagados, registro de exclusão gravado | 404; 401; 403 |

### 5.2 Telas

| Situação | Tela |
|---|---|
| Menu do usuário | Novo item **Carteiras** |
| Lista vazia | "Você ainda não tem carteiras. Crie uma para começar a simular." e o botão **Nova carteira** |
| Lista | Cada carteira com nome, rótulo do tipo e "desde {data}"; clicar abre a carteira; ações **Renomear** e **Excluir**; contador "{n} de 20 carteiras" |
| Nova carteira | Nome; os dois cartões do tipo com a explicação; na histórica, o campo **Data de início** (com o primeiro e o último dia aceitos) |
| Tela da carteira | Voltar; nome, rótulo do tipo e data de início; aviso "Os aportes, as compras e as vendas chegam nas próximas etapas" até a SPEC-013 |
| Renomear | No lugar, com o nome atual preenchido; Esc cancela |
| Excluir | Confirmação do §4.2; depois, "Carteira {nome} excluída." e o foco volta para a lista |
| 480 px | Lista em cartões, um embaixo do outro; formulário em uma coluna |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `carteira` (nova) | `id`, `usuario_id`, `nome`, `nome_chave`, `tipo` (`ao_vivo` ou `historica`), `inicio_em` (dia), `criada_em`, `atualizada_em` | `usuario_id` aponta para `usuario`, **apagando em cascata** (exclusão de conta); `nome` de 1 a 60 caracteres; (`usuario_id`, `nome_chave`) único, com `nome_chave` sem maiúsculas nem acentos; `tipo` em lista fechada e **imutável** (gatilho); `inicio_em` de 04/01/2016 em diante e nunca em fim de semana |
| `exclusao_carteira` (nova) | `id`, `carteira_id`, `tipo`, `lancamentos`, `excluida_em` | Sem chave estrangeira (a carteira já não existe) e **sem dado pessoal** (nem nome, nem dono); `lancamentos` não negativo (0 até a SPEC-013) |

A migração tem `down.sql` (RNF17). No `modelo_dominio.md`, CARTEIRA perde `saldo_inicial` e ganha `tipo` e `inicio_em`.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O usuário cria carteira ao vivo (início = hoje, em Brasília) e histórica (início escolhido); o nome é limpo e validado; 21ª carteira é recusada |
| CA02 | Data de início da histórica: dia de pregão de 04/01/2016 até o último pregão antes de hoje; fim de semana, feriado, antes de 2016, hoje e futuro recusados com o motivo; ano sem calendário: `calendar_not_published` |
| CA03 | Nome único por usuário, sem diferenciar maiúsculas e acentos; dois usuários podem ter carteiras com o mesmo nome |
| CA04 | O tipo e a data de início não mudam: a rota recusa (`immutable`) e o banco também (gatilho do tipo) |
| CA05 | Lista só com as carteiras do usuário, da mais recente para a mais antiga; carteira de outro usuário: 404 em todas as rotas e tentativa registrada no log; colaborador: 403 (RB03, QA05) |
| CA06 | Renomear com o mesmo nome não grava; excluir apaga a carteira e grava o registro sem dado pessoal |
| CA07 | Exportação (SPEC-034): seção `portfolios`, `version` 2. Exclusão de conta: as carteiras somem junto |
| CA08 | Telas: lista, vazia, nova (com a explicação dos tipos), carteira, renomear e excluir com confirmação; português e inglês; teclado; 480 px; contraste (RNF04, RNF18, RNF20) |
| CA09 | `requisições.md` 1.8 (RB07 reescrita, RF11, RB24 a RB26) e `modelo_dominio.md` atualizados; OPEN-09 (parte desta Spec), OPEN-11 e OPEN-15 marcadas no mapa |
| CA10 | As tabelas existem com as restrições do §6, e a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-09 | ✅ Parte desta Spec decidida (§4.1, decisão 1); RF09 e RF33 (nível assinante) ficam com a SPEC-026 |
| OPEN-11 | ✅ Decidida (§4.1, decisão 2); o campo "Valor inicial" e a RB26 são implementados na SPEC-013 |
| OPEN-15 | ✅ Decidida (§4.1, decisão 3) |
| OPEN-08 | ⏳ Compra e venda com a bolsa fechada: fica com a SPEC-014 |
| DA17, ponto 3 | ⏳ Comparar carteiras ao vivo e históricas (RF19): SPEC-022, sugestão de permitir sempre com o rótulo visível |
