# SPEC-029 — Notícias na ficha do ativo e gráfico Notícias × Preço

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 17/11/2026 pela Nicoly (com o Claude); aprovada por ela no mesmo dia, com as recomendações do §4.1 e as propostas do §4.2 ("Aprovar e fazer"); implementada e validada como usuária (§9) |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)), depois da SPEC-028 |
| Prioridade | Could (RF29); a Visão §24 a destaca como núcleo do MVP (FAS05) |
| Depende de | [SPEC-010](SPEC-010.md) (ficha e gráfico de preço), [SPEC-027](SPEC-027.md) (notícias coletadas), [SPEC-028](SPEC-028.md) (vínculo notícia–ativo), [SPEC-032](SPEC-032.md) (consulta sem conexão), [SPEC-035](SPEC-035.md) (idioma) |
| Muda | Mapa: o objetivo da SPEC-029 perde o **sentimento**, que vai para a SPEC-044 (§4.1, decisão 1) |
| Requisitos | RF29; RNF04, RNF13, RNF18 |
| Casos de uso | Ler notícias do ativo; Visão §19 e §23 |
| Drivers | OBJ02, FAS05 |
| ADRs | [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA11](../adr/DA11-noticias-ia-modulo-isolado.md), [DA16](../adr/DA16-cotacoes-por-plano.md) (a série do gráfico) |

---

## 1. Objetivo

Na **ficha do ativo**, quem usa o app passa a ver as **notícias sobre aquele ativo**, e o **gráfico de preço** ganha um **marcador** em cada pregão que teve notícia. Ao escolher um marcador, aparecem as notícias daquele pregão e **o que o preço fez depois**: a variação no próprio pregão e 5 pregões depois.

É a primeira vez que as notícias chegam ao usuário. Até aqui, só o colaborador as via, para conferir a coleta (SPECs 027 e 028).

## 2. Valor

- **Usuário:** na ficha da PETR4, as notícias da Petrobras e, no gráfico, quando elas saíram e o que o preço fez em seguida (Visão §19). É o diferencial do app.
- **Sistema:** a primeira tela que cruza as duas bases, preço e notícia, no mesmo eixo do tempo (FAS05), e a base visual para o sentimento (SPEC-044) e os cenários (SPEC-031).

## 3. Escopo

### 3.1 Inclui

1. Seção **Notícias** na ficha: as notícias em que o ativo é **principal** ou **citado**, da mais nova para a mais antiga, 10 por vez, com **Ver mais**.
2. Um grupo à parte, fechado por padrão, para as notícias em que o ativo só aparece numa **lista** ("Também aparece em listas (8)").
3. **Marcadores** no gráfico de preço, um por pregão com notícia, no período escolhido.
4. Ao escolher um marcador (mouse, toque ou teclado): as **notícias daquele pregão** e a **variação do preço** no pregão e 5 pregões depois.
5. A parte desta Spec na **consulta sem conexão** (SPEC-032 §5.1): as leituras novas entram na cópia local.
6. Notícias marcadas como português (`lang="pt-BR"`) e o selo **"Em português"** com a interface em inglês (SPEC-035).

### 3.2 Não inclui

- **Sentimento** das notícias (RF28): SPEC-044. Esta Spec não mostra cor nem rótulo de sentimento.
- **Cenários** a partir das notícias: SPEC-031.
- **Fontes do usuário** e preferências de fonte: SPEC-030.
- **Texto completo** da matéria: o app mostra título, data, resumo e o link para a fonte, nunca a matéria inteira (SPEC-027, decisão 4).
- **Notícias na carteira** (por exemplo, "notícias dos meus ativos"): fica para depois, se fizer falta.
- **Aviso de notícia nova** com a ficha aberta: a seção é lida ao abrir a ficha; não se atualiza sozinha a cada 5 minutos, como o preço do topo.

## 4. Decisões

### 4.1 Recomendações para aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Sem sentimento** | Esta Spec mostra as notícias e os marcadores **sem sentimento**. A SPEC-044, quando vier, acrescenta a cor e o rótulo ao que já existe | Escolha da Nicoly em 12/11/2026 (caminho 2): as notícias chegam logo ao usuário. Nada desta Spec precisa ser refeito depois |
| 2 | **Quais notícias na lista** | **Principal e citado** juntos, da mais nova para a mais antiga, com a etiqueta "Sobre a PETR4" (principal) ou "Cita a PETR4" (citado). As de **lista** ficam num grupo fechado, abaixo, com o total. Só principal e citado ganham marcador no gráfico | Medido em 17/11/2026: a PETR4 tem 28 notícias principal ou citado e 8 de lista. As de lista são agendas e rankings ("mais de 100 empresas divulgam resultados"): misturadas, encheriam a ficha de todos os ativos com as mesmas notícias. Escondê-las de vez perderia o caso da VALE3 no título (SPEC-028 §4.3) |
| 3 | **Pregão de cada notícia** | A notícia conta para o pregão do dia em que saiu, se saiu **até as 18h de Brasília**. Se saiu **depois das 18h**, num fim de semana ou num feriado, conta para o **pregão seguinte**. Na prática: soma-se 6 horas ao horário de Brasília e pega-se o primeiro pregão nesse dia ou depois | Medido: **45% das notícias** do Investidor10 saem depois das 18h (112 de 251). Uma notícia das 19h não pode ter mexido no preço daquele dia, que já fechou. 18h cobre o fechamento da B3 em qualquer época do ano |
| 4 | **O que o preço fez depois** | No painel do marcador: **"No pregão"** (fechamento do pregão da notícia sobre o fechamento do pregão anterior) e **"5 pregões depois"** (fechamento 5 pregões à frente sobre o mesmo fechamento anterior). Sem 5 pregões à frente ainda: "Ainda não há 5 pregões depois". Calculado com a **mesma série do gráfico** (ajustada ou como na B3) e com a frase fixa: "Mostra o que o preço fez depois, não que a notícia causou a variação." | É o "comportamento posterior" do mapa, com duas medidas simples de explicar. O fechamento anterior é o preço "antes da notícia". A frase evita a leitura de causa e efeito e de recomendação (o app é educacional) |
| 5 | **Marcador no gráfico** | Um **círculo pequeno** sobre a linha de base do gráfico, em cada pregão com notícia (não uma linha tracejada, que já é o salto de preço). Clicar ou tocar abre o painel do pregão abaixo do gráfico. **Pelo teclado:** com o cursor do gráfico num pregão com notícia, o leitor de tela diz "2 notícias" e **Enter** abre o painel; **N** e **Shift+N** pulam para o próximo e o anterior pregão com notícia | O gráfico já é um controle deslizante pelo teclado (SPEC-010): o marcador entra no mesmo controle, sem botões a mais no SVG, e fica acessível (RNF18) |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Cada notícia na lista** | Título (link que abre a matéria no navegador do sistema), a fonte e a data e hora, a etiqueta (§4.1, decisão 2), o resumo em até 3 linhas e o link **"Ler no Investidor10"** (ou "Ler em {fonte}") | São as condições da autorização do Investidor10 (SPEC-027, decisão 4): título, data, resumo, a fonte e o link para o site. O resumo da Agência Brasil chega a 999 caracteres; 3 linhas mantêm a lista legível |
| **Quantas por vez** | 10 na lista, com **Ver mais**; o grupo de listas também 10 por vez | A ficha já é longa (preço, indicadores, gráfico, proventos) |
| **Onde fica a seção** | Logo **abaixo do gráfico** de preço, antes dos proventos | Fica perto dos marcadores |
| **Ativo sem notícia** | "Ainda não há notícias sobre a PETR4." Sem marcadores no gráfico | — |
| **Período do gráfico** | Os marcadores seguem o período escolhido (1 mês a "Tudo"). As notícias começam em 22/09/2023 (arquivo do Investidor10); antes disso, o gráfico não tem marcador | O arquivo não vai mais longe |
| **Painel do marcador** | Título "Notícias do pregão de 12/11/2026", a variação (§4.1, decisão 4), as notícias desse pregão (principal e citado) no mesmo formato da lista e **Fechar**. Trocar o período fecha o painel | — |
| **Rotas** | `GET /api/assets/:id/news` para a lista e para as notícias de um pregão, e `GET /api/assets/:id/news/days` para os marcadores (§5.1). Qualquer pessoa conectada, como a ficha | Os marcadores só precisam da contagem por dia, não das notícias: num período de 5 anos, a PETR4 deve passar de mil notícias |
| **Quem calcula o pregão** | O servidor devolve o **dia de referência** (data de Brasília depois de somar 6 horas, §4.1, decisão 3); o app liga cada dia ao primeiro pregão da série do gráfico nesse dia ou depois. A variação também é calculada no app, com os pontos do gráfico | O servidor não precisa do calendário de pregões para isso: os pontos do gráfico já são os pregões. A regra fica numa função pura (`news-chart.ts`), testada (DA10) |
| **Onde fica no servidor** | No módulo **Notícias** (DA11): uma leitura por ativo no `PrismaNewsRepository` e as duas rotas. Usa o índice (`ativo_id`, `relevancia`) da SPEC-028 | O módulo continua isolado |
| **Sem conexão (SPEC-032)** | As duas rotas entram na lista do §5.1 da SPEC-032 e são guardadas por ativo, página, grupo e período (lista e marcadores), como as outras leituras da ficha. Sem conexão, a ficha já aberta mostra as notícias guardadas; uma página nunca aberta mostra "Ainda não consultado neste computador" | É a parte que a SPEC-032 deixou para cá |
| **Idioma** | Títulos e resumos com `lang="pt-BR"`; com a interface em inglês, o selo "Em português" na seção (uma vez, não em cada notícia). Datas e variações seguem o idioma da interface | OPEN-45, resolvida na SPEC-035 |
| **Fim da autorização** | O `investidor10:apagar` já apaga as notícias e os vínculos (SPECs 027 e 028): a seção fica vazia | Nada sobra |
| **Exportação (SPEC-034)** | Sem mudança: as notícias não são dado pessoal | — |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| P01 abre a ficha da PETR4 | Abaixo do gráfico: "Notícias", com as 10 mais novas (principal ou citado). Abaixo, fechado: "Também aparece em listas (8)" |
| Notícia "Petrobras (PETR4) pode pagar 20% em dividendos", publicada numa quarta às 14h | Marcador na quarta. Painel: "No pregão: +1,2%" (fechamento da quarta sobre o da terça) e "5 pregões depois: −0,8%" (fechamento da quarta seguinte sobre o da terça) |
| Notícia publicada numa quarta às 19h | Conta para a **quinta** |
| Notícia publicada num sábado | Conta para a **segunda** (ou o primeiro pregão depois, se a segunda for feriado) |
| Notícia de ontem | "No pregão" aparece; "Ainda não há 5 pregões depois" |
| Pelo teclado, no gráfico | As setas andam pelos pregões; num pregão com notícia, o leitor de tela diz "12/11/2026, R$ 31,20, 2 notícias". **N** pula para o próximo pregão com notícia, e **Enter** abre o painel |
| Ficha de um ativo que nenhuma notícia cita | "Ainda não há notícias sobre a XPTO3." Gráfico sem marcadores |
| Sem conexão, P01 reabre a ficha da PETR4 vista ontem | As notícias e os marcadores de ontem, com a faixa da SPEC-032. "Ver mais" de uma página nunca aberta: "Ainda não consultado neste computador" |
| Interface em inglês | Seção "News", selo "In Portuguese", títulos e resumos como vieram |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/assets/:id/news` (nova) | Qualquer pessoa conectada | `group` (`main`: principal e citado, padrão; `list`: listas), `offset` (de 10 em 10), e, para o painel do marcador, `after` e `until` (dias de referência, AAAA-MM-DD, no máximo 31 dias de distância) | `{ total, listTotal, news: [{ id, title, summary, url, source, publishedAt, relevance }] }`, até 10, da mais nova para a mais antiga | 404 `asset_not_found`; 400 `validation_error` |
| `GET /api/assets/:id/news/days` (nova) | Qualquer pessoa conectada | `period` (os mesmos do gráfico: 1m, 6m, 1y, 5y, max) | `{ days: [{ day, count }] }`: dia de referência e quantas notícias principal ou citado | 404 `asset_not_found`; 400 `validation_error` |

O painel do pregão D, cujo pregão anterior na série é P, pede `after=P` e `until=D` (dias de referência depois de P até D).

### 5.2 Telas

| Situação | Tela |
|---|---|
| Ficha do ativo | Seção **Notícias** abaixo do gráfico (§4.2), com o grupo de listas fechado. Carregando: "Carregando as notícias…"; erro: a mensagem, com **Tentar de novo**, sem derrubar o resto da ficha |
| Gráfico de preço | Os marcadores (§4.1, decisão 5), uma legenda curta ("● Pregão com notícia") e a dica de teclado com N, Shift+N e Enter |
| Painel do marcador | §4.2, abaixo do gráfico, anunciado ao leitor de tela; o foco vai para o título do painel |
| 375 px | Sem rolagem para o lado; o resumo quebra linha; os marcadores continuam tocáveis (área de toque de pelo menos 24 px) |

## 6. Modelo de dados

Nenhuma tabela nova. As leituras usam `noticia`, `fonte_noticia` e `noticia_ativo` (SPECs 027 e 028), pelo índice (`ativo_id`, `relevancia`).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Lista: principal e citado, da mais nova para a mais antiga, 10 por vez com "Ver mais"; grupo de listas fechado com o total; cada notícia com título (link), fonte, data e hora, etiqueta, resumo em até 3 linhas e "Ler no Investidor10" ou "Ler em {fonte}" |
| CA02 | Dia de referência: até 18h no mesmo dia; depois das 18h, fim de semana e feriado no pregão seguinte (testes de unidade com os casos do §4.3) |
| CA03 | Marcadores só em pregões com notícia principal ou citado, no período escolhido; o painel mostra as notícias do pregão e a variação "No pregão" e "5 pregões depois" (ou "Ainda não há 5 pregões depois"), com a série do gráfico e a frase do §4.1 |
| CA04 | Teclado: o leitor de tela diz quantas notícias o pregão tem; N, Shift+N e Enter funcionam; o foco vai para o painel |
| CA05 | Rotas: 401 sem sessão, 404 para ativo que não existe, 400 para entrada inválida, intervalo de no máximo 31 dias; testes com o `simulador_test` |
| CA06 | Sem conexão: as leituras guardadas aparecem em modo consulta; página nunca aberta mostra "Ainda não consultado neste computador" (SPEC-032) |
| CA07 | Idioma: `lang="pt-BR"` nas notícias e o selo "Em português" com a interface em inglês |
| CA08 | Com dados reais: a ficha da PETR4 com as notícias do banco de desenvolvimento e os marcadores conferidos à mão com 5 notícias (data, horário e pregão) |
| CA09 | Regra pura com testes de unidade (RNF16) |
| CA10 | Validação visual como usuária (checklist, navegador visível, erros, lista vazia, carregamento lento, clique duplo, 375 px) e o roteiro em `tests/e2e/`, com os mocks em `mocks/` |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | Notícias dos ativos da carteira, numa tela só: fica para depois, se fizer falta |
| — | O sentimento entra na lista e nos marcadores com a SPEC-044 |

## 9. Verificação (17/11/2026)

**Como ficou:**
- **Contratos** (`packages/shared/src/news.ts`):
  - `ASSET_NEWS_PATHS`, `AssetNewsPage` e `AssetNewsDays`;
  - a regra do dia de referência, `newsReferenceDay` e `newsReferenceDayStart` (18h de Brasília);
  - a validação das duas consultas.
- **Servidor** (módulo Notícias, DA11):
  - `AssetNewsService`, com a lista por grupo, página e intervalo, e os marcadores por dia;
  - duas leituras novas no `PrismaNewsRepository` e as duas rotas em `news-routes.ts`.
- **Diferença do §5.1, nos marcadores:** o servidor conta o período **a partir de hoje**, não do último fechamento. O app liga cada dia ao primeiro pregão do gráfico e **ignora** o que cai antes do primeiro pregão ou depois do último: o pregão de uma notícia de hoje à noite ainda não aconteceu.
- **App:**
  - `assetNews` e `assetNewsDays` no `AuthClient`, pelo `read` da SPEC-032 (ficam na cópia local);
  - os canais `assets:news` e `assets:news-days`;
  - a regra pura em `news-chart.ts`: pregão de cada dia, intervalo do painel, variação no pregão e 5 pregões depois, e o próximo pregão com notícia;
  - os componentes `AssetNews.tsx` (seção, grupo de listas e painel) e `PriceChart` (círculos, clique, N, Shift+N e Enter).
- **Achado da conferência com dados reais (corrigido):**
  - **O problema:** o PostgreSQL instalado no Windows vem com o fuso `America/Sao_Paulo`, e o adaptador do Prisma lia todo `timestamptz` com **3 horas a menos**. Uma notícia de domingo às 19h07 aparecia às 16h07 e ia para o dia errado.
  - **Antes:** só o banco de teste escapava, porque a URL dele tinha `TimeZone=UTC`. As gravações estavam certas.
  - **A correção:** `createPrismaClient` agora abre toda conexão em UTC, com teste em `database.db.test.ts`. Vale para o app inteiro: na tela do colaborador (SPEC-028), por exemplo, os horários das notícias também saíam 3 horas antes.

| CA | Resultado |
|---|---|
| CA01 | ✅ Lista de 10 em 10 com "Ver mais", grupo de listas fechado com o total, título com link (`target=_blank`), fonte, data e hora, etiqueta, resumo em 3 linhas, "Ler no Investidor10" e "Ler em Agência Brasil – Economia" (rotas, testes de banco e de ponta a ponta) |
| CA02 | ✅ Testes de unidade: 14h no mesmo dia, 17h59 ainda no dia, 18h já no seguinte, 23h30 no seguinte, sábado → segunda; e o painel pede os dias depois do pregão anterior até o pregão |
| CA03 | ✅ Marcadores só de principal e citado; painel com as notícias do pregão, "No pregão" e "5 pregões depois" (conferidos à mão com os fechamentos do mock: −0,46% e −2,26%) e "Ainda não há 5 pregões depois" |
| CA04 | ✅ Leitor de tela: "16 de nov. de 2026: R$ …, 2 notícias"; N, Shift+N e Enter; foco no título do painel |
| CA05 | ✅ 401, 404 (id inválido e ativo que não existe), 400 (página, intervalo de mais de 31 dias, período) |
| CA06 | ✅ Teste do `AuthClient`: sem conexão, a lista e os marcadores já abertos vêm da cópia com `savedAt`; página ou período nunca abertos dão "Ainda não consultado neste computador". As duas rotas entraram no teste de ETag e 304 da SPEC-032 |
| CA07 | ✅ `lang="pt-BR"` nos títulos e resumos; em inglês, "In Portuguese" uma vez na seção, "About PETR4" e "Read on Investidor10" |
| CA08 | ✅ Banco de desenvolvimento: PETR4 com 28 notícias principal ou citado e 8 de lista. Pregão conferido à mão com 5 notícias (abaixo) |
| CA09 | ✅ `news-chart.ts` e a regra do dia de referência com testes de unidade |
| CA10 | ✅ Validação visual abaixo e o roteiro em `tests/e2e/asset-news.e2e.ts` (5 testes; 13 de ponta a ponta no total) |

**Conferência à mão (CA08, PETR4, horários de Brasília):**

| Notícia | Publicada | Dia de referência | Pregão |
|---|---|---|---|
| "Petrobras (PETR4) acha mais petróleo em águas ultraprofundas" | Qui 29/10, 22h05 | 30/10 | 30/10 |
| "Empresas brasileiras perdem R$ 963 bilhões na Bolsa…" | Sáb 31/10, 12h10 | 31/10 | 03/11 (02/11, Finados, sem pregão) |
| "Petrobras (PETR4) anuncia reajuste de 7,2%…" | Dom 01/11, 19h07 | 02/11 | 03/11 |
| "Petrobras segura preço do gás…" | Qua 04/11, 18h37 | 05/11 | 05/11 |
| "Petrobras (PETR4) pode pagar 20% em dividendos em 2027" | Qui 12/11, 20h03 | 13/11 | Ainda sem marcador: o banco de desenvolvimento tem fechamentos só até 06/11 |

No pregão de 03/11, "No pregão" dá −3,79% (R$ 50,71 sobre R$ 52,71), e "5 pregões depois" ainda não existe.

**Validação visual (navegador do Claude, `mocks/window-api.js` com `role: 'user'`):**

| Caso | Resultado |
|---|---|
| Ficha com notícias | ✅ 10 marcadores no gráfico de 1 ano e a legenda "Pregão com notícia"; a seção abaixo do gráfico; a notícia de sábado no pregão de segunda e a das 19h30 de quarta no de quinta |
| Clique no marcador | ✅ Painel do pregão com a variação e as notícias, foco no título; "Fechar"; trocar o período fecha o painel |
| Teclado | ✅ Home, N, End, Shift+N e Enter |
| Clique duplo em "Ver mais" | ✅ Uma página pedida só. **Corrigido:** o botão sumia durante o carregamento, e o segundo clique abria o "Também aparece em listas" que subia para o lugar dele; agora o botão fica desativado ("Carregando as notícias…") |
| Ativo sem notícias | ✅ "Ainda não há notícias sobre a PETR4.", sem marcadores nem legenda |
| Carregamento lento | ✅ "Carregando as notícias…" até a resposta |
| Servidor fora do ar | ✅ Aviso só na seção, com "Tentar de novo", que funciona; o gráfico continua, sem marcadores |
| 375 px | ✅ Sem rolagem para o lado; títulos e etiquetas quebram linha; resumo em 3 linhas |
| Inglês | ✅ "News", "In Portuguese", dica do teclado e legenda traduzidas |

**Limites conhecidos:**
- No período de 1 ano ou mais, os marcadores de dias seguidos ficam colados. O clique escolhe o mais perto, N e Shift+N passam por um de cada vez, e o período de 1 mês os separa.
- Se a leitura dos marcadores falhar, o gráfico fica sem eles até trocar o período ou reabrir a ficha. O "Tentar de novo" da seção relê só a lista.
- O app não mostra a ficha com dados reais pelo navegador do Claude, porque precisa de login. A conferência com o banco real foi feita pelo serviço (CA08).

## 10. Ajuste da lista (21/11/2026)

A pedido da Nicoly ("o campo de notícias está pouco intuitivo e claro"), sem mudar o comportamento do §5:

- Cada notícia virou um **cartão**: a relação com o ativo e o tom em etiquetas no topo, o título (o link da matéria) com a cor do texto e o destaque só ao passar o mouse ou focar, o resumo em **2 linhas** (antes, 3) e, no rodapé, a fonte, a data por extenso e "Ler no …" com o ícone de link externo. Os links estavam com o azul padrão do navegador, difícil de ler no tema escuro.
- No topo da seção, uma frase explica a lista ("das mais recentes para as mais antigas; clique no título para ler a matéria") e uma legenda diz o que é "Sobre a {ticker}" e "Cita a {ticker}".
- "Também aparece em listas" virou um botão com a seta que abre e fecha.
- Os roteiros E2E das SPECs 029 e 044 passam sem mudança.
