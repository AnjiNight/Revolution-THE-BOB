# SPEC-011 — Monitoramento e reexecução das tarefas de ingestão

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 16/11/2026 a pedido do Luís, aprovada como escrita, com as recomendações do §4.1 ("pode implementar", 16/11/2026), e implementada (§9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)), a última da fase que faltava; escrita depois das Fases 3 e 5 por ser *Could* |
| Prioridade | Could (RF40) |
| Depende de | [SPEC-002](SPEC-002.md) (colaborador), [SPEC-008](SPEC-008.md) (registro das execuções), [SPEC-009](SPEC-009.md) (coleta do pregão e cota); usa as tarefas das SPECs [005](SPEC-005.md), [007](SPEC-007.md), [020](SPEC-020.md), [040](SPEC-040.md), [041](SPEC-041.md) e [042](SPEC-042.md) |
| Muda | O servidor (rotas do colaborador), o processador (atende os pedidos, grava o sinal de vida, fecha a execução interrompida, limpa as antigas), o banco (tabelas `pedido_execucao` e `estado_processador`), o app (tela Tarefas e o resumo no Início do colaborador), `modelo_dominio.md` e o mapa (OPEN-40) |
| Requisitos | RF40; RNF04, RNF13, RNF17, RNF18, RNF20 |
| Casos de uso | Cenário de uso da P03 (sem caso de uso no diagrama; ver OPEN-43) |
| Drivers | QA12 ("Visibilidade das falhas de ingestão"), FAS10 |
| ADRs | [DA07](../adr/DA07-ingestao-assincrona.md) (o processador é outro processo), [DA12](../adr/DA12-autorizacao-planos-no-servidor.md) (só colaborador), [DA14](../adr/DA14-registro-execucoes-logs.md) (registro das execuções e reexecução pelo painel) |

---

## 1. Objetivo

O colaborador vê, numa tela só, **como estão as tarefas que trazem os dados** para o app: a última execução de cada uma (quando, quanto tempo, quantos registros, quantos ativos e os erros), o histórico das execuções e se o **processador está ligado**. E pede para uma tarefa **rodar agora**, sem acessar o banco nem reiniciar o processador.

É o que a P03 (André) precisa: "visualização do estado das integrações", "registro de erros" e "histórico de execuções dos processos de atualização".

## 2. Valor

- **Colaborador (P03):** descobre uma falha de ingestão pela tela (QA12) e a corrige pedindo uma execução nova, sem banco e sem terminal.
- **Projeto:** cumpre a DA14 ("o painel administrativo também permite reexecutar") e fecha a parte da OPEN-40 que faltava (quanto tempo as execuções ficam guardadas). Hoje cada tarefa aparece num canto diferente (o CDI, os índices e o Investidor10 no Início; a coleta do pregão e a importação no catálogo), e o Início do colaborador ainda diz que "o acompanhamento da coleta de dados chega nas próximas versões".

## 3. Escopo

### 3.1 Inclui

1. **Tela Tarefas** (Área do colaborador): as 9 tarefas de ingestão, com a situação da última execução, o horário, a duração, os registros, os ativos afetados, a fonte e quando cada uma roda; o **estado do processador**; e o botão **Executar agora**.
2. **Histórico de cada tarefa**: as execuções, das mais recentes para as mais antigas, com os erros de cada uma (ativo, dia e mensagem) e os totais que a tarefa grava.
3. **Executar agora**: um pedido gravado no banco, que o processador atende.
4. **Sinal de vida do processador** e o fechamento da **execução interrompida** (o processador parou no meio).
5. **Limpeza das execuções antigas** (OPEN-40).
6. **Resumo no Início do colaborador**, com o link para a tela Tarefas.

### 3.2 Não inclui

- **Avisar o colaborador por e-mail ou notificação** quando uma tarefa falha: ele vê na tela (a SPEC-033 trata de notificações do usuário).
- **Mudar os horários** das tarefas pela tela, **pausar** uma tarefa ou **cancelar** uma execução em andamento.
- **Escolher o que a execução faz** (um período, um ativo): "Executar agora" faz o que a tarefa faria no horário dela (§4.1, decisão 3).
- **As limpezas diárias** (contas não confirmadas e cotações do pregão antigas): não trazem dados nem gravam execução.
- **Os logs do processador** (o que ele escreve no terminal): a tela mostra o registro das execuções no banco (DA14), não o log.

## 4. Decisões

### 4.1 Recomendações para o Luís aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Onde fica** | Uma tela **Tarefas**, aberta pelo **Início do colaborador**, num painel "Tarefas de dados" com o resumo ("Tudo em dia", "2 tarefas com falha", "Processador parado desde 14:05") e o botão **Abrir as tarefas**. Os painéis que já estão no Início (CDI, índices e Investidor10) continuam: eles mostram até onde os dados chegam, e a tela Tarefas mostra como as execuções foram | O menu do topo do colaborador já tem quatro itens; com um quinto, não cabe a 480 px (RNF04). O Início é onde o colaborador já olha a situação dos dados |
| 2 | **Como pedir uma execução** | O servidor grava um **pedido** no banco (tabela `pedido_execucao`: a tarefa, quem pediu e quando), e o **processador confere os pedidos a cada 15 segundos**. Ele roda a tarefa e marca o pedido como atendido, com a execução que o atendeu. **Um pedido pendente por tarefa**: pedir de novo antes de ser atendido é recusado | O processador é outro processo (DA07), talvez em outra máquina na hospedagem: o banco é o que os dois compartilham. Rodar a tarefa dentro do servidor quebraria a DA07 e poderia rodar junto com o processador. Avisar pelo PostgreSQL (`LISTEN`/`NOTIFY`) seria imediato, mas pede outra conexão aberta o tempo todo; 15 segundos de espera não atrapalham ninguém |
| 3 | **O que "Executar agora" faz** | **O que a tarefa faria no horário dela**, sem esperar o horário (a tabela do §4.2). Duas exceções: as **cotações do pregão** só são coletadas em dia e horário de pregão e sem passar a proteção da cota (fora disso, "nada a fazer agora"); e o **Investidor10** visita os ativos nunca visitados **e os que deram erro na última execução** (a visita de todos continua no domingo e leva cerca de uma hora) | É o "reexecutar" da DA14 e da QA12 ("falha parcial: alguns ativos não atualizados"). As exceções protegem as fontes: a cota da brapi (SPEC-009) e o ritmo combinado para não sobrecarregar o site de quem autorizou o Investidor10 (uma página a cada 3 segundos e a coleta de todos só no domingo, SPEC-041) |
| 4 | **Saber se o processador está ligado** | O processador grava um **sinal de vida** a cada minuto (o mesmo "processador ativo" que hoje só vai para o log) numa tabela de uma linha (`estado_processador`). Sem sinal há **mais de 3 minutos**, a tela e o resumo do Início dizem "Processador parado desde 14:05", e um pedido avisa que só roda quando ele for ligado. E, **ao iniciar**, o processador fecha as execuções que ficaram sem fim como **falha**, com o erro "Interrompida: o processador parou antes de terminar" | Sem processador, nenhuma tarefa roda e nenhum pedido é atendido: é a primeira coisa que o colaborador precisa saber. Hoje uma execução interrompida fica "em andamento" para sempre |
| 5 | **Quanto tempo as execuções ficam** (OPEN-40) | **90 dias** para as execuções, os erros delas e os pedidos atendidos, **guardando sempre a última execução de cada tarefa**. A limpeza entra nas limpezas diárias do processador | São uns 25 registros por dia (de 15 a 17 coletas do pregão, de 30 em 30 minutos, mais as diárias), e uma execução pode ter centenas de erros. Menos de um mês não serve: a cota da brapi sem token é contada pelas execuções do ciclo do plano (SPEC-009). A regra de 30 dias da SPEC-034 é para logs com dados pessoais, e estes não têm |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **O que "Executar agora" faz em cada tarefa** | **Calendário pelos arquivos da B3** (07:30): publica os anos fechados. **Histórico retroativo** (a cada 15 min): carrega o histórico dos ativos que ainda não têm. **Fechamento diário** (08:00): busca os pregões que faltam. **Importação do catálogo** (08:30): importa a lista da brapi e confere os negociados. **CDI** (09:00 e 18:00): busca o CDI que falta. **Índices da B3** (08:00 e 20:00): busca o Ibovespa e o IFIX que faltam. **Investidor10** (03:00): os nunca visitados e os que deram erro na última execução. **Eventos corporativos** (04:00, só no domingo): busca os eventos e a classificação setorial agora. **Cotações do pregão** (de 30 em 30 min, das 10:30 até meia hora depois do fechamento): coleta agora, só em dia de pregão e nesse horário, respeitando a cota | Decisão 3 |
| **Quando não há nada a fazer** | Algumas tarefas terminam sem gravar execução quando não há trabalho (por exemplo, a coleta do pregão fora do horário). O pedido fica atendido com "Nada a fazer agora", e a tela diz o motivo quando a tarefa informa | O colaborador vê que o pedido foi atendido, e não fica esperando |
| **Tarefa em andamento** | O botão fica desativado enquanto a tarefa roda ("Em andamento desde 08:00") ou tem um pedido pendente ("Pedido enviado às 10:15, aguardando o processador"). Se o pedido chega com ela rodando, o processador o atende logo depois que ela termina | Uma execução por vez, como o processador já faz |
| **Investidor10 desligado** | Sem a autorização (`INVESTIDOR10_ENABLED` desligado), o botão fica desativado, com "Coleta desligada" | SPEC-041 §4.1 |
| **Lista das tarefas** | Para cada tarefa: o nome, a **fonte** (B3, brapi, Banco Central ou Investidor10), **quando roda**, a **situação da última execução** (sucesso, parcial, falha, aguardando publicação, cota esgotada, em andamento) com ícone e texto, além da cor, e **quando** ela começou e quanto durou, os **registros**, os **ativos afetados** e o número de **erros**. Ordem: primeiro as com falha ou parcial, depois as outras, na ordem do dia | O que precisa de atenção aparece primeiro |
| **Histórico de uma tarefa** | As execuções, das mais recentes para as mais antigas, **50 por vez** ("Mostrar mais"): início, duração, situação, registros, ativos afetados, o período que ela cobriu, as consultas e a cota (nas tarefas da brapi), os **totais** que a tarefa grava (por exemplo, na importação: ativos criados, desativados e reativados e logos baixados) e **quem pediu**, quando a execução veio de um pedido. Cada execução com erro abre a lista dos erros: o **ticker**, o **dia** e a **mensagem**, **100 por vez** | O "registro de erros" e o "histórico de execuções" da P03 |
| **Mensagens de erro** | Ficam como o processador gravou: técnicas e em português, para a equipe. Com o app em inglês, aparecem marcadas com `lang="pt-BR"` (o leitor de tela pronuncia em português) | São textos do processador para a equipe, não da interface; traduzi-los exigiria um código para cada erro de cada fonte |
| **Atualização da tela** | Enquanto a tela Tarefas está aberta, ela se atualiza **a cada 15 segundos**; quando um pedido é atendido, anuncia "Execução terminada: sucesso, 712 registros" (região `role="status"`) | O colaborador vê o pedido virar execução sem recarregar |
| **Rotas** | `GET /api/collaborator/tasks` (as tarefas e o processador), `GET /api/collaborator/tasks/:task/runs` (o histórico, com `offset`), `GET /api/collaborator/runs/:id/errors` (os erros, com `offset`) e `POST /api/collaborator/tasks/:task/requests` (o pedido) | §5.1 |
| **Quando cada tarefa roda** | A lista das tarefas e dos horários fica num lugar só do código, usado pelo processador para agendar e pelo servidor para mostrar | A tela nunca mostra um horário diferente do real |
| **Pedido de quem saiu** | Se a conta do colaborador for removida pela equipe, o pedido continua, sem o nome | O pedido é registro de operação |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Segunda, 08:40, tudo rodou | Início: "Tarefas de dados: tudo em dia · Processador ligado". Na tela Tarefas, o fechamento diário com "Sucesso, hoje às 08:00, 3 min, 712 registros, 712 ativos" e a importação do catálogo com "Sucesso, hoje às 08:30" |
| O site do Investidor10 estava fora às 03:00 | "Investidor10: falha, hoje às 03:00, 0 registros, 1 erro" no topo da lista. O erro diz o que o processador gravou ("Investidor10 indisponível: tempo esgotado"). André clica em **Executar agora** às 10:15: "Pedido enviado às 10:15, aguardando o processador"; em até 15 segundos, "Em andamento desde 10:15"; depois, "Execução terminada: sucesso, 38 registros" |
| Fechamento diário parcial: 3 ativos sem o pregão de ontem | "Parcial, 709 registros, 3 erros"; os erros com o ticker, o dia e a mensagem de cada ativo. **Executar agora** busca de novo os pregões que faltam |
| André pede a coleta do pregão às 20:00 | "Nada a fazer agora: fora do horário do pregão" |
| André clica em **Executar agora** duas vezes seguidas | A segunda é recusada (o botão já estava desativado); a tela continua com "Pedido enviado às 10:15" |
| O processador parou às 14:05 | Depois de 3 minutos, o Início e a tela Tarefas dizem "Processador parado desde 14:05"; um pedido feito agora fica "aguardando o processador ligar" |
| O processador é ligado de novo; o histórico retroativo estava rodando quando ele parou | A execução que ficou aberta vira "Falha: interrompida, o processador parou antes de terminar"; o processador roda as tarefas ao iniciar, como já faz, e depois atende o pedido pendente |
| Execuções de 4 meses atrás | Saíram na limpeza; a última execução do calendário pelos arquivos da B3, de 5 meses atrás, continua (é a última dele) |
| Um usuário (não colaborador) chama a rota | 403 |

### 4.4 Conferido em 16/11/2026

| Pergunta | Resposta |
|---|---|
| O que já é registrado | Nove tarefas gravam cada execução em `execucao_tarefa` (tarefa, início, fim, situação, registros, ativos afetados, período, consultas e cota da brapi, e os totais de cada tarefa em JSON) e os erros em `erro_execucao` (ativo, dia e mensagem de até 500 caracteres). Situações: sucesso, parcial, falha, aguardando publicação e cota esgotada; sem fim, em andamento |
| As tarefas | Calendário pelos arquivos da B3 (07:30), histórico retroativo (a cada 15 min), fechamento diário (08:00), importação do catálogo (08:30), CDI (09:00 e 18:00), índices da B3 (08:00 e 20:00), Investidor10 (03:00; todos no domingo, nos outros dias só os nunca visitados), eventos corporativos da B3 (04:00, no domingo ou se nunca rodou) e cotações do pregão (confere a cada 5 min se chegou a hora da coleta, de 30 em 30 minutos das 10:30 até meia hora depois do fechamento). As duas limpezas diárias não gravam execução |
| Como o processador roda | Cada tarefa roda ao iniciar e depois no horário; uma execução não começa enquanto a anterior da mesma tarefa não terminou (dentro do processo). Hoje, para uma tarefa rodar fora do horário, é preciso reiniciar o processador |
| Sinal de vida | O processador escreve "processador ativo" no log a cada 60 s (`WORKER_HEARTBEAT_SECONDS`), mas não grava no banco: o servidor não tem como saber se ele está ligado |
| Execução interrompida | Se o processador para no meio, a execução fica sem `terminada_em` para sempre |
| O que o colaborador vê hoje | No Início: o CDI, os índices e o Investidor10, cada um com a última execução; no catálogo: a coleta do pregão e a importação. O Início diz "O acompanhamento da coleta de dados chega nas próximas versões" |
| Retenção | Nada apaga as execuções hoje. A cota da brapi sem token é contada pelas consultas das execuções do ciclo do plano (`requestsSince`), e os eventos corporativos rodam fora do domingo se nunca rodaram (pela última execução) |
| Menu do topo do colaborador | Início, Calendário, Ativos e Meu perfil; a 480 px, só a marca e esses quatro cabem |

## 5. Comportamento esperado

### 5.1 Rotas

Todas só para o colaborador (403 para usuário, 401 sem sessão).

| Rota | Detalhes |
|---|---|
| `GET /api/collaborator/tasks` | As 9 tarefas, na ordem do §4.2, cada uma com: `task`, `source`, `schedule`, `lastRun` (início, fim, situação, registros, ativos afetados, número de erros) ou `null`, `running` (desde quando) ou `null`, `pendingRequest` (quando foi pedido) ou `null` e `canRequest` (com o motivo quando não pode: em andamento, já pedida, coleta desligada). E `processor`: `lastSeenAt` e `stopped` (sem sinal há mais de 3 minutos) |
| `GET /api/collaborator/tasks/:task/runs?offset=` | O histórico da tarefa, 50 por vez, com `hasMore` e `total`; cada execução com início, fim, situação, registros, ativos afetados, período, consultas e cota, totais, número de erros e quem pediu (`requestedBy`, o nome, ou `null`). Tarefa desconhecida: 404 `task_not_found` |
| `GET /api/collaborator/runs/:id/errors?offset=` | Os erros da execução, 100 por vez: ticker (ou `null`), dia (ou `null`) e mensagem. Execução que não existe (ou já limpa): 404 `run_not_found` |
| `POST /api/collaborator/tasks/:task/requests` | Grava o pedido: 202 com `requestedAt`. 409 `run_already_requested` (já há um pendente), `run_in_progress` (a tarefa está rodando) ou `source_disabled` (Investidor10 desligado); 404 `task_not_found` |

### 5.2 O processador

| Quando | O quê |
|---|---|
| Ao iniciar | Fecha as execuções sem fim como falha, com o erro "Interrompida: o processador parou antes de terminar"; depois roda as tarefas, como já faz |
| A cada minuto | Grava o sinal de vida (`estado_processador.visto_em`) |
| A cada 15 segundos | Pega os pedidos pendentes. Para cada um cuja tarefa não está rodando: roda a tarefa como no §4.2 e marca o pedido como atendido, com a execução que ela gravou, ou "nada a fazer" quando não gravou nenhuma. Pedido de tarefa em andamento espera a vez |
| Uma vez por dia | Junto com as outras limpezas: apaga as execuções (com os erros) e os pedidos atendidos com mais de 90 dias, menos a última execução de cada tarefa |

### 5.3 Telas

| Situação | Tela |
|---|---|
| Início do colaborador | Painel "Tarefas de dados": "Tudo em dia", "N tarefas com falha" ou "Processador parado desde 14:05", e **Abrir as tarefas**. O texto "O acompanhamento da coleta de dados chega nas próximas versões" sai |
| Tela Tarefas | No topo, o estado do processador ("Ligado, visto há 40 s" ou "Parado desde 14:05", com a explicação de que nada roda nem é atendido sem ele). Depois, a lista das tarefas do §4.2, cada uma com **Executar agora** e **Ver histórico** |
| Histórico | As execuções (50 por vez), cada uma com **Ver erros** quando tem; os erros (100 por vez) abaixo dela |
| Pedido | O botão vira "Pedido enviado às 10:15, aguardando o processador"; depois "Em andamento desde 10:15"; no fim, o resultado é anunciado e aparece na lista |
| 480 px | A lista vira cartões, um embaixo do outro; o histórico e os erros também; nada passa da largura |

Em português e em inglês, pelo teclado, a 480 px e com contraste; a situação nunca é só a cor (RNF04, RNF18, RNF20).

## 6. Modelo de dados

| Tabela | Mudança | Restrições |
|---|---|---|
| `pedido_execucao` (nova) | `id`, `tarefa` (`tarefa_ingestao`), `pedido_em`, `colaborador_id` (nulo se a conta sair), `atendido_em`, `execucao_id` (nulo quando não houve execução), `resultado` (`executada` ou `nada_a_fazer`, depois de atendido) | Um pedido pendente por tarefa (índice único parcial onde `atendido_em` é nulo); `colaborador_id` com `ON DELETE SET NULL`; `execucao_id` com `ON DELETE SET NULL` |
| `estado_processador` (nova) | Uma linha só: `visto_em` | Chave fixa (`id = 1`) |
| `execucao_tarefa`, `erro_execucao` | Nenhuma coluna nova | A limpeza apaga as execuções antigas; os erros saem junto (já em cascata) |

A migração tem `down.sql` (RNF17) e passa no `npm run db:check`. No `modelo_dominio.md`, EXECUCAO_TAREFA e ERRO_EXECUCAO deixam de ser só previstas (†) e entram PEDIDO_EXECUCAO e o estado do processador.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A tela Tarefas lista as 9 tarefas com a fonte, quando roda, a situação da última execução (com ícone e texto), quando começou e quanto durou, os registros, os ativos afetados e o número de erros, primeiro as com falha ou parcial; e o estado do processador |
| CA02 | O histórico de cada tarefa vem 50 por vez, com o período, as consultas e a cota, os totais conhecidos com nome nos dois idiomas e quem pediu; os erros de uma execução vêm 100 por vez, com o ticker, o dia e a mensagem (marcada `lang="pt-BR"` com o app em inglês) |
| CA03 | **Executar agora** grava o pedido com quem pediu e quando; só um pendente por tarefa (409); recusado com a tarefa rodando ou com o Investidor10 desligado; o processador atende em até 15 s quando a tarefa está parada, ou logo depois de ela terminar; faz o que o §4.2 diz para cada tarefa; marca o pedido com a execução gravada, ou com "nada a fazer" |
| CA04 | O processador grava o sinal de vida a cada minuto; sem sinal há mais de 3 minutos, a tela e o Início dizem que ele está parado e desde quando; ao iniciar, a execução que ficou sem fim vira falha com a mensagem de interrompida |
| CA05 | A limpeza diária apaga as execuções, os erros e os pedidos atendidos com mais de 90 dias, menos a última execução de cada tarefa; a cota da brapi e a regra dos eventos corporativos continuam certas depois dela |
| CA06 | Só o colaborador acessa: usuário 403, sem sessão 401; tarefa desconhecida 404 `task_not_found`; execução que não existe 404 `run_not_found` |
| CA07 | O Início do colaborador mostra o painel "Tarefas de dados" com o resumo e o link; a tela se atualiza a cada 15 s enquanto aberta e anuncia o fim de uma execução pedida; em português e inglês, pelo teclado, a 480 px e com contraste |
| CA08 | Migração com `down.sql`, desfeita e refeita, sem diferença no `npm run db:check`; `modelo_dominio.md` e o mapa (OPEN-40) atualizados |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-40 | ✅ Resolvida com a aprovação (16/11/2026), pela decisão 5 do §4.1: execuções, erros e pedidos atendidos por 90 dias, guardando a última execução de cada tarefa |
| OPEN-43 | O diagrama de casos de uso continua sem o caso "Monitorar a ingestão"; fica para a atualização do diagrama |
| Hospedagem | Com o servidor e o processador em máquinas diferentes, os 15 segundos e os 3 minutos continuam valendo: os dois só conversam pelo banco |

## 9. Verificação (16/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Nomes na resposta | `GET /api/collaborator/tasks` devolve `sources` (uma lista: a importação do catálogo usa a brapi e a B3), `runningSince`, `pendingRequestAt` e `blockedReason` (`running`, `requested` ou `source_disabled`; `null` quando dá para pedir), no lugar de `source`, `running`, `pendingRequest` e `canRequest`. No histórico, quem pediu vem em `request`: `{ name }` (com `name` nulo se a conta saiu) ou `null` quando a execução não veio de um pedido. Os tipos ficam em `packages/shared/src/tasks.ts` |
| Processador parado | `estado_processador` guarda também `intervalo_segundos` (o `WORKER_HEARTBEAT_SECONDS`). Parado é sem sinal há mais de 3 minutos **ou** há mais de três batidas, o que for maior: com um intervalo configurado acima de 1 minuto, o processador ligado não aparece como parado |
| Horários num lugar só | `INGESTION_SCHEDULE` (`api/src/modules/market-data/domain/task-schedule.ts`) tem a fonte e quando cada tarefa roda; o processador agenda por ele (`workerTiming`) e o servidor o mostra. O CDI e os índices viraram uma tarefa agendada cada, com os dois horários |
| Uma execução por vez | O processador guarda numa lista só as tarefas que estão rodando, pelo horário ou por pedido: o pedido com a tarefa rodando espera a vez, e o horário não começa outra execução enquanto a do pedido roda. O pedido de uma tarefa que o processador não conhece (uma versão mais antiga dele) é marcado como atendido, sem rodar nada |
| O que cada "Executar agora" chama | O Investidor10 roda com o escopo `retry` (os nunca visitados e os que deram erro na última visita). A cotação do pregão, com `collect({ force: true })`: só dentro do pregão (das 10:30 até meia hora depois do fechamento), sem esperar o próximo horário de 30 minutos, mas conferindo o calendário e a proteção da cota. Os eventos corporativos rodam mesmo fora do domingo. As outras fazem o que fariam no horário |
| Relógios de duas máquinas | A restrição "atendido depois de pedido" saiu da migração: o pedido é gravado com o relógio do servidor e atendido com o do processador, que na hospedagem podem estar em máquinas diferentes |
| Tela | Os horários das tarefas seguem o idioma ("09:00 AM" em inglês). "0 registros" no plural: em português, o i18next trata 0 como singular, e a forma `_zero` corrige. Depois do **Executar agora**, o foco vai para a linha "Pedido enviado…" do próprio cartão (o botão fica desativado, e a página não pula para o aviso do topo). Com 640 px ou menos, as execuções do histórico viram cartões, com o rótulo na linha do valor |
| Início do colaborador | "Tarefas de dados" entra em "Disponível agora", e o bloco "O que vem por aí" do colaborador sai (ele só tinha o acompanhamento da coleta) |
| Testes | Os ids das execuções falsas (`InMemoryTaskRuns`) viraram UUID, porque a rota dos erros confere o formato |
| Pré-visualização | A ponte falsa (`app/.previa`, fora do Git) ganhou as tarefas: `?processor=stopped` e `?processor=never`, e o "Executar agora" passa por pedido enviado, em andamento e terminada (a cotação do pregão termina em "nada a fazer") |

| Critério | Resultado |
|---|---|
| CA01 | ✅ `task-routes.test.ts`: as 9 tarefas, as com falha ou parcial primeiro, com a fonte e quando rodam. `prisma-task-monitor.db.test.ts`: de cada tarefa, a última execução terminada e a que está em andamento. Pré-visualização: o processador no topo; o fechamento diário parcial e o Investidor10 com falha primeiro; cada situação com ícone e texto, além da cor ("Parcial", "Falha", "Aguardando publicação"); "hoje às 08:00 · 47 s · 709 registros · 709 ativos · 3 erros" |
| CA02 | ✅ `task-routes.test.ts`: histórico 50 por vez, com quem pediu; erros 100 por vez, com o ticker. `prisma-task-monitor.db.test.ts`: período, cota e totais; os erros sem dia primeiro. Pré-visualização: "50 de 60 execuções" e, no **Mostrar mais**, "60 de 60"; os 22 totais conhecidos com nome nos dois idiomas; **Ver os 3 erros** com o ticker, o dia e a mensagem, que com o app em inglês continua em português, marcada com `lang="pt-BR"` |
| CA03 | ✅ `task-routes.test.ts`: o pedido gravado com quem pediu (202), o segundo recusado (409 `run_already_requested`), e recusado com a tarefa rodando (`run_in_progress`) e com o Investidor10 desligado (`source_disabled`, com o motivo na lista). `worker.test.ts`: atendido em até 15 s com o "Executar agora" da tarefa; com a tarefa rodando, o pedido espera. `prisma-task-monitor.db.test.ts`: um pendente por tarefa; atendido com a execução ou com "nada a fazer". `intraday-collection.test.ts` e `investidor10-collection.test.ts`: as duas exceções do §4.1. Pré-visualização: "Pedido enviado hoje às 20:27, aguardando o processador." com o botão desativado e "Já há um pedido aguardando."; depois, "Execução terminada: Investidor10 (indicadores e proventos), sucesso, 38 registros."; na cotação do pregão, "nada a fazer agora. Fora do horário do pregão, ou sem cota." ⏳ Ver com o processador de verdade (ligar só combinando antes) |
| CA04 | ✅ `worker.test.ts`: o sinal de vida a cada batida, com o intervalo; uma falha ao gravar não derruba o processador. `task-routes.test.ts`: ligado com sinal recente, parado depois de 3 minutos. `prisma-task-monitor.db.test.ts`: uma linha só, sempre o último sinal; ao iniciar, a execução sem fim vira falha com "Interrompida: o processador parou antes de terminar". Pré-visualização: "Parado desde hoje às 14:05." com a explicação, e no Início "processador parado desde hoje às 14:05" |
| CA05 | ✅ `prisma-task-monitor.db.test.ts`: saem as execuções (com os erros) e os pedidos atendidos com mais de 90 dias, menos a última execução de cada tarefa; o pedido pendente fica. A cota da brapi conta as consultas desde o início do ciclo (no máximo um mês) e os eventos corporativos olham a última execução, que sempre fica |
| CA06 | ✅ `task-routes.test.ts`: usuário 403, sem sessão 401, tarefa desconhecida 404 `task_not_found`, execução que não existe (ou com id fora do formato) 404 `run_not_found` |
| CA07 | ✅ Pré-visualização: o painel "Tarefas de dados" no Início ("processador ligado · 2 tarefas com falha", em âmbar, com **Abrir as tarefas**); a tela se atualiza a cada 15 s e anuncia o fim do pedido (região `role="status"`); em inglês ("Data tasks", "Every day at 09:00 AM and 06:00 PM", "Run now"); pelo teclado (Enter no **Executar agora** leva o foco para "Pedido enviado…", com contorno); a 480 px, sem rolagem lateral, com o histórico e os erros em cartões; temas claro e escuro, com os tons de sucesso, aviso e erro que o app já usa. `tasks.test.ts`: a duração, os horários no idioma, o "hoje às" no horário de Brasília e o "há 40 segundos". ⏳ Ver no Electron |
| CA08 | ✅ Migração `20261116180000_monitoramento_tarefas` com `down.sql`, desfeita e refeita no banco de teste; `npm run db:check` sem diferença; aplicada no banco de desenvolvimento. `modelo_dominio.md` (EXECUCAO_TAREFA, ERRO_EXECUCAO, PEDIDO_EXECUCAO e ESTADO_PROCESSADOR) e o mapa v1.57 (OPEN-40 resolvida) |

Total: **1.082 testes** passando (25 novos), com o banco de teste, mais lint, tipos e formatação.
