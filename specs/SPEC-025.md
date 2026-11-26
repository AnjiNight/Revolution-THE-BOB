# SPEC-025 — Planos e assinatura com pagamento simulado

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 22/11/2026, a pedido da Nicoly ("pode começar a próxima spec"); aprovada por ela no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9) |
| Fase | 6 — Assinatura ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should |
| Depende de | [SPEC-002](SPEC-002.md) (conta e sessão), [SPEC-011](SPEC-011.md) (tarefas do processador), [SPEC-034](SPEC-034.md) (exportação e exclusão de dados), [SPEC-045](SPEC-045.md) (visão do usuário) |
| Muda | O banco (planos, assinaturas e pagamentos simulados), o servidor (rotas de plano e a verificação de plano nos recursos premium), o processador (renovação e expiração), o app (tela Plano e os recursos com cadeado) e o mapa |
| Requisitos | RF32, RF33; RNF04, RNF12, RNF18 |
| ADRs | [DA12](../adr/DA12-autorizacao-planos-no-servidor.md) (plano verificado no servidor), [DA15](../adr/DA15-carater-educacional.md) (caráter educacional), [DA16](../adr/DA16-cotacoes-por-plano.md) (cotações por plano, na SPEC-026) |
| Resolve | OPEN-25 (fluxo da assinatura e ator "Gateway de pagamento", INC-01) e OPEN-26 (lista de recursos premium) |

---

## 1. Objetivo

O usuário vê os planos, **assina o plano Assinante com pagamento simulado** (nenhum dado de cartão, nenhuma cobrança), acompanha a validade e cancela quando quiser. O servidor passa a saber quem tem assinatura ativa e **bloqueia os recursos premium** para quem não tem, e o app mostra esses recursos com um cadeado e o caminho para assinar.

## 2. Valor

- **Usuário:** acesso a recursos avançados, sabendo sempre o que tem e até quando.
- **Sistema:** sustenta o modelo com plano gratuito e assinatura (OBJ06) e prepara as Specs premium que vêm depois: cotações com menor atraso (SPEC-026) e cenários (SPEC-031).
- **Apresentação:** o fluxo completo de assinatura pode ser demonstrado sem pagamento real e sem guardar dado financeiro.

## 3. Escopo

### 3.1 Inclui

1. **Dois planos:** Gratuito e Assinante (mensal ou anual).
2. **Assinar** com pagamento simulado, **cancelar** e **ver o histórico** de pagamentos simulados, na nova tela **Plano**.
3. **Renovação e expiração** pelo processador, uma vez por dia.
4. **Verificação de plano no servidor** (DA12) e os **recursos premium** da decisão 3.
5. O **cadeado** nos recursos premium do app, com o link para a tela Plano.
6. As assinaturas na **exportação e na exclusão de dados** (SPEC-034).

### 3.2 Não inclui

- **Pagamento real**, gateway ou qualquer campo de cartão, CPF ou dado bancário (fora do escopo nos requisitos §1.1).
- **Cotações com menor atraso** para o assinante: ficam na SPEC-026, que usa a verificação de plano desta Spec.
- **Cenários por sentimento** (SPEC-031), ainda bloqueados pelas OPEN-33 e OPEN-34.
- **Cupom, período de teste, reembolso e troca entre mensal e anual no meio do período.**
- **Tela do colaborador para dar ou tirar assinaturas** (decisão 6).

## 4. Decisões

### 4.1 Recomendações para aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Planos e preços** | **Gratuito** (R$ 0) e **Assinante**, com dois períodos: **mensal, R$ 19,90 por 30 dias**, e **anual, R$ 199,00 por 365 dias** (dois meses de desconto). Os preços ficam numa tabela, não no código | Dois planos bastam para o RF32 e para a DA16. Preços realistas deixam a demonstração crível |
| 2 | **Pagamento simulado** (OPEN-25, INC-01) | Sem gateway e **sem nenhum campo de pagamento**: a tela mostra o plano, o valor, a validade e o aviso "Pagamento simulado: nenhuma cobrança é feita e nenhum dado de pagamento é pedido"; o botão **Confirmar assinatura** grava a assinatura e um pagamento simulado aprovado. O ator "Gateway de pagamento" sai do diagrama de casos de uso | O requisito diz que o pagamento é simulado. Pedir um cartão, mesmo falso, ensinaria o usuário a digitar dados de cartão num app acadêmico (DA15) e traria um dado sensível sem necessidade |
| 3 | **Recursos premium** (OPEN-26) | Nesta Spec: **Comparar carteiras** (SPEC-022) e **Baixar relatório (PDF)** (SPEC-038). Depois: **cotações com menor atraso** (SPEC-026) e **cenários** (SPEC-031). Continuam gratuitos: carteiras (até 20), lançamentos, rentabilidade, benchmarks, distribuição, ficha do ativo, notícias, notificações e Mercado hoje | São recursos "a mais" sobre a carteira; tudo o que o usuário precisa para simular continua gratuito. Bloquear o essencial deixaria o app sem graça para quem não assina |
| 4 | **Duração, renovação e cancelamento** (OPEN-25) | A assinatura vale do momento da confirmação até o fim do período. **Renova sozinha** no fim, com um novo pagamento simulado, enquanto não for cancelada. **Cancelar** desliga a renovação: o acesso continua até o fim do período já "pago", e depois a conta volta ao Gratuito. Pode **reativar** a renovação antes do fim. Depois de expirada, assinar de novo começa um período novo | É o comportamento que o usuário conhece dos serviços por assinatura, e nada é perdido ao cancelar |
| 5 | **O que acontece com o premium ao expirar** | Nada é apagado: o relatório já baixado é do usuário, e a comparação só deixa de abrir. Os botões ganham o cadeado | Os dois recursos não guardam dados próprios |
| 6 | **Colaborador** | O colaborador **não tem plano** e não é bloqueado. Na Visão do usuário (SPEC-045), ele vê os recursos premium liberados, com o aviso "Visão do usuário: recursos do Assinante liberados para conferência". Não há tela para o colaborador dar assinaturas | O colaborador precisa conferir tudo. Dar assinatura de graça seria uma regra nova, sem pedido |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **"Assinante" não é perfil guardado** | O perfil continua `usuario` ou `colaborador` (como já diz o `schema.prisma`); "assinante" é **calculado**: assinatura com início ≤ agora < fim. O servidor confere a cada pedido premium, sem confiar no app | Não há perfil para manter em dia; o vencimento vale no instante certo, mesmo antes da tarefa diária |
| **Banco** | `plano` (código `gratuito`/`assinante_mensal`/`assinante_anual`, nome, preço em centavos, duração em dias, ativo); `assinatura` (usuário, plano, início, fim, renovação automática, cancelada em, criada em); `pagamento_simulado` (assinatura, valor em centavos, período de/até, situação `aprovado`, registrado em). Uma só assinatura com fim no futuro por usuário. Valores e datas não mudam depois de gravados (DA09) | Histórico completo e simples de exportar |
| **Renovação** | Nova tarefa diária **"Renovar assinaturas"** (00:15, Brasília) na tela Tarefas, com "Executar agora": para cada assinatura vencida com renovação ligada, grava o pagamento simulado do novo período e estende o fim; sem renovação, não faz nada (ela simplesmente deixa de valer). A tarefa conta as renovadas e as expiradas | Segue o padrão das outras tarefas (SPEC-011) |
| **Rotas** | `GET /api/plans` (planos ativos, sem sessão, para a tela de planos); `GET /api/subscription` (a minha: plano, início, fim, renovação, `active`, pagamentos); `POST /api/subscription` (`{ plan }`) assina; `POST /api/subscription/cancel` e `POST /api/subscription/resume`. Só o perfil usuário assina (403 para o colaborador) | — |
| **Bloqueio** | A comparação de carteiras (`GET /api/portfolios/comparison`) devolve **403 `premium_required`** para quem não tem assinatura ativa. O **relatório PDF** é a fotografia da tela, montada no app com dados que o usuário gratuito já vê (SPEC-038); por isso, o app consulta `GET /api/subscription` antes de gerar o PDF, e esse é o único bloqueio feito no app. A alternativa é deixar o PDF fora do premium | DA12: o servidor bloqueia o que só o assinante recebe; o PDF não traz dado que o gratuito não receba |
| **App** | Item **Plano** no menu do usuário. A tela mostra o plano atual ("Gratuito" ou "Assinante mensal, até 22/12/2026, renova sozinho"), os dois cartões de plano com o que cada um inclui, os botões **Assinar**, **Cancelar renovação** ou **Reativar renovação** e a lista de pagamentos simulados. Confirmar assinatura e cancelar pedem confirmação numa caixa de diálogo | — |
| **Cadeado** | Os botões premium continuam visíveis, com um ícone de cadeado e "Recurso do plano Assinante"; ao clicar, abre a tela Plano. Se o servidor responder `premium_required` (a assinatura venceu com a tela aberta), aparece a mesma mensagem | Quem não conhece o recurso não tem como querer assinar |
| **Aviso de vencimento** | No Início, 3 dias antes do fim de uma assinatura cancelada: "Sua assinatura termina em 22/12/2026" | — |
| **Dados pessoais (SPEC-034)** | A exportação inclui assinaturas e pagamentos simulados; a exclusão da conta apaga os dois | DA13 |
| **Sem conexão (SPEC-032)** | A leitura da assinatura entra na cópia local; assinar e cancelar pedem conexão | Escrita offline não existe (DA08) |
| **Modelo de domínio e casos de uso** | PLANO, ASSINATURA e PAGAMENTO_SIMULADO entram no modelo de domínio; o ator "Gateway de pagamento" sai e o caso de uso "Assinar plano" fica com o usuário e o sistema; INC-01, OPEN-25 e OPEN-26 marcadas como resolvidas no mapa | — |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Usuário gratuito clica em **Comparar carteiras** | Abre a tela Plano, com "Comparar carteiras é um recurso do plano Assinante" |
| Assina o mensal em 22/11/2026, 10:00 | Assinante até 22/12/2026, 10:00; um pagamento simulado de R$ 19,90 (22/11 a 22/12) |
| Cancela em 30/11 | Continua assinante até 22/12; a tela diz "Termina em 22/12/2026, sem renovação"; o Início avisa a partir de 19/12 |
| Não cancela | Em 23/12, 00:15, a tarefa grava o pagamento de 22/12 a 21/01 e estende o fim |
| Cancelou e passou de 22/12, 10:00 | O servidor já devolve `premium_required`, mesmo antes da tarefa; a tela mostra "Gratuito" |
| Um app alterado chama `/api/portfolios/comparison` sem assinatura | 403 `premium_required` |
| Colaborador na Visão do usuário | Comparar carteiras e o relatório liberados, com o aviso; a tela Plano mostra que o colaborador não tem plano |

## 5. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | `GET /api/plans` lista os três planos com preço e duração; a tela Plano mostra o plano atual, os planos, o aviso de pagamento simulado e nenhum campo de pagamento |
| CA02 | Assinar grava a assinatura e o pagamento simulado; uma segunda assinatura ativa é recusada (409); o colaborador recebe 403 |
| CA03 | Cancelar mantém o acesso até o fim do período; reativar volta a renovação; depois do fim, sem renovação, o servidor trata a conta como gratuita no mesmo instante |
| CA04 | A tarefa "Renovar assinaturas" renova as que vencem com renovação ligada (com o pagamento simulado do novo período), registra a execução e aparece na tela Tarefas com "Executar agora" |
| CA05 | Sem assinatura ativa, a comparação de carteiras devolve 403 `premium_required` e o app não gera o relatório PDF; os dois botões mostram o cadeado e levam à tela Plano; com assinatura, funcionam como hoje |
| CA06 | O colaborador, na Visão do usuário, usa os recursos premium com o aviso |
| CA07 | A exportação de dados inclui assinaturas e pagamentos simulados; a exclusão da conta os apaga |
| CA08 | Testes de domínio (validade, renovação, cancelamento), das rotas (incluindo o 403 com um pedido feito à mão), do repositório no `simulador_test` e E2E da tela Plano e do cadeado; em português e inglês e a 480 px |
| CA09 | Migração com `down.sql` e `npm run db:check` sem diferença; modelo de domínio, casos de uso e mapa atualizados |

## 9. Implementação (22/11/2026)

| Parte | O que mudou |
|---|---|
| Banco | Migração `20261122100000_assinaturas` (com `down.sql`): tabelas `plano` (os três planos gravados pela migração), `assinatura` e `pagamento_simulado`, apagadas em cascata com a conta; o banco recusa assinatura do Gratuito, período vazio e pagamento zerado; valor `renovacao_assinaturas` em `tarefa_ingestao` |
| Regra | `subscriptions/domain`: assinante é quem tem assinatura começada e (com fim no futuro ou com a renovação ligada). Com a renovação ligada, o acesso continua nas horas entre o vencimento e a tarefa diária; cancelada, termina no instante do fim |
| Servidor | `GET /api/plans` (sem sessão), `GET /api/subscription`, `POST /api/subscription` (`{ plan }`, 201; 409 se já assina; 400 com plano inválido), `POST /api/subscription/cancel` e `/resume` (404 sem assinatura). Assinar, cancelar e reativar: só o perfil usuário (403 para o colaborador). Dois pedidos de assinatura ao mesmo tempo criam uma só (a linha da conta fica travada na transação) |
| Bloqueio | `GET /api/portfolios/comparison` com o preHandler `requirePremium`: 403 `premium_required` sem assinatura ativa; o colaborador passa. O relatório PDF confere a assinatura no app antes de gerar |
| Processador | Tarefa "Renovação das assinaturas" às 00:15 (Brasília), na tela Tarefas com "Executar agora" e a fonte "o próprio app": grava o pagamento simulado de cada período vencido (mais de um, se o processador ficou parado) e conta renovadas, pagamentos e terminadas sem renovação |
| Dados pessoais | "Baixar meus dados" passa à versão 8, com as assinaturas e os pagamentos simulados |
| App | Item **Plano** no menu do usuário (também na Visão do usuário); tela Plano com o aviso de pagamento simulado, o plano atual, os três cartões, a confirmação numa caixa de diálogo, cancelar e reativar a renovação e a tabela de pagamentos simulados; nenhum campo de pagamento. Cadeado ("Recurso do plano Assinante") em Comparar carteiras, "Comparar as duas" e Baixar relatório (PDF), que levam à tela Plano com o recurso explicado; a comparação mostra "Ver planos" se o servidor responder `premium_required`. Aviso "Sua assinatura termina em…" no Início, nos 3 dias antes do fim de uma cancelada. Em pt-BR e inglês |
| Documentos | Modelo de domínio (PLANO, ASSINATURA, PAGAMENTO_SIMULADO), nota nos casos de uso (sem o ator "Gateway de pagamento") e mapa (INC-01, OPEN-25 e OPEN-26 resolvidas) |
| Validação | 1.275 testes (com o banco `simulador_test`; novos: regra, renovação, rotas com o 403 num pedido feito à mão, exportação e o repositório no PostgreSQL, com a corrida de dois pedidos) e 38 roteiros E2E (6 novos em `tests/e2e/plan.e2e.ts`: assinar sem nenhum campo de pagamento, cancelar, o cadeado, o aviso de fim, o colaborador sem o item e em inglês a 480 px). No servidor de desenvolvimento, `/api/plans` respondeu os três planos e o processador rodou a renovação no banco `simulador` |
