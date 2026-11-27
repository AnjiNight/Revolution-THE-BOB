# SPEC-031 — Cenários por sentimento na ficha do ativo

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 27/11/2026, a pedido do Luís ("vamo fazer a spec 031"), com as escolhas dele do §4.1; aprovada por ele no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9) |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)) |
| Prioridade | Could (RF30, RF31) |
| Depende de | [SPEC-005](SPEC-005.md) (calendário de pregão), [SPEC-008](SPEC-008.md) (histórico de cotações), [SPEC-028](SPEC-028.md) (vínculo notícia–ativo), [SPEC-029](SPEC-029.md) (pregão de cada notícia e o que o preço fez depois), [SPEC-042](SPEC-042.md) (série ajustada), [SPEC-044](SPEC-044.md) (sentimento e a nota mínima) |
| Muda | O banco (`cenario_registrado`), o servidor (a rota dos cenários do ativo), o app (seção **Cenários pelo sentimento** na ficha), `requisições.md` (RF30 e RF31 reescritos, nova RB31, versão 1.16), a [DA21](../adr/DA21-cenarios-por-sentimento.md) (de Proposta para Aceita) e o mapa (OPEN-33 e OPEN-34 resolvidas) |
| Requisitos | RF30, RF31 (reescritos); RB18, RB19, RB30, RB31 (nova); RNF04, RNF18, RNF20 |
| Drivers | OBJ03 (a hipótese de pesquisa), OBJ07, FAS11, RES04 |
| ADRs | [DA15](../adr/DA15-carater-educacional.md), [DA19](../adr/DA19-fontes-de-noticias.md), [DA20](../adr/DA20-modelo-ia-noticias.md), [DA21](../adr/DA21-cenarios-por-sentimento.md) |
| Resolve | OPEN-33 (aprovação da DA21, horizontes, limite de estabilidade, mínimo de ocorrências, sentimento personalizado), OPEN-34 (cenário por ativo, INC-06) |

---

## 1. Objetivo

Na **ficha do ativo**, uma seção nova mostra **o que aconteceu com o preço depois dos pregões em que o sentimento das notícias sobre o ativo foi positivo, neutro ou negativo**, ao lado do que aconteceu em todos os pregões, sem olhar as notícias (a **taxa-base**). É o método da DA21: contar o passado, não prever.

> Nas 38 vezes em que o sentimento sobre a PETR4 foi negativo, 5 pregões depois a ação tinha caído em 58% das vezes, ficado estável em 12% e subido em 30%. Sem olhar as notícias: caiu em 45%, ficou estável em 12% e subiu em 43%.

Cada cenário do dia fica **registrado**, para a equipe comparar depois com o que aconteceu (Visão §15).

## 2. Valor

- **Usuário:** vê, com números simples, se dias de notícia ruim costumam vir antes de queda, sempre comparado com o normal do ativo.
- **Pesquisa (OBJ03):** a diferença entre o cenário e a taxa-base é a própria pergunta do projeto. Se os números forem iguais, o sentimento não ajuda, e isso também é um resultado.
- **Apresentação:** fecha a trilha de notícias: coleta, vínculo, sentimento, ficha e cenário.

## 3. Escopo

### 3.1 Inclui

1. **Sentimento do pregão** de cada ativo, calculado a partir das notícias oficiais classificadas (§4.2).
2. **Cenários** para os horizontes **No pregão**, **5 pregões depois** e **20 pregões depois**: as porcentagens de queda, estabilidade e alta, por faixa de sentimento e na taxa-base, com o número de ocorrências.
3. A seção **Cenários pelo sentimento** na ficha, com o sentimento de hoje, a frase do cenário de hoje e a tabela das três faixas.
4. O **registro** do cenário de hoje de cada ativo, uma vez por pregão, horizonte e versão do modelo.
5. **Requisitos e documentos:** RF30 e RF31 reescritos, RB31, a DA21 aceita e o mapa.

### 3.2 Não inclui

- **Cenário da carteira** (somar os ativos): fica de fora (§4.1, decisão 1).
- **Recurso de assinante:** todos veem, por enquanto (§4.1, decisão 2).
- **Sentimento personalizado** (das fontes de cada usuário, SPEC-030): o cenário usa só a fonte pai e as curadas (§4.2).
- **Tela de acertos** (comparar os cenários registrados com o que aconteceu): os dados ficam guardados; a tela é outra Spec.
- **Modelo treinado** (DA20): o cenário usa a versão do sentimento em uso e muda junto quando ela mudar.

## 4. Decisões

### 4.1 Escolhidas pelo Luís em 27/11/2026

| # | Tema | Escolha | Motivo |
|---|---|---|---|
| 1 | **Cenário de quê** (OPEN-34) | **Por ativo**, na ficha. RF30 e RF31 são reescritos para isso | É o método da DA21; somar uma carteira misturaria ativos com e sem notícia |
| 2 | **Quem vê** | **Todos os usuários**, por enquanto (e o colaborador na Visão do usuário). Quando a SPEC-025 entrar na `main`, os cenários podem virar recurso de assinante sem refazer nada | A SPEC-025 (planos) só está na branch da Nicoly |
| 3 | **Horizontes e estabilidade** (OPEN-33) | **No pregão** (±1%), **5 pregões depois** (±2%) e **20 pregões depois** (±4%): dentro da faixa é "estável"; acima, "alta"; abaixo, "queda" | A faixa cresce com o prazo: em 20 pregões, variar menos de 1% quase nunca acontece |
| 4 | **Mínimo de ocorrências** (OPEN-33) | **30**. Abaixo disso, a célula mostra "dados insuficientes" e o número de ocorrências, sem as porcentagens (nova **RB31**) | O exemplo da DA21; porcentagens de poucos casos enganam |

### 4.2 Recomendações para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Pregão de cada notícia** | O mesmo da SPEC-029: a notícia conta para o pregão do dia se saiu até as 18h de Brasília; senão, para o pregão seguinte | O gráfico da ficha já usa essa regra |
| **Quais notícias** | Só as em que o ativo é **principal ou citado** (como a lista da ficha), da **fonte pai e das curadas**, classificadas pela **versão do sentimento em uso**. Notícias de feeds dos usuários nunca entram (RB30) | DA19: os números oficiais são iguais para todos e não são contaminados por fontes pessoais |
| **Sentimento do pregão** | A **média das pontuações** das notícias do pregão (cada notícia tem uma pontuação de −1 a 1, SPEC-044). Acima de **0,2**, positivo; abaixo de **−0,2**, negativo; entre os dois, neutro: os mesmos limites de cada notícia. Pregão sem notícia não tem faixa | Uma regra só, já explicada na SPEC-044 |
| **Retorno** | Sobre o **fechamento anterior** ao pregão da notícia, até o fechamento do próprio pregão (**No pregão**), de 5 pregões depois e de 20 pregões depois, na **série ajustada** por desdobramentos, grupamentos e bonificações (SPEC-042). É a mesma conta do painel do pregão da SPEC-029 | Os números da seção nova batem com os que a ficha já mostra |
| **Taxa-base** | As mesmas contagens em **todos os pregões** do ativo no mesmo período (desde o primeiro pregão com notícia oficial classificada no banco), com ou sem notícia | DA21: a comparação com o normal do ativo é o que dá sentido ao cenário |
| **Ocorrência** | Um pregão da faixa conta para um horizonte só se o preço daquele horizonte já existe. Por isso, o número de ocorrências pode ser menor em 20 pregões | Não se inventa o futuro |
| **Quando aparece** | Só quando o **sentimento está visível** (a versão em uso passou na avaliação da equipe, SPEC-044). Antes disso, a seção diz "Os cenários aparecem quando a equipe validar o sentimento das notícias" | Cenário feito de um sentimento não validado enganaria; é a mesma regra do tom nas notícias |
| **Hoje** | O pregão de referência é o de hoje (ou o próximo, depois das 18h ou num dia sem pregão). Com notícia: "Sentimento de hoje: Negativo (3 notícias)" e a frase do cenário de hoje em destaque. Sem notícia: "Sem notícias hoje", e a tabela continua | A tabela das três faixas é útil todos os dias, não só nos de notícia |
| **Frases fixas** | "Mostra o que aconteceu depois de pregões parecidos no passado, não uma previsão." e "Não é recomendação de compra ou venda." (RB18, RB19) | Caráter educacional (DA15) |
| **Registro** (DA21, ponto 8) | A primeira vez que o cenário de hoje é calculado para um ativo, o servidor grava, para cada horizonte: o ativo, o pregão, a faixa, a versão do modelo, o número de ocorrências e as porcentagens do cenário e da taxa-base. Uma linha por ativo, pregão, horizonte e versão; nada sobre quem abriu a ficha | Dá para medir depois se os cenários acertaram, sem dado pessoal |
| **Cálculo** | Na hora, no servidor, a cada abertura da ficha: o histórico de um ativo cabe em poucos milhares de linhas. Sem tabela de sentimento diário | Uma tabela a mais teria de ser refeita a cada versão do modelo |
| **Sem conexão** (SPEC-032) | A leitura entra na cópia local, como as notícias da ficha | A ficha inteira funciona para consulta |
| **Textos** | Português e inglês; a tabela tem cabeçalhos para o leitor de tela; as faixas aparecem com texto e ícone, não só cor | RNF04, RNF18, RNF20 |

### 4.3 O que os dados mostram (27/11/2026)

| Achado | Consequência |
|---|---|
| O banco local tem 264 notícias, das últimas semanas; o arquivo do Investidor10 (22.491 notícias desde 22/09/2023) ainda não foi carregado (cerca de 19 horas de processador) | Com o banco de hoje, quase todo ativo fica em "dados insuficientes". Com o arquivo carregado, os ativos mais noticiados (PETR4, VALE3, os bancos) passam de 30 ocorrências |
| A versão do sentimento ainda não passou na avaliação (faltam notícias de teste rotuladas pela equipe, SPEC-044) | A seção fica escondida até a equipe rotular e avaliar |

### 4.4 Exemplos

| Situação | Resultado |
|---|---|
| PETR4, sentimento visível, hoje com 3 notícias de média −0,45 | "Sentimento de hoje: Negativo (3 notícias)" e a frase do cenário negativo no horizonte escolhido; a tabela das três faixas e da taxa-base |
| PETR4, 5 pregões depois, faixa negativa com 38 ocorrências | "Nas 38 vezes em que o sentimento foi negativo, 5 pregões depois a PETR4 tinha caído em 58%, ficado estável em 12% e subido em 30% das vezes" |
| Faixa positiva com 12 ocorrências | "Dados insuficientes (12 ocorrências; o mínimo é 30)" |
| Ativo sem nenhuma notícia | "Ainda não há notícias sobre este ativo para montar cenários", e a taxa-base |
| Sentimento ainda não validado | "Os cenários aparecem quando a equipe validar o sentimento das notícias" |
| Notícia das 19h30 de quarta | Conta para o pregão de quinta, como no gráfico |
| Pregão de ontem, 20 pregões depois | Não conta para o horizonte de 20 pregões, porque esse preço ainda não existe |
| Notícia de um feed próprio do usuário sobre a PETR4 | Não entra no cenário |
| A equipe troca a versão do modelo | Os cenários passam a usar a versão nova; os registros antigos ficam, com a versão deles |

## 5. Comportamento esperado

### 5.1 Rota

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/assets/:id/scenarios` (nova) | Usuário e colaborador | — | `visible` (falso se o sentimento não passou na avaliação); o modelo; o pregão de hoje com a faixa e quantas notícias (ou `null`); os horizontes com os limites de estável; a taxa-base e as três faixas, cada uma com, por horizonte, o número de ocorrências e as porcentagens de queda, estável e alta (ou `insufficient`); o período usado; o mínimo (30) | 404 `asset_not_found`; 401 sem sessão |

### 5.2 Tela

Na ficha do ativo, depois da seção **Notícias**, a seção **Cenários pelo sentimento**:

- o sentimento de hoje (ou "Sem notícias hoje");
- a escolha do horizonte (**No pregão**, **5 pregões depois**, **20 pregões depois**), como um grupo de opções pelo teclado;
- a frase do cenário de hoje, quando houver faixa e ocorrências suficientes;
- a tabela: linhas Positivo, Neutro, Negativo e **Sem olhar as notícias**; colunas Queda, Estável, Alta e Ocorrências;
- o período usado ("Desde 22/09/2023, 760 pregões") e as duas frases fixas.

Português e inglês, pelo teclado, a 375 px sem rolagem lateral (a tabela vira cartões, como as outras da ficha).

## 6. Modelo de dados

| Tabela | Campos | Restrições |
|---|---|---|
| `cenario_registrado` (nova) | `id`, `ativo_id`, `pregao`, `faixa` (`positivo`, `neutro`, `negativo`), `horizonte` (1, 5, 20), `versao_modelo_id`, `ocorrencias`, `queda`, `estavel`, `alta` (porcentagens; vazias abaixo do mínimo), `base_ocorrencias`, `base_queda`, `base_estavel`, `base_alta`, `criado_em` | Única por (`ativo_id`, `pregao`, `horizonte`, `versao_modelo_id`); porcentagens de 0 a 100; sem dado pessoal |

A migração tem `down.sql` (RNF17). `CENARIO` entra no modelo conceitual (OPEN-44).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O sentimento do pregão é a média das pontuações das notícias oficiais em que o ativo é principal ou citado, com a regra das 18h e os limites de 0,2 (teste de unidade com exemplos à mão) |
| CA02 | As porcentagens de cada faixa e da taxa-base batem com uma conta à mão, nos três horizontes, com os limites de ±1%, ±2% e ±4%, na série ajustada |
| CA03 | Abaixo de 30 ocorrências, a célula mostra "dados insuficientes" e o número, nunca as porcentagens |
| CA04 | Notícias de feeds dos usuários, de lista e de outra versão do modelo não entram no cálculo (teste com o banco `simulador_test`) |
| CA05 | Com o sentimento não validado, a rota responde `visible: false` e a ficha mostra o aviso, sem números |
| CA06 | O cenário de hoje é registrado uma única vez por ativo, pregão, horizonte e versão, sem nada de quem abriu a ficha |
| CA07 | A seção aparece em português e inglês, com as frases fixas, pelo teclado e a 375 px; funciona sem conexão com a cópia local |
| CA08 | `requisições.md` 1.16 com RF30 e RF31 reescritos e a RB31; a DA21 aceita; o mapa com a OPEN-33 e a OPEN-34 resolvidas |

Itens de `requisições.md` (versão 1.16):

| ID | Texto | Ator | Prioridade |
|---|---|---|---|
| RF30 (reescrito) | Exibir, na ficha do ativo, cenários de queda, estabilidade e alta a partir dos pregões passados com sentimento semelhante, com a taxa-base e o número de ocorrências | Usuário | Could |
| RF31 (reescrito) | Calcular o sentimento de cada pregão do ativo a partir das notícias classificadas e as probabilidades condicionais dos cenários | Sistema | Could |
| RB31 | Cenário com menos de 30 ocorrências exibe "dados insuficientes" em vez das porcentagens | — | — |

## 8. Pontos em aberto

| Tema | Situação |
|---|---|
| Arquivo de notícias | Para os cenários terem ocorrências suficientes, o processador precisa carregar o arquivo do Investidor10 desde 2023 (cerca de 19 horas). A demonstração no Render tem só as notícias copiadas em 26/11 |
| Rotulagem | O sentimento só aparece (e, com ele, os cenários) depois de a equipe rotular as notícias de teste e a versão passar na avaliação (SPEC-044) |
| Assinatura | Com a SPEC-025 na `main`, decidir se os cenários viram recurso de assinante (RF33) |
| Tela de acertos | Os cenários registrados permitem medir os acertos; a tela fica para outra Spec |
| Junção com a SPEC-047 | As notícias repetidas entre fontes (branch da Nicoly) devem contar uma vez só no sentimento do pregão |

## 9. Implementação (27/11/2026)

| Parte | O que mudou |
|---|---|
| Requisitos e mapa | `requisições.md` 1.16: RF30 e RF31 reescritos e a nova RB31 (§4.6 e a rastreabilidade); a RB30 passa a valer também para os cenários. A [DA21](../adr/DA21-cenarios-por-sentimento.md) foi aceita, com os pontos em aberto trocados pelas decisões do §4. Mapa 1.76: OPEN-33 e OPEN-34 resolvidas, a entrada da SPEC-031 atualizada e ela fora das bloqueadas |
| Banco | Migração `20261127120000_cenarios_sentimento` (com `down.sql`): a tabela `cenario_registrado`, única por (`ativo_id`, `dia`, `horizonte`, `versao_modelo_id`), com as porcentagens de 0 a 100 e as três partes vazias juntas (abaixo do mínimo) ou preenchidas juntas. O pregão do §6 virou a coluna `dia`, e o horizonte "No pregão" é guardado como 0 (no lugar do 1 do §6): é a variação do próprio pregão sobre o fechamento anterior, como no §4 |
| Compartilhado | `news.ts`: `ASSET_SCENARIO_PATH`, `SCENARIO_HORIZONS` (0, 5 e 20), `SCENARIO_STABLE_LIMIT` (±1%, ±2% e ±4%), `SCENARIO_MIN_OCCURRENCES` (30), `SENTIMENT_BAND_LIMIT` (0,2), `sentimentBand` e os tipos da resposta (`AssetScenarios`, `ScenarioCell`, `ScenarioToday`) |
| Servidor | `domain/scenarios.ts`: o pregão de cada notícia pela regra das 18h (`newsReferenceDay`), a média das pontuações por pregão, a faixa e, para cada pregão com fechamento anterior, a queda, o estável ou a alta em cada horizonte, por faixa e na taxa-base; as notícias de depois do último fechamento formam o sentimento de hoje. `AssetScenariosService`: sem a versão visível (SPEC-044), `visible: false` sem números; o período começa no pregão da primeira notícia classificada pela versão; a série vem ajustada pelos eventos (`adjustPrices`, SPEC-042). O cenário de hoje (a faixa de hoje e a taxa-base, nos três horizontes) é registrado uma vez por ativo, dia, horizonte e versão (`skipDuplicates`), sem nada de quem abriu a ficha; um erro ao registrar não derruba a resposta. `PrismaNewsRepository`: só as notícias da versão, com pontuação, de fonte oficial (`pai` e `curada`, RB30) e com o ativo principal ou citado. Rota `GET /api/assets/:id/scenarios` em `news-routes.ts`, com sessão |
| App | Seção **Cenários pelo sentimento** (`AssetScenarios.tsx`) na ficha, depois de Notícias: o sentimento de hoje, os horizontes como grupo de opções (abre em 5 pregões depois), a frase do cenário de hoje quando há ocorrências suficientes, a tabela com Positivo, Neutro, Negativo e Sem olhar as notícias (a linha de hoje marcada; abaixo de 30, "Dados insuficientes" e o número), o limite de estável, o período e as duas frases fixas. Lida pelo cliente com a cópia local, como o resto da ficha. Textos em português e inglês |
| Validação | 1.253 testes (1.095 de unidade e 158 com o banco `simulador_test`), com os novos: `scenarios.test.ts` (6, CA01 a CA03: as contas à mão nos três horizontes, a regra das 18h, os limites de 0,2 e o mínimo), `asset-scenarios-routes.test.ts` (4, CA05, CA06 e o 404), o do cliente do app e `prisma-scenarios.db.test.ts` (CA04 e CA06: ficam de fora as notícias de feeds dos usuários, de lista e de outra versão; o registro de hoje não se repete). Os três testes de banco das notícias passaram a limpar também `cenario_registrado`, que aponta para `versao_modelo`. 3 roteiros E2E novos em `tests/e2e/asset-scenarios.e2e.ts` (CA05, CA03 e CA07: o aviso sem o sentimento validado, a tabela e os horizontes, "Dados insuficientes", 375 px e inglês). A migração foi aplicada, desfeita pelo `down.sql`, reaplicada e conferida com o `db:check` (sem diferença) |
