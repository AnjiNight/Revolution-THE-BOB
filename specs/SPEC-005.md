# SPEC-005 — Calendário de pregão

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pelo Luís em 22/10/2026 e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | Técnica de regra (habilita os *Must*: 008, 009 e os lançamentos 012–015) |
| Depende de | [SPEC-002](SPEC-002.md) (conta de colaborador) |
| Requisitos | RB11; RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | — (Requisitos §5: rastreabilidade da RB11) |
| Drivers | PRE05, QA01 |
| ADRs | [DA07](../adr/DA07-ingestao-assincrona.md) (calendário anual com revisão manual), [DA10](../adr/DA10-nucleo-calculo-puro.md) (cálculo sem banco nem rede), [DA12](../adr/DA12-autorizacao-planos-no-servidor.md) |

---

## 1. Objetivo

O sistema passa a saber **em quais dias a B3 tem pregão**:

- responde se uma data é dia de pregão;
- conta quantos pregões há entre duas datas;
- diz qual é o pregão anterior e o próximo de uma data.

O **colaborador** mantém o calendário: a cada ano, ele carrega uma sugestão pronta, confere com o calendário oficial da B3, ajusta e publica.

## 2. Valor

- **Sistema:** uma fonte única para a RB11 ("não há movimentação em dias sem pregão"). As cotações (008, 009) sabem quando buscar preço; os lançamentos (012–015) recusam data sem pregão; os cenários (031) contam pregões.
- **Colaborador:** manter o calendário leva poucos minutos por ano, porque quase tudo vem calculado.
- **Usuário:** nenhum lançamento em sábado, domingo ou feriado, como numa corretora de verdade.

## 3. Escopo

### 3.1 Inclui

1. **Regras de calendário em código puro** (DA10): dia de pregão, contagem de pregões, pregão anterior e próximo.
2. **Sugestão automática** dos dias sem pregão de qualquer ano: feriados nacionais fixos, os móveis calculados a partir da Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi) e os dias que a B3 costuma fechar (24/12 e 31/12).
3. **Publicação do ano** pelo colaborador: a lista inteira de dias sem pregão de um ano, com o motivo de cada um. Pode republicar para corrigir.
4. **Tela "Calendário de pregão"** na Área do colaborador.
5. **Aviso no Início do colaborador** a partir de 1º de dezembro, se o ano seguinte ainda não foi publicado.
6. **Consulta do calendário** por qualquer pessoa conectada, para as telas que vão usar datas (lançamentos, carteira histórica).

### 3.2 Não inclui

- **Horário especial** (ex.: a quarta-feira de Cinzas abre às 13h): para a RB11 o dia tem pregão; os horários do pregão ficam com a SPEC-009.
- **Quantos anos passados carregar:** depende do tamanho do histórico de cotações (OPEN-05, SPEC-008). Esta Spec permite publicar qualquer ano, passado ou futuro.
- **Feriados bancários da ANBIMA** (base 252 da renda fixa): adiados com a renda fixa ([DA22](../adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md)).
- **Buscar o calendário no site da B3 automaticamente:** a B3 publica um comunicado por ano, sem um formato estável para leitura por programa.
- **Notificação por e-mail ao colaborador:** o aviso fica no Início dele (notificações são a SPEC-033).

## 4. Decisões tomadas nesta Spec

Aprovadas pela equipe em 22/10/2026: fonte e responsável (OPEN-01); ano não publicado **bloqueia, com um aviso explicando o motivo**; aviso desde 1º de dezembro e prazo até 31 de dezembro.

| Tema | Decisão | Motivo |
|---|---|---|
| **Fonte (OPEN-01)** | O **calendário oficial publicado pela B3** a cada ano ("Calendário de negociação") | É a única fonte que vale para o pregão: a B3 segue os feriados nacionais, mas tem regras próprias (fecha em 24/12 e 31/12; desde 2022 abre nos feriados de São Paulo, como 25/1 e 9/7) |
| **Responsável (OPEN-01)** | O **colaborador**, pela Área do colaborador: carrega a sugestão, confere com a B3, ajusta e publica | Mantém a revisão manual da DA07, que cobre mudanças que nenhum cálculo prevê (feriado novo, como o 20/11 desde 2024) |
| Sugestão automática | Feriados nacionais fixos; Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi calculados pela Páscoa; Consciência Negra (20/11) a partir de 2024; 24/12 e 31/12. Cada item vem marcado como sugestão | Para 2026, a sugestão bate com o calendário oficial da B3; o colaborador só confere |
| **Ano não publicado** | O sistema **não adivinha**: qualquer pergunta sobre uma data desse ano falha com `calendar_not_published`, e quem usa (cotações, lançamentos) recusa a operação mostrando um aviso que explica o motivo: "O calendário de pregão desse ano ainda não foi publicado pela equipe. Sem ele, o app não sabe em quais dias a bolsa abriu." | Usar a sugestão sem revisão poderia aceitar um lançamento num dia sem pregão, quebrando a RB11 sem ninguém perceber |
| Prazo | O ano seguinte deve ser publicado até **31 de dezembro**; o Início do colaborador avisa a partir de **1º de dezembro** | A B3 divulga o calendário do ano seguinte no começo de dezembro (o de 2026 saiu no Ofício Circular 054/2025-VNC, de 04/12/2025) e pode corrigi-lo depois; por isso o colaborador também pode republicar |
| Fins de semana | Nunca têm pregão e **não são guardados**: só os dias úteis sem pregão entram na lista | Lista curta (cerca de 12 dias por ano) e sem como errar um sábado |
| Fuso | Todas as datas no horário de Brasília (PRE05); "hoje" também é calculado em Brasília | Perto da meia-noite, o dia em UTC já seria outro |
| Onde fica | Novo módulo **Dados de Mercado** no servidor (arquitetura §9); as regras de calendário ficam no núcleo de cálculo puro | DA10: contagem de pregões é cálculo, testado sem banco (RNF16) |
| Quem altera | Só colaborador (403 para usuário), conferido no servidor (DA12) | Calendário é dado de referência da equipe |
| Registro | Cada publicação guarda quando e por qual colaborador (só o id) | Saber quem mexeu, sem dado pessoal fora do módulo de identidade (DA13) |

## 5. Comportamento esperado

### 5.1 Regras (núcleo de cálculo)

| Regra | Definição |
|---|---|
| Dia de pregão | Segunda a sexta **e** fora da lista de dias sem pregão do ano |
| Contagem de pregões | Quantos dias de pregão há de `início` a `fim`, **incluindo os dois** |
| Pregão anterior / próximo | O dia de pregão mais perto antes / depois da data (a própria data não conta) |
| Ano não publicado | Qualquer regra que precise de um ano sem calendário publicado falha com "calendário não publicado" |

### 5.2 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/calendar/:year` | Qualquer pessoa conectada | — | 200 com `year`, `published`, `publishedAt` e `nonTradingDays` (`date`, `reason`) | 401 |
| `GET /api/collaborator/calendar/:year/suggestion` | Colaborador | — | 200 com a sugestão do ano | 401; 403 |
| `PUT /api/collaborator/calendar/:year` | Colaborador | `nonTradingDays`: lista de `date` e `reason` | 200: ano publicado (substitui a lista anterior) | 400 `validation_error` (data fora do ano, fim de semana, repetida ou sem motivo); 401; 403 |

Ano aceito: de 2000 a 2100.

### 5.3 Telas

| Situação | Tela |
|---|---|
| Área do colaborador | Novo item **"Calendário"** na navegação |
| Tela Calendário de pregão | Seletor de ano; situação ("Publicado em {data}" ou "Não publicado"); lista de dias sem pregão (data, dia da semana, motivo), com remover; adicionar dia (data + motivo); **"Carregar sugestão"**; aviso "Confira com o calendário oficial da B3 antes de publicar"; **"Publicar {ano}"** com confirmação |
| Erro na lista | Mensagem no dia com problema (fim de semana, fora do ano, repetido, sem motivo) |
| Início do colaborador, a partir de 1º/12 | Aviso "O calendário de {ano seguinte} ainda não foi publicado", com atalho para a tela |
| Início do colaborador, ano atual não publicado | Aviso em qualquer mês: sem o ano atual, os lançamentos com datas dele ficam bloqueados (§4) |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `ano_calendario` (nova) | `ano`, `publicado_em`, `publicado_por` (id do colaborador) | `ano` é a chave, entre 2000 e 2100 |
| `dia_sem_pregao` (nova) | `data`, `ano`, `motivo` | `data` é a chave; chave estrangeira para `ano_calendario` com exclusão em cascata; o ano da data é igual a `ano`; não pode ser sábado nem domingo; `motivo` com 1 a 100 caracteres |

CALENDARIO_PREGAO† vira estas duas tabelas. A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Regras puras: sábado e domingo nunca têm pregão; dia da lista não tem; contagem inclui as duas pontas; pregão anterior e próximo pulam fins de semana e feriados, inclusive na virada do ano |
| CA02 | A Páscoa e os feriados móveis saem certos em anos de referência (ex.: 2026: Carnaval 16 e 17/2, Sexta-feira Santa 3/4, Corpus Christi 4/6; 2027: Carnaval 8 e 9/2, Sexta-feira Santa 26/3, Corpus Christi 27/5) |
| CA03 | A sugestão de 2026 é igual ao calendário oficial publicado pela B3 para 2026 |
| CA04 | O colaborador publica um ano; republicar substitui a lista; fica registrado quando e por quem |
| CA05 | Data fora do ano, fim de semana, repetida ou sem motivo dá `validation_error` com o problema de cada dia |
| CA06 | Usuário recebe 403 nas rotas do colaborador; qualquer pessoa conectada consulta o calendário |
| CA07 | Ano não publicado: a consulta diz `published: false` e as regras do servidor falham com "calendário não publicado" |
| CA08 | "Hoje" e as datas seguem o horário de Brasília (teste perto da meia-noite em UTC) |
| CA09 | O Início do colaborador avisa a partir de 1º/12 quando o ano seguinte não está publicado, e não avisa antes nem depois de publicado |
| CA10 | Tela do calendário: carregar sugestão, adicionar, remover e publicar com confirmação; português e inglês; usável pelo teclado (RNF18) |
| CA11 | As tabelas existem com as restrições da §6; a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-01 | ✅ **Resolvida** (Luís, 22/10/2026): calendário oficial da B3, conferido e publicado pelo colaborador, com sugestão automática |
| — | ✅ Ano não publicado **bloqueia**, com aviso explicando (Luís, 22/10/2026) |
| — | ✅ Prazo de **31 de dezembro**, com aviso desde 1º de dezembro (Luís, 22/10/2026) |
| OPEN-05 | Quantos anos passados publicar: decidir com a SPEC-008 (histórico de cotações) |
| OPEN-44 | Incluir ANO_CALENDARIO e DIA_SEM_PREGAO no modelo de domínio |

## 9. Verificação (22/10/2026)

| Critério | Resultado |
|---|---|
| CA01, CA07 | ✅ Regras puras no núcleo de cálculo (`financial-calculation/trading-calendar.test.ts`): fim de semana, dia da lista, contagem com as duas pontas (247 pregões em 2026), pregão anterior e próximo pulando feriados e atravessando a virada do ano; ano não publicado falha com `calendar_not_published` e o ano que faltou. Pelo serviço, as regras usam o que foi publicado (`calendar-routes.test.ts`, `prisma-calendar.db.test.ts`) |
| CA02, CA03 | ✅ Páscoa em anos de referência (2000 a 2038) e feriados móveis de 2026 e 2027; sugestão de 2026 igual ao calendário oficial da B3 (`calendar-suggestion.test.ts`). A sugestão de todos os anos de 2000 a 2100 passa na validação: dois feriados no mesmo dia viram um só (em 2000, "Tiradentes e Sexta-feira Santa") |
| CA04–CA06 | ✅ Testes das rotas: publicar, registrar quando e por quem (só o id), republicar substituindo a lista; o problema de cada dia (fim de semana, outro ano, repetido, data inválida, sem motivo); 403 para usuário antes de qualquer validação; 401 sem sessão; ano fora de 2000–2100 dá `validation_error` |
| CA08, CA09 | ✅ "Hoje" em Brasília (31/12 às 23h30 em Brasília já é 1º/1 em UTC) e anos que o Início confere (`calendar.test.ts` do pacote compartilhado). Conferido na tela: sem aviso em outubro com 2026 publicado; aviso de 2027 em 5/12; aviso do ano atual quando ele não foi publicado |
| CA10 | ✅ Telas conferidas no navegador (claro e escuro, português e inglês, janela de 480px): item "Calendário" só para colaborador, carregar sugestão (marcada "Sugestão"), adicionar (fim de semana recusado no campo), remover, publicar com confirmação, "Publicado em …", troca de ano travada enquanto há alterações. Teclado: foco vai para "Publicar agora", volta ao fechar, vai para a mensagem de sucesso depois de publicar e para a linha seguinte ao remover. Cliente testado (`auth-client.test.ts`: ano fora do intervalo nem chega ao servidor). Paridade dos idiomas coberta por teste. ⏳ Conferir no Electron |
| CA11 | ✅ PostgreSQL real (`prisma-calendar.db.test.ts`): ano de 2000 a 2100, dia só com ano publicado e do mesmo ano, sem sábado nem domingo, motivo de 1 a 100 caracteres, data única, exclusão em cascata, publicação inteira ou nada. Migração `20261022190000_calendario_pregao` conferida contra o esquema do Prisma (nenhuma diferença), desfeita e refeita |
| Ponta a ponta | ✅ Servidor compilado, PostgreSQL e Mailpit: 16 de 16 verificações (colaborador criado pelo comando da equipe, usuário confirmado, ano não publicado, 403 e 401, sugestão igual à B3, erros por dia, publicação com autor e data, datas gravadas sem desvio de fuso, republicação, banco recusando sábado). Log do servidor sem dado pessoal |

Total: **375 testes** passando (com o banco real), lint, tipos, formatação e build.

**Para as próximas Specs:** as cotações e os lançamentos (SPEC-008, 009, 012–015) pedem as regras com `CalendarService.tradingCalendar(de, até)` e, quando a data cai num ano não publicado, respondem com o código `calendar_not_published`. O app já tem o aviso que explica o motivo (`authErrors.calendar_not_published`).
