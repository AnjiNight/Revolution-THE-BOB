# SPEC-006 — Catálogo de ativos: cadastro e busca

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pelo Luís em 22/10/2026 e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | *Must* (RF07, busca); *Should* (RF39, cadastro), mas a busca precisa do cadastro para ter o que mostrar |
| Depende de | [SPEC-002](SPEC-002.md) (conta de colaborador) |
| Requisitos | RF07, RF39; RB22; RNF04, RNF15, RNF17, RNF18, RNF20 |
| Casos de uso | Buscar ativo; P01 passo 1; P03 "cadastrar ou atualizar ativos" |
| Drivers | OBJ02, FAS10, PA03 |
| ADRs | [DA12](../adr/DA12-autorizacao-planos-no-servidor.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA16](../adr/DA16-cotacoes-por-plano.md) (catálogo curado de ~40–50 ativos), [DA22](../adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md), [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) (classes Ação e FII) |

---

## 1. Objetivo

O app passa a ter um **catálogo de ativos** mantido pela equipe:

- o **colaborador** cadastra, edita, desativa e reativa ativos, informando ticker, nome, **classe** (Ação ou FII) e **setor** (ações) ou **segmento** (FIIs);
- o **usuário** busca ativos por ticker ou nome e filtra por classe e por setor ou segmento.

Cada ação do colaborador fica registrada na **auditoria** (quem, quando e o que mudou).

## 2. Valor

- **Usuário:** encontra os ativos que pode estudar e simular, separados em Ações e FIIs, como numa corretora.
- **Sistema:** o catálogo define o que é coletado (DA16): cotações (SPEC-008, 009), lançamentos (012–015) e notícias apontam para um ativo do catálogo.
- **Equipe:** sabe quem mudou cada ativo e quando (RNF15).

## 3. Escopo

### 3.1 Inclui

1. **Cadastro de ativo** pelo colaborador: ticker, nome, classe e setor ou segmento.
2. **Edição** de ticker, nome e setor ou segmento. A **classe não muda** depois do cadastro (RB22).
3. **Desativar e reativar** um ativo. Ativo nunca é apagado.
4. **Busca** para qualquer pessoa conectada: texto (ticker ou nome) e filtros de classe e de setor ou segmento.
5. **Lista fixa de setores e segmentos** (§4), escolhida em uma lista pronta.
6. **Registro de auditoria** das ações administrativas, começando pelo catálogo; a publicação do calendário de pregão (SPEC-005) também passa a ser registrada.
7. **Telas:** "Ativos" para o usuário (busca) e "Ativos" na Área do colaborador (manutenção).

### 3.2 Não inclui

- **Quais ativos entram no catálogo:** escolha da equipe, feita pela tela de cadastro. A DA16 estima espaço para uns 40 a 50 na coleta gratuita.
- **Ficha do ativo** (cotação, gráfico, notícias): chega com as cotações (SPEC-009) e as notícias.
- **Cotações e carga do histórico** de um ativo recém-cadastrado: SPEC-008.
- **Compra e venda** de ativo ativo ou desativado: as regras ficam decididas aqui (§4) e são aplicadas nos lançamentos (SPEC-012 a 015).
- **Tela para consultar a auditoria:** os registros ficam guardados; a consulta entra com o painel da equipe (SPEC-011).
- **ETFs, BDRs, opções e renda fixa** (DA22, DA23).

## 4. Decisões tomadas nesta Spec

Aprovadas pela equipe em 22/10/2026: a busca procura **só no catálogo** (OPEN-41), a lista de setores e segmentos é **fixa** (as listas abaixo), ativo desativado **some da busca, mas quem tem continua vendo e pode vender**, o ticker pode ser corrigido e a publicação do calendário entra na auditoria.

| Tema | Decisão | Motivo |
|---|---|---|
| **Busca (OPEN-41)** | Só nos ativos **ativos** do catálogo. Ativo que não está no catálogo não aparece | O app só tem preço dos ativos do catálogo (DA16); um ativo sem preço não serviria para simular |
| **Setores e segmentos** | Lista **fixa**, definida pela equipe (tabela abaixo). O colaborador só escolhe; mudar a lista é uma migração nova | Evita "Banco" e "Bancos" como dois filtros diferentes |
| **Desativar** | Ativo desativado **some da busca do usuário e não pode ser comprado**; quem já tem **continua vendo na carteira e pode vender**. Pode ser reativado | Como nas corretoras: ninguém fica preso a um ativo, e o histórico não quebra (DA09) |
| Excluir | **Não existe.** Só desativar | Lançamentos e cotações apontam para o ativo; apagá-lo quebraria o histórico |
| Classe | Ação (inclui units) ou FII, escolhida no cadastro e **nunca alterada**, nem pela tela nem direto no banco; nunca deduzida do ticker (RB22, DA23) | TAEE11 (unit), MXRF11 (FII) e BOVA11 (ETF) terminam todos em 11 |
| Setor ou segmento | Obrigatório e **da mesma classe do ativo**: ação tem setor da lista de ações; FII tem segmento da lista de FIIs | Busca e distribuição da carteira (RF18) separam as duas classes |
| Ticker | Único, em maiúsculas, no formato da B3: 4 caracteres começando por letra, seguidos de 1 ou 2 números (PETR4, B3SA3, TAEE11). **Pode ser corrigido** | Empresas trocam de código (ex.: BRDT3 virou VBBR3); o histórico segue o ativo, não o código |
| Nome | De 2 a 100 caracteres | Igual aos outros nomes do sistema |
| Texto da busca | Ticker que **começa** com o texto ou nome que **contém** o texto, sem diferenciar maiúsculas nem acentos ("acucar" acha "Açúcar") | O usuário digita do jeito que lembra |
| Ordem dos resultados | Ticker igual ao texto primeiro, depois ticker que começa com o texto, depois por nome; até 50 resultados | Quem digita "PETR4" quer PETR4 no topo; 50 cobre o catálogo inteiro |
| Tamanho do catálogo | Sem limite rígido; a tela do colaborador mostra quantos ativos estão ativos e **avisa acima de 50** | A coleta gratuita comporta uns 40 a 50 (DA16), mas um plano pago comporta mais |
| Quem altera | Só colaborador (403 para usuário), conferido no servidor (DA12) | Catálogo é dado de referência da equipe |
| **Auditoria** | Cada cadastro, edição, desativação, reativação de ativo e publicação do calendário grava: quando, o **id** do colaborador, a ação, o item e o que mudou (antes e depois). Só se acrescenta; nada é editado ou apagado pelo app | RNF15, sem dado pessoal fora do módulo de identidade (DA13) |
| Onde fica | Novo módulo **Catálogo de Ativos** e módulo transversal **Auditoria** no servidor (arquitetura §6 e §9) | Separação já prevista na arquitetura |
| Idiomas | Nomes de setores e segmentos traduzidos no app (português e inglês); o servidor usa só o código | RNF20 |

**Lista de setores (ações)** — os setores econômicos da classificação da B3:

| Código | Português | Inglês |
|---|---|---|
| `bens_industriais` | Bens industriais | Industrials |
| `comunicacoes` | Comunicações | Communications |
| `consumo_ciclico` | Consumo cíclico | Consumer discretionary |
| `consumo_nao_ciclico` | Consumo não cíclico | Consumer staples |
| `financeiro` | Financeiro | Financials |
| `materiais_basicos` | Materiais básicos | Basic materials |
| `petroleo_gas_biocombustiveis` | Petróleo, gás e biocombustíveis | Oil, gas and biofuels |
| `saude` | Saúde | Health care |
| `tecnologia_informacao` | Tecnologia da informação | Information technology |
| `utilidade_publica` | Utilidade pública | Utilities |
| `outros` | Outros | Other |

**Lista de segmentos (FIIs)** — os mais usados por corretoras e sites de FIIs (não há lista oficial da B3):

| Código | Português | Inglês |
|---|---|---|
| `lajes_corporativas` | Lajes corporativas | Office buildings |
| `logistica` | Logística | Logistics |
| `shoppings` | Shoppings | Shopping malls |
| `recebiveis` | Recebíveis (papel) | Real estate receivables |
| `fundo_de_fundos` | Fundo de fundos | Fund of funds |
| `hibrido` | Híbrido | Hybrid |
| `residencial` | Residencial | Residential |
| `hoteis` | Hotéis | Hotels |
| `renda_urbana` | Renda urbana (agências, hospitais, escolas, varejo) | Urban income (bank branches, hospitals, schools, retail) |
| `desenvolvimento` | Desenvolvimento | Development |
| `outros` | Outros | Other |

## 5. Comportamento esperado

### 5.1 Regras

| Regra | Definição |
|---|---|
| Ativo visível na busca do usuário | Ativo **ativo** (não desativado) que combina com o texto e os filtros |
| Comprar (SPEC-012 a 015) | Só ativo ativo |
| Vender e ver na carteira (SPEC-012 em diante) | Ativo ativo ou desativado |
| Classe | Definida no cadastro; não há operação que a altere (RB22) |
| Setor ou segmento | Sempre da mesma classe do ativo |
| Ticker | Único entre todos os ativos, inclusive os desativados |

### 5.2 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/assets` | Qualquer pessoa conectada | `q` (texto, opcional), `class` (`stock` ou `fii`, opcional), `sector` (código, opcional) | 200 com `assets` (`id`, `ticker`, `name`, `class`, `sector`) e `hasMore`; só ativos ativos | 400 `validation_error` (filtro inválido); 401 |
| `GET /api/assets/sectors` | Qualquer pessoa conectada | — | 200 com a lista fixa de setores e segmentos (`class`, `code`) | 401 |
| `GET /api/collaborator/assets` | Colaborador | Os mesmos filtros e `status` (`active`, `inactive` ou todos) | 200 com os ativos, inclusive desativados, com `active`, `createdAt` e `updatedAt`; total de ativos ativos | 401; 403 |
| `POST /api/collaborator/assets` | Colaborador | `ticker`, `name`, `class`, `sector` | 201 com o ativo | 400 `validation_error`; 409 `ticker_in_use`; 401; 403 |
| `PATCH /api/collaborator/assets/:id` | Colaborador | `ticker`, `name` e/ou `sector` (não há campo de classe) | 200 com o ativo | 400 `validation_error` (inclusive setor de outra classe); 404 `asset_not_found`; 409 `ticker_in_use`; 401; 403 |
| `POST /api/collaborator/assets/:id/deactivate` | Colaborador | — | 200 com o ativo desativado | 404; 401; 403 |
| `POST /api/collaborator/assets/:id/reactivate` | Colaborador | — | 200 com o ativo reativado | 404; 401; 403 |

Desativar um ativo já desativado (ou reativar um ativo ativo) responde 200 sem mudar nada e sem novo registro de auditoria.

### 5.3 Telas

| Situação | Tela |
|---|---|
| Navegação do usuário | Novo item **"Ativos"** |
| Tela Ativos (usuário) | Campo de busca (ticker ou nome); filtro de classe (Todas, Ações, FIIs); filtro de setor ou segmento conforme a classe; lista com ticker, nome, classe e setor ou segmento; aviso "O catálogo tem os ativos escolhidos pela equipe"; mensagem quando nada é encontrado |
| Navegação do colaborador | Novo item **"Ativos"** (manutenção), ao lado de "Calendário" |
| Tela Ativos (colaborador) | Mesma busca, com filtro de situação (ativos, desativados, todos); contador "{n} ativos ativos", com aviso acima de 50 (coleta gratuita, DA16); botão **"Novo ativo"** |
| Novo ativo | Ticker, nome, classe (Ação ou FII) e setor ou segmento (a lista muda com a classe); aviso "A classe não pode ser mudada depois" |
| Editar ativo | Ticker, nome e setor ou segmento; a classe aparece só para leitura |
| Desativar | Confirmação: "{ticker} some da busca e não pode mais ser comprado. Quem já tem continua vendo e pode vender." Reativar sem confirmação |
| Início do colaborador | O cartão "Cadastro de ativos" deixa de ser "Em breve" e leva à tela |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `setor` (nova) | `classe`, `codigo` | Chave (`classe`, `codigo`). Preenchida pela migração com a lista do §4; o app só lê |
| `ativo` (nova) | `id`, `ticker`, `nome`, `classe`, `setor`, `criado_em`, `atualizado_em`, `desativado_em` | `ticker` único e no formato da B3; `nome` de 2 a 100 caracteres; `classe` em lista fechada (`acao`, `fii`); (`classe`, `setor`) aponta para `setor`, o que garante setor da mesma classe; a classe não pode ser alterada (gatilho no banco); sem `desativado_em`, o ativo está ativo |
| `registro_auditoria` (nova) | `id`, `ocorrido_em`, `colaborador_id`, `acao`, `entidade`, `entidade_id`, `detalhes` | `colaborador_id` só o id, sem chave estrangeira (DA13); `detalhes` guarda antes e depois dos campos alterados, nunca dado pessoal |

ATIVO ganha classe em lista fechada, setor ou segmento e situação (arquitetura §9); SETOR e REGISTRO_AUDITORIA passam a existir. A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Colaborador cadastra ação e FII com ticker, nome, classe e setor ou segmento; ticker vira maiúsculas |
| CA02 | Ticker fora do formato, nome curto ou longo, classe fora da lista, setor de outra classe ou ausente dão `validation_error` com o problema de cada campo; ticker repetido (inclusive de ativo desativado) dá `ticker_in_use` |
| CA03 | Edição muda ticker, nome e setor ou segmento; não existe forma de mudar a classe, nem pela API nem direto no banco (RB22) |
| CA04 | Ativo desativado some da busca do usuário e reaparece ao ser reativado; continua na lista do colaborador |
| CA05 | Busca por começo do ticker e por parte do nome, sem diferenciar maiúsculas e acentos; filtros de classe e de setor ou segmento; ordem do §4; no máximo 50 resultados com `hasMore` |
| CA06 | Usuário recebe 403 em todas as rotas do colaborador; qualquer pessoa conectada busca e lista os setores; sem sessão, 401 |
| CA07 | Cada cadastro, edição, desativação, reativação e publicação do calendário grava um registro de auditoria com quando, id do colaborador, ação, item e antes e depois; nenhum nome ou e-mail no registro |
| CA08 | Desativar o que já está desativado (e reativar o que está ativo) não muda nada e não grava auditoria |
| CA09 | Tela do usuário: busca, filtros e lista; mensagem quando nada é encontrado |
| CA10 | Tela do colaborador: novo, editar, desativar com confirmação, reativar, filtro de situação e contador com aviso acima de 50 |
| CA11 | Português e inglês, inclusive os nomes dos setores e segmentos; usável pelo teclado; janela de 480px sem rolagem lateral (RNF04, RNF18, RNF20) |
| CA12 | As tabelas existem com as restrições do §6, a lista de setores vem da migração e a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-41 | ✅ **Resolvida** (Luís, 22/10/2026): a busca procura só no catálogo da equipe |
| DA23, ponto 1 | ✅ **Resolvido** (Luís, 22/10/2026): lista de setores e segmentos do §4 |
| — | ✅ Ticker pode ser corrigido depois do cadastro (Luís, 22/10/2026) |
| — | ✅ A publicação do calendário (SPEC-005) também é registrada na auditoria (Luís, 22/10/2026) |
| SPEC-008 | Coleta de cotações de ativo desativado que alguém ainda tem: decidir com a carga de cotações (quem tem precisa de preço para vender) |
| — | Incluir SETOR e REGISTRO_AUDITORIA no modelo de domínio, como a OPEN-44 pede para o calendário |

## 9. Verificação (22/10/2026)

| Critério | Resultado |
|---|---|
| CA01, CA02 | ✅ Regras compartilhadas (`assets.test.ts`): formato da B3 (PETR4, B3SA3, TAEE11; recusa minúsculas, fracionário e tamanhos errados), nome, classe e setor fora da lista, setor de outra classe (`wrong_class`) junto com os outros problemas. Rotas (`asset-routes.test.ts`): cadastro de ação e FII, ticker em maiúsculas, erro de cada campo, ticker repetido inclusive de ativo desativado (`ticker_in_use`) |
| CA03 | ✅ Edição de ticker (BRDT3 → VBBR3), nome e setor; `class` na edição dá `immutable`; setor de outra classe dá `wrong_class`; ticker de outro ativo dá 409; id inexistente ou que não é UUID dá 404. No PostgreSQL, o gatilho `ativo_classe_imutavel` recusa mudar a classe até por SQL direto |
| CA04, CA08 | ✅ Desativado some da busca do usuário e volta ao reativar; o colaborador sempre vê, com filtro de situação e o total de ativos. Desativar o que já está desativado, reativar o que está ativo e editar com os mesmos valores não gravam nada |
| CA05 | ✅ Busca pura (`asset-search.test.ts`): ticker igual primeiro, depois quem começa com o texto, depois o nome; sem maiúsculas nem acentos ("acucar" acha "Açúcar", "itau" acha "Itaú"); filtros de classe e de setor ou segmento; no máximo 50 com `hasMore` |
| CA06 | ✅ Usuário recebe 403 em todas as rotas do colaborador, antes de qualquer validação, e nada muda; 401 sem sessão; qualquer pessoa conectada busca e lista os setores |
| CA07 | ✅ Cada cadastro, edição, desativação, reativação e publicação do calendário grava quando, o id do colaborador, a ação, o item e o antes e depois, na mesma transação da mudança (recusa não grava). Nenhum nome ou e-mail no registro. No PostgreSQL, o gatilho `registro_auditoria_somente_insercao` recusa UPDATE e DELETE. Duas edições ao mesmo tempo do mesmo ativo esperam uma pela outra (o "antes" da segunda é o "depois" da primeira) |
| CA09, CA10 | ✅ Telas conferidas no navegador: busca do usuário (texto, classe, setor, "Limpar filtros", vazio); catálogo do colaborador (contador, aviso acima de 50, novo ativo com erros por campo, escolher o setor escolhe a classe, editar com a classe travada, ticker em uso, desativar com confirmação em âmbar, reativar). Teclado: foco no primeiro campo ao abrir, de volta ao botão ao cancelar, na mensagem depois de salvar; confirmação com foco em "Desativar agora" e volta ao "Desativar" ao cancelar. Início com "Disponível agora". Cliente testado (`auth-client.test.ts`: filtros na query string, 403/409/404, id que não é UUID nem chega ao servidor). ⏳ Conferir no Electron |
| CA11 | ✅ Português e inglês, inclusive os 22 setores e segmentos (teste confere que a lista do app e as traduções batem). Claro e escuro. Janela de 480px sem rolagem lateral: quatro itens na navegação do colaborador, "Sair" só com o ícone (o nome continua para leitores de tela), tabela com a classe embaixo do nome e as ações empilhadas |
| CA12 | ✅ PostgreSQL real (`prisma-asset.db.test.ts`): a lista de setores da migração é igual à do app; ticker no formato da B3 e único; nome de 2 a 100 caracteres; classe fora da lista e setor de outra classe recusados; setor em uso não pode ser apagado. Migração `20261022220000_catalogo_ativos` conferida contra o esquema do Prisma (nenhuma diferença), desfeita (tabelas, tipos e funções removidos) e refeita; ciclo completo do CI (todas as migrações desfeitas e refeitas) também |
| Ponta a ponta | ✅ Servidor compilado, PostgreSQL e Mailpit: 25 de 25 verificações (colaboradora criada pelo comando da equipe, 22 setores, 403 e 401, cadastro, erros por campo, busca sem acento, filtros, edição, classe recusada pela API e pelo banco, desativar e reativar, auditoria sem nome nem e-mail e que não pode ser apagada, publicação do calendário na auditoria). Log do servidor sem dado pessoal |

Total: **441 testes** passando (com o banco real), lint, tipos, formatação e build.

**Para as próximas Specs:** os lançamentos (SPEC-012 a 015) usam `isActive` do ativo para recusar compra de ativo desativado e continuam aceitando venda; as cotações (SPEC-008) partem de `AssetRepository.list({ status: 'active' })`. Nova ação administrativa entra no registro com um valor novo em `acao_auditoria` (migração) e é gravada na mesma transação, com `auditRow`.
