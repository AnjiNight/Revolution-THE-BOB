# SPEC-030 — Fontes de notícias do usuário e tela Notícias

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 26/11/2026, a pedido do Luís ("vamo fazer a spec 030"), com as escolhas dele do §4.1; aprovada por ele no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9) |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)) |
| Prioridade | Could (proposta: RF45 a RF47, novos) |
| Depende de | [SPEC-027](SPEC-027.md) (fontes e coleta), [SPEC-028](SPEC-028.md) (vínculo com os ativos), [SPEC-029](SPEC-029.md) (notícias na ficha), [SPEC-044](SPEC-044.md) (sentimento), [SPEC-034](SPEC-034.md) (exportação e exclusão de dados) |
| Muda | O banco (`preferencia_fonte`, e o tipo `usuario` em `fonte_noticia`), o processador (coleta dos feeds dos usuários), o servidor (rotas das fontes do usuário e da tela Notícias; as notícias da ficha seguem as preferências), o app (tela **Notícias** e **Minhas fontes** no menu do usuário), a exportação e a exclusão de dados (SPEC-034), `requisições.md` (RF45 a RF47, RB29 e RB30, versão 1.15) e o mapa (OPEN-32 resolvida) |
| Requisitos | RF45, RF46, RF47 (novos); RB29, RB30 (novas); RNF09, RNF11, RNF13, RNF18, RNF20 |
| Casos de uso | Nenhum no diagrama (ver OPEN-43); Visão §18 |
| Drivers | OBJ02, QA08, RES05 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA11](../adr/DA11-noticias-ia-modulo-isolado.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA19](../adr/DA19-fontes-de-noticias.md), [DA20](../adr/DA20-modelo-ia-noticias.md) |
| Resolve | OPEN-32 (RFs das fontes do usuário, limite de fontes e conversão da prioridade em peso) e os pontos em aberto 2 e 3 da DA19 |

---

## 1. Objetivo

1. **Minhas fontes:** o usuário escolhe quais fontes curadas acompanha, dá a cada fonte uma **prioridade** (Alta, Média ou Baixa) e adiciona até **10 feeds RSS ou Atom próprios**. A fonte pai (Investidor10) aparece sempre ligada e com a maior prioridade.
2. **Tela Notícias:** o usuário passa a ter uma tela só de notícias, com as notícias das **fontes dele**, filtros por **ativo, setor, período, sentimento e fonte**, e um resumo do **tom das notícias**, ponderado pelas prioridades dele.
3. **Ficha do ativo:** as notícias da ficha (SPEC-029) passam a seguir as mesmas preferências.

Até aqui, todo usuário via as mesmas notícias, de todas as fontes ligadas pelo colaborador.

## 2. Valor

- **Usuário:** acompanha o que escolheu (Visão §18: "adicionar, remover, ativar, desativar, escolher quais fontes acompanhar") e acha as notícias de uma empresa ou de um setor sem abrir ficha por ficha.
- **Sistema:** as escolhas de cada usuário não mexem no que é oficial: o treino, a avaliação do sentimento (SPEC-044) e os cenários (SPEC-031) usam só a fonte pai e as curadas (DA19).
- **Apresentação:** fecha a trilha de notícias do lado do usuário (coleta → vínculo → sentimento → ficha → tela Notícias).

## 3. Escopo

### 3.1 Inclui

1. **Preferências das fontes curadas:** ligar e desligar, e a prioridade de cada uma.
2. **Feeds próprios:** adicionar (com o teste na hora), renomear, ligar e desligar, mudar a prioridade e remover; até 10 por usuário.
3. **Coleta dos feeds próprios** no processador, com as medidas de segurança da SPEC-027 (§4.2) e uma leitura por endereço para todos os usuários que o adicionaram.
4. **Tela Notícias** no menu do usuário, com filtros, resumo do tom e a lista das notícias.
5. **Tela Minhas fontes**, aberta pela tela Notícias.
6. **Ficha do ativo** (SPEC-029) filtrada pelas preferências e ordenada pela prioridade dentro do dia.
7. **Fora do oficial:** as notícias das fontes dos usuários ficam fora da amostra rotulada, da avaliação do modelo e da lista "Últimas notícias" do colaborador.
8. **Exportação e exclusão** (SPEC-034): as fontes e as preferências do usuário.
9. **Requisitos:** RF45 a RF47, RB29 e RB30 em `requisições.md` 1.15.

### 3.2 Não inclui

- **Redes sociais, fóruns e Reddit** (DA19, ponto em aberto 4): só RSS ou Atom, sem raspar páginas.
- **Sentimento oficial** e cenários por sentimento: SPEC-031 (DA21).
- **Notícias na consulta sem conexão** (SPEC-032): a tela Notícias e Minhas fontes pedem conexão (§4.2).
- **Aviso de notícia nova** (notificação): fica para outra Spec, se fizer falta.
- **Trocar a fonte pai** ou mudar a prioridade dela (DA19).
- **Recurso de assinante:** a tela Notícias e as fontes próprias valem para todos os planos (a SPEC-025 ainda não está na `main`; se a equipe quiser, a assinatura pode mudar o limite depois).

## 4. Decisões

### 4.1 Escolhidas pelo Luís em 26/11/2026

| # | Tema | Escolha | Motivo |
|---|---|---|---|
| 1 | **Escopo** | Fontes do usuário **e** a tela Notícias com filtros por ativo, setor, período e sentimento | A SPEC-047 (branch da Nicoly) já mandou o "feed de notícias do usuário com filtros" para esta Spec; sem uma tela própria, a prioridade quase não teria onde aparecer |
| 2 | **Prioridade** (OPEN-32) | **Três níveis: Alta, Média e Baixa**, com pesos **3, 2 e 1**. A fonte pai tem peso **4**, fixo | O exemplo da DA19. É simples de escolher pelo teclado e de explicar; a fonte pai fica sempre acima de todas, como a DA19 exige |
| 3 | **Limite de feeds próprios** (OPEN-32) | **10 por usuário** | Suficiente para uso pessoal e limita a coleta no processador |

### 4.2 Recomendações para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Padrão das curadas** | Sem escolha do usuário, toda curada ligada pelo colaborador vale **ligada e Média**. A preferência só é gravada quando o usuário muda algo | Quem nunca abriu Minhas fontes vê tudo, como hoje |
| **Curada desligada pelo colaborador** | Some para todos, qualquer que seja a preferência; a preferência fica guardada e volta a valer se o colaborador religar | O colaborador continua decidindo o que é curado (SPEC-027) |
| **Feed próprio que já é fonte do app** | Se o endereço é o da fonte pai ou de uma curada, o feed não é criado: "Esta fonte já está no app" e o botão **Ligar** (se estiver desligada para o usuário) | Uma fonte, uma linha (`fonte_noticia.url` única) |
| **Mesmo endereço para vários usuários** | Uma só fonte do tipo `usuario`, lida uma vez; cada usuário tem a própria preferência (nome, prioridade, ligada). Ao sair o último usuário, a fonte e as notícias dela são apagadas | DA19 ("coletada uma vez para todos"); notícias que ninguém acompanha não ficam guardadas |
| **Nome do feed** | Opcional ao adicionar; vazio, usa o título do feed (até 80 caracteres). O nome é de cada usuário (fica na preferência) | Dois usuários podem chamar o mesmo feed de jeitos diferentes |
| **Segurança** | As regras da SPEC-027 (§4.2): só `https`, só endereço público (também depois de redirecionar), até 2 MB, 20 segundos, até 200 itens por leitura, tudo guardado como **texto puro**. Ao adicionar, o feed é lido na hora; sem itens válidos, `not_a_feed` | DA19; o mesmo código do colaborador (`address.ts`, `HttpFeedFetcher`) |
| **Ritmo da coleta** | Os feeds dos usuários são lidos a **cada 60 minutos** (as curadas continuam a cada 30), só os que têm ao menos um usuário com ele ligado | A coleta cresce com os usuários; uma hora basta para uso pessoal |
| **Feed com problema** | Mais de 3 falhas seguidas: "Com problema" na Minhas fontes. **24 falhas seguidas** (um dia): o feed é **parado** ("Parado: o endereço não responde há um dia") até o usuário tocar em **Tentar de novo**, que lê na hora | Um endereço morto não fica sendo lido para sempre (RNF13) |
| **Retenção** | As notícias das fontes dos usuários ficam por **12 meses**; as mais antigas saem na limpeza diária | Um feed pessoal pode ter centenas de itens por dia; as curadas continuam guardadas sem prazo (SPEC-027) |
| **Quem vê cada notícia** | A notícia de uma fonte do tipo `usuario` só aparece para quem tem essa fonte ligada, na tela Notícias e na ficha, com o selo **"Sua fonte"** | DA19: a fonte do usuário é dele |
| **Fora do oficial** (RB30) | O vínculo (SPEC-028) e o sentimento (SPEC-044) rodam também nas notícias das fontes dos usuários, para os filtros e o resumo. Mas elas ficam **fora** da amostra para rotular, da avaliação do modelo, da lista "Últimas notícias" e das contagens do colaborador, e dos cenários (SPEC-031) | DA19 e DA20: uma fonte ruim ou mal-intencionada não contamina o modelo nem os números oficiais |
| **Colaborador** | Na tela Fontes de notícias, uma linha só: "Fontes de usuários: 37 endereços, 2 com problema, 1 parado", sem os endereços nem quem os adicionou. As execuções da tarefa nova não guardam o endereço, só o id da fonte | Os endereços que alguém acompanha dizem algo sobre a pessoa (DA13) |
| **Ordem das notícias** | Na tela Notícias e na ficha: por **dia de publicação** (Brasília), do mais novo para o mais antigo; **dentro do mesmo dia**, da fonte de maior peso para a de menor; empate pelo horário | A prioridade define a ordem (DA19) sem esconder uma notícia de hoje atrás de uma de ontem |
| **Tom das notícias** (sentimento personalizado) | No topo da tela Notícias, para o filtro escolhido: a parte positiva, neutra e negativa, **ponderada pelos pesos** (soma dos pesos de cada tom sobre a soma dos pesos das notícias classificadas). Só aparece quando o sentimento está visível (SPEC-044) e com **pelo menos 10 notícias classificadas**; antes disso, "Poucas notícias para resumir o tom". Sempre com as frases "Personalizado pelas suas fontes e prioridades; não é o sentimento oficial do app." e "Resume o tom das manchetes; não é recomendação de investimento." | DA19 pede a diferença clara entre o personalizado e o oficial; RB18 e RB19 (caráter educacional) |
| **Filtros** | **Ativo** (busca por ticker ou nome no catálogo), **Setor** (os setores do catálogo, SPEC-021), **Período** (7 dias, **30 dias** por padrão, 90 dias, 12 meses), **Sentimento** (todos, positivas, neutras, negativas; só quando visível) e **Fonte** (as do usuário). Ativo e setor usam as notícias em que o ativo é **principal ou citado** (como a ficha, SPEC-029 §4.1, decisão 2) | As listas e agendas encheriam todos os filtros com as mesmas notícias |
| **Página** | 20 notícias por vez, com **Ver mais**; o total do filtro no topo | Como a ficha (10) e as tarefas |
| **Cada notícia** | Fonte (com "Sua fonte" quando própria), data e hora, título, resumo, o tom (quando visível), os ativos vinculados como botões que abrem a ficha, e o link **"Ler em {fonte}"**. Nunca o texto completo (SPEC-027, decisão 4) | O mesmo cartão da ficha, mais os ativos |
| **Sem conexão** | A tela Notícias e Minhas fontes mostram "Sem conexão: as notícias voltam quando o app se reconectar"; nada é guardado na cópia local | A cópia local (SPEC-032) tem limite de tamanho, e as notícias mudam a cada hora |
| **Colaborador na Visão do usuário** (SPEC-045) | As rotas do usuário desta Spec aceitam o colaborador, com as preferências da própria conta | Ele confere a tela como o usuário a vê |
| **Exportação e exclusão** (SPEC-034) | A exportação (versão 8) ganha `newsSources`: os feeds próprios (nome, endereço, prioridade, ligado, adicionado em) e as preferências das curadas (nome, prioridade, ligada). A exclusão da conta apaga as preferências e, de cada feed próprio sem outro usuário, a fonte e as notícias | DA13 e RNF11 |
| **Auditoria** | As mudanças do usuário nas próprias fontes **não** vão para o registro de auditoria | A auditoria registra ações do colaborador; as do usuário são dados dele |
| **Textos** | Português e inglês; as notícias continuam com `lang="pt-BR"` e o selo "Em português" com a interface em inglês (SPEC-029) | RNF20 |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Ana nunca abriu Minhas fontes | A tela Notícias mostra a fonte pai e todas as curadas ligadas, todas Média; o Investidor10 aparece como "Fonte principal do app" |
| Ana desliga a Agência Brasil | As notícias da Agência Brasil somem da tela Notícias e das fichas para ela; para o Bruno, nada muda |
| Ana põe o InfoMoney em Alta e a Exame em Baixa | No mesmo dia, as do InfoMoney vêm antes das da Exame; no tom, cada notícia do InfoMoney vale 3 e cada uma da Exame vale 1 |
| Ana adiciona `https://www.exemplo.com.br/feed` | O feed é lido na hora: "Feed adicionado: 25 notícias encontradas". As notícias aparecem com "Sua fonte" para ela, e só para ela |
| Ana adiciona `http://exemplo.com/feed` | Recusado: "Use um endereço https" |
| Ana adiciona `https://192.168.0.10/rss` | Recusado: "Use um endereço público" |
| Ana adiciona a página inicial de um site (HTML, não feed) | Recusado: "Este endereço não é um feed RSS ou Atom" |
| Ana adiciona o endereço da Agência Brasil | "Esta fonte já está no app"; se ela a tinha desligado, o botão **Ligar** |
| Ana tenta o 11º feed | Recusado: "Você já tem 10 feeds próprios. Remova um para adicionar outro." |
| Ana e Bruno adicionam o mesmo endereço | Uma só fonte, lida uma vez por hora; Ana a chama de "Blog FII", Bruno de "Fundos" |
| Ana remove o feed e Bruno continua com ele | A fonte continua; Ana não vê mais as notícias dele. Se o Bruno também remover, a fonte e as notícias são apagadas |
| O feed da Ana falha por um dia | "Parado: o endereço não responde há um dia" e **Tentar de novo** |
| Ana filtra o setor "Financeiro" e "30 dias" | As notícias em que algum ativo do setor financeiro do catálogo é principal ou citado, das fontes dela, e o tom ponderado delas |
| O sentimento ainda não passou na avaliação (SPEC-044) | Sem filtro de sentimento, sem tom nas notícias e sem o resumo do tom |
| Notícia de um feed próprio diz "lucro recorde" da PETR4 | Ela recebe vínculo e tom e aparece na ficha da PETR4 da Ana, mas nunca entra na amostra de rótulos nem na avaliação |
| O colaborador abre Fontes de notícias | Vê "Fontes de usuários: 37 endereços, 2 com problema, 1 parado", sem os endereços |
| Ana pede a exportação dos dados | O arquivo traz os feeds e as preferências dela |

## 5. Comportamento esperado

### 5.1 Processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `noticias_feeds_usuario` (nova) | A cada 60 minutos | Lê cada fonte do tipo `usuario` não parada e com ao menos um usuário com ela ligada; grava as notícias pela chave (fonte, endereço), como as curadas; conta as falhas seguidas e para a fonte na 24ª. Uma fonte com erro não para as outras (RNF13). A execução fica registrada (SPEC-011) com o id da fonte, nunca o endereço |
| Limpeza das notícias dos feeds dos usuários (nova, entre as limpezas diárias) | Uma vez por dia | Apaga as notícias das fontes do tipo `usuario` publicadas há mais de 12 meses |
| Vínculo e sentimento (existentes) | Como hoje | Rodam também nas notícias das fontes dos usuários |

### 5.2 Rotas

Todas aceitam o usuário e o colaborador (SPEC-045). Sem sessão: 401.

| Rota | Entrada | Sucesso | Erros |
|---|---|---|---|
| `GET /api/news/my-sources` (nova) | — | A fonte pai; as curadas ligadas pelo colaborador, com `active` e `priority` do usuário; os feeds próprios, com nome, endereço, `active`, `priority`, situação (`ok`, `failing`, `stopped`), última leitura e quantas notícias há; `ownLimit` (10) e `ownCount` | — |
| `POST /api/news/my-sources` (nova) | `url`, `name` (opcional) | 201 com o feed e quantos itens a leitura achou | 400 `validation_error` (`url`: `not_https`, `private_address`, `not_a_feed`, `too_large`, `unreachable`; `name`: `too_long`); 409 `source_limit_reached`; 409 `already_added`; 409 `already_in_app` (com o id da fonte) |
| `PATCH /api/news/my-sources/:id` (nova) | `active`, `priority` (`high`, `medium`, `low`) ou, no feed próprio, `name` | 200 com a fonte | 404 `news_source_not_found` (fonte que o usuário não vê); 409 `parent_source` (a fonte pai não muda); 400 `validation_error` |
| `POST /api/news/my-sources/:id/retry` (nova) | — | 200 com o feed lido de novo e a situação | 404 `news_source_not_found`; 409 `not_stopped` |
| `DELETE /api/news/my-sources/:id` (nova) | — | 204 | 404 `news_source_not_found`; 409 `not_own_source` (fonte pai e curadas não se removem, só se desligam) |
| `GET /api/news/feed` (nova) | `asset`, `sector`, `period` (`7d`, `30d`, `90d`, `12m`), `sentiment`, `source`, `offset` | Página de 20 notícias, o total, o resumo do tom (ou o motivo de não haver) e a versão do modelo | 400 `validation_error`; 404 `asset_not_found` |
| `GET /api/assets/:id/news` e `/api/assets/:id/news/days` (SPEC-029) | Como hoje | Passam a seguir as preferências do usuário e a nova ordem | Como hoje |
| `GET /api/news/sources` (colaborador, SPEC-027) | Como hoje | Ganha `userSources`: total, com problema e parados | Como hoje |

### 5.3 Telas

- **Menu do usuário:** novo item **Notícias**, logo depois de Ativos (também na Visão do usuário).
- **Notícias:**
  - os filtros no topo (Ativo, Setor, Período, Sentimento, Fonte) e o botão **Minhas fontes**;
  - o **resumo do tom** (quando visível), com as duas frases fixas;
  - a lista, com o total, os cartões e **Ver mais**;
  - vazio: "Nenhuma notícia das suas fontes neste filtro."
- **Minhas fontes:**
  - **Fonte principal do app:** Investidor10, "sempre ligada e com a maior prioridade", sem controles;
  - **Fontes do app:** cada curada com **Ligada/Desligada** e **Prioridade** (Alta, Média, Baixa);
  - **Seus feeds (3 de 10):** cada feed com nome, endereço (o domínio), situação, Prioridade, Ligado/Desligado, **Renomear**, **Remover** (com confirmação) e, se parado, **Tentar de novo**;
  - **Adicionar feed:** endereço e nome (opcional), com o aviso "Use o endereço de um feed RSS ou Atom (https). As notícias dos seus feeds só aparecem para você e não entram nas análises oficiais do app."
- **Ficha do ativo:** "Sua fonte" nas notícias dos feeds próprios; a lista segue as preferências e a nova ordem.
- **Colaborador, Fontes de notícias:** a linha "Fontes de usuários".

Português e inglês, pelo teclado (os níveis de prioridade são um grupo de opções, não arrastar), com contraste e a 375 px sem rolagem de lado (RNF18, RNF20).

## 6. Modelo de dados

| Tabela | Mudança | Restrições |
|---|---|---|
| `fonte_noticia` | O tipo ganha `usuario`. Campo novo: `parada_em` (as falhas seguidas já ficam em `falhas_seguidas`, da SPEC-027) | `usuario`: sem `categoria`, `confiabilidade` e `licenca_conferida_em`; `url` continua única |
| `preferencia_fonte` (nova) | `usuario_id`, `fonte_id`, `ativa`, `prioridade` (`alta`, `media`, `baixa`), `nome` (só nos feeds próprios), `criada_em`, `atualizada_em` | Chave (`usuario_id`, `fonte_id`); `ON DELETE CASCADE` dos dois lados; nunca para a fonte `pai` (gatilho); no máximo 10 preferências de fontes `usuario` por usuário (conferido no serviço, na mesma transação) |
| `noticia` | Nenhuma | Índice novo por (`fonte_id`, `publicada_em`) para a limpeza e os filtros |

A migração tem `down.sql` (RNF17). `PREFERENCIA_FONTE` entra no modelo conceitual (OPEN-44).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Sem preferências, a tela Notícias mostra a fonte pai e as curadas ligadas, todas Média, e a ficha continua igual à de hoje |
| CA02 | Desligar uma curada tira as notícias dela da tela Notícias e da ficha só para aquele usuário; a curada desligada pelo colaborador some para todos |
| CA03 | A fonte pai não pode ser desligada, removida nem ter a prioridade mudada (409 `parent_source`), e o banco recusa preferência para ela |
| CA04 | Adicionar feed: `http`, endereço interno (também por redirecionamento), página que não é feed, resposta acima de 2 MB e endereço que não responde são recusados com o motivo; o 11º dá `source_limit_reached`; o endereço de uma fonte do app dá `already_in_app` |
| CA05 | O mesmo endereço adicionado por dois usuários vira uma fonte só, lida uma vez; ao sair o último, a fonte e as notícias somem |
| CA06 | A notícia de um feed próprio só aparece para quem o tem ligado, com "Sua fonte" |
| CA07 | As notícias das fontes dos usuários recebem vínculo e tom, mas nunca entram na amostra para rotular, na avaliação, nas "Últimas notícias" nem nas contagens do colaborador (teste com o banco `simulador_test`) |
| CA08 | Filtros por ativo, setor, período, sentimento e fonte, juntos ou separados, com 20 por página; ordem por dia e, dentro do dia, pelo peso (4, 3, 2, 1) |
| CA09 | O resumo do tom é a soma dos pesos por tom sobre a soma dos pesos das classificadas (teste de unidade com um exemplo à mão); só aparece com o sentimento visível e com pelo menos 10 classificadas; sempre com as duas frases fixas |
| CA10 | 24 falhas seguidas param o feed; **Tentar de novo** lê na hora; um feed com erro não atrasa os outros nem as curadas |
| CA11 | Notícias de fontes dos usuários com mais de 12 meses saem na limpeza diária; as das curadas e da fonte pai ficam |
| CA12 | A tela do colaborador mostra só os totais das fontes de usuários; as execuções não guardam o endereço |
| CA13 | A exportação traz `newsSources`; a exclusão da conta apaga as preferências e os feeds sem outro usuário |
| CA14 | Notícias e Minhas fontes em português e inglês, pelo teclado, a 375 px, e com o aviso de sem conexão; o colaborador usa as duas na Visão do usuário |
| CA15 | `requisições.md` 1.15 com RF45 a RF47, RB29 e RB30, e o mapa com a OPEN-32 resolvida e a SPEC-030 atualizada |

Novos itens de `requisições.md` (versão 1.15):

| ID | Texto | Ator | Prioridade |
|---|---|---|---|
| RF45 | Escolher quais fontes de notícias acompanhar e definir a prioridade (alta, média ou baixa) de cada uma | Usuário | Could |
| RF46 | Adicionar e remover feeds RSS ou Atom próprios, até 10 por usuário | Usuário | Could |
| RF47 | Consultar as notícias das suas fontes com filtros por ativo, setor, período, sentimento e fonte | Usuário | Could |
| RB29 | A fonte pai de notícias está sempre ligada, com a maior prioridade, e não pode ser desativada, removida nem trocada pelo usuário | — | — |
| RB30 | As notícias das fontes adicionadas pelos usuários nunca entram no treino nem na avaliação do modelo de sentimento, nem nos números oficiais do app | — | — |

## 8. Pontos em aberto

| Tema | Situação |
|---|---|
| Junção com a SPEC-047 | A SPEC-047 (branch `spec-045-visao-do-usuario`, ainda fora da `main`) marca as notícias repetidas entre fontes e mostra "Também em". Na junção: as repetidas ficam fora da tela Notícias e do tom, como da ficha, e o "Também em" não lista fontes desligadas pelo usuário nem feeds de outros usuários. O mapa das duas branches vai ter conflito na entrada da SPEC-030 |
| Limite pela assinatura | Se a SPEC-025 entrar, a equipe pode decidir um limite diferente para o assinante |
| Fontes alternativas (DA19, ponto 4) | Redes sociais e fóruns continuam fora |
| OPEN-43 | O diagrama de casos de uso continua sem "Gerenciar fontes de notícias" |

## 9. Implementação (26/11/2026)

| Parte | O que mudou |
|---|---|
| Requisitos e mapa | `requisições.md` 1.15: RF45 a RF47 (§2.5) e a nova §4.6 Notícias, com RB29 e RB30 (e a rastreabilidade). Mapa 1.74: OPEN-32 resolvida, a entrada da SPEC-030 atualizada e ela fora das bloqueadas; RF45 a RF47 na cobertura |
| Banco | Migração `20261126120000_fontes_do_usuario` (com `down.sql`): o tipo `usuario` em `fonte_noticia` (as restrições comparam o tipo como texto, porque o valor novo só vale depois do COMMIT), `parada_em`, a tabela `preferencia_fonte` (`prioridade_fonte`: alta, média, baixa), o índice (`fonte_id`, `publicada_em`) em `noticia` e a tarefa `noticias_feeds_usuario`. Dois gatilhos: `preferencia_fonte_conferir` (nada de preferência para a fonte pai, RB29; nome só no feed próprio) e `preferencia_fonte_apagar_orfa` (sem ninguém, o feed e as notícias saem: na remoção e na exclusão da conta) |
| Compartilhado | `news.ts`: `MY_NEWS_PATHS`, prioridades e pesos (`SOURCE_PRIORITY_WEIGHT`, `PARENT_SOURCE_WEIGHT` = 4), `OWN_FEEDS_LIMIT` = 10, `OWN_FEED_STOP_AFTER` = 24, `USER_NEWS_RETENTION_DAYS` = 365, as validações (`validateNewOwnFeed`, `validateUpdateMySource`, `validateNewsFeedQuery`, com o setor como `classe:código`) e `weightedTone`. `ownSource` em cada notícia da ficha; `userSources` (totais) na tela do colaborador. A exportação sobe para a versão 8, com `newsSources`. Erros de campo novos: `too_large` e `unreachable` |
| Servidor | `UserNewsService` (Minhas fontes, feed próprio lido na hora, Tentar de novo, remover e a tela Notícias com o tom). `PrismaNewsRepository`: a regra de quem vê cada notícia e o peso viram SQL (`VIEWER_VISIBLE`, `VIEWER_WEIGHT`, `VIEWER_ORDER`), usada pela tela Notícias e pela ficha (que passou a receber quem vê); `sources()`, as últimas notícias e as contagens do colaborador só com as oficiais. `PrismaSentimentRepository`: a amostra, a avaliação, as contagens e o rótulo deixam os feeds dos usuários de fora (RB30). `PrismaNewsSourcesExport` para o "Baixar meus dados". Rotas em `news-routes.ts`, para o usuário e o colaborador. O feed recém-adicionado já é vinculado e classificado no servidor, sem esperar o processador |
| Processador | `NewsCollection.userFeeds()` (tarefa `noticias_feeds_usuario`, a cada 60 minutos, na tela Tarefas): sem novas tentativas, a 24ª falha seguida para o feed; o registro da execução guarda o id da fonte e um motivo sem o endereço. A limpeza das notícias com mais de 12 meses entrou nas limpezas diárias |
| App | Tela **Notícias** (`UserNews.tsx`) no menu do usuário, logo depois de Ativos: filtros (ativo pela busca do catálogo, setor, período, sentimento só com o modelo visível, fonte), o tom ponderado com as duas frases fixas, os cartões com "Sua fonte" e os ativos (que abrem a ficha) e Ver mais. **Minhas fontes**: a fonte principal sem controles, Ligada/Desligada (`aria-pressed`) e a prioridade de cada fonte, e os feeds com renomear, remover (com confirmação) e Tentar de novo; o formulário Adicionar feed mostra o motivo da recusa no campo e, para uma fonte do app, o botão Ligar. Sem conexão, o aviso no lugar. Na ficha, "Sua fonte"; na tela do colaborador, a linha dos totais. Textos em português e inglês |
| Validação | 1.241 testes (1.084 de unidade e 157 com o banco `simulador_test`), com os novos: `user-news-routes.test.ts` (12, CA01 a CA10, CA12 e CA14), os da coleta dos feeds (3), das validações e do tom (4) e `prisma-user-news.db.test.ts` (7: os gatilhos, a fonte única por endereço, a ordem pelo peso no SQL, os filtros, a exclusão da conta, as exclusões do oficial e a exportação). 29 roteiros E2E, 6 novos em `tests/e2e/user-news.e2e.ts` (o da Visão do usuário passou a abrir a tela Notícias). Ao abrir o app de verdade, a tela Notícias dava "Algo deu errado": o cliente do app conferia a consulta no formato da query string, e a tela manda a página como número e o setor como objeto; a validação passou a aceitar os dois, com um teste no cliente (os roteiros E2E usam o mock, que não passa por ele). A migração foi aplicada, desfeita pelo `down.sql`, reaplicada e conferida com o `db:check` (sem diferença). A 480 px, os cinco itens do menu do usuário cabem na ilha (o ajuste compacto do menu do colaborador passou a valer também para o usuário) |
