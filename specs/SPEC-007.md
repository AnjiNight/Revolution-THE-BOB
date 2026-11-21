# SPEC-007 — Ingestão da série do CDI

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pela Nicoly em 04/11/2026, como escrita, e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | *Should* (RF10, Requisitos v1.3) |
| Depende de | [SPEC-008](SPEC-008.md) (padrão de ingestão: adaptador, execução registrada, novas tentativas); [SPEC-005](SPEC-005.md) só para a conferência do §4.2 (pregão sem CDI) |
| Requisitos | RF10; RNF04, RNF12, RNF13, RNF17, RNF18, RNF20 |
| Casos de uso | Consultar taxa do indexador (lado do sistema); fluxo 7.2 da arquitetura (mesmo padrão de ingestão) |
| Drivers | FAS03, QA02, QA08, QA12, RES03 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA22](../adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md) |

---

## 1. Objetivo

O processador passa a carregar a **série diária do CDI** da API SGS do Banco Central:

- a **carga retroativa** desde o primeiro dia útil de 2016 (mesma janela do histórico da SPEC-008);
- a **atualização diária**, que acrescenta os dias publicados desde a última carga;
- de forma **idempotente**, com **novas tentativas** e **execução registrada** (padrão da SPEC-008).

O colaborador vê, no Início, até que dia a série está carregada e como foi a última atualização. O usuário ainda não vê o CDI: ele aparece na comparação com benchmarks (SPEC-020).

## 2. Valor

- **Sistema:** série do benchmark CDI pronta para a SPEC-020 (rentabilidade da carteira × CDI), inclusive para a carteira histórica desde 2016.
- **Equipe:** sabe se a série está em dia sem abrir o banco.
- **Custo zero** (RES03): a API SGS é pública, gratuita e sem token.

## 3. Escopo

### 3.1 Inclui

1. **Adaptador do SGS** (DA06): série 12 ("Taxa de juros — CDI", % ao dia), por intervalo de datas.
2. **Indexador CDI** cadastrado pela migração.
3. **Carga retroativa** desde 04/01/2016, em blocos de um ano.
4. **Atualização diária** dos dias que faltam.
5. **Conferência com o calendário de pregão:** pregão publicado (SPEC-005) sem CDI vira aviso na execução.
6. **Registro de execuções** (DA14) na tarefa nova `cdi_diario`.
7. **Situação da série no Início do colaborador.**

### 3.2 Não inclui

- **Cálculo do CDI acumulado** num período e a **comparação com a carteira**: SPEC-020. Esta Spec guarda a taxa como o Banco Central publica.
- **Selic e IPCA**: fase de renda fixa (DA22). As tabelas já aceitam outros indexadores.
- **Ibovespa** (OPEN-21) e **IFIX**: SPEC-020.
- **Tela de monitoramento e reexecução**: SPEC-011.
- **Rota ou tela do CDI para o usuário**: SPEC-020.

## 4. Decisões

### 4.1 Conferido na API do Banco Central em 04/11/2026

| Teste | Resultado |
|---|---|
| `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=27/10/2026&dataFinal=04/11/2026` | `200`, lista de `{ "data": "dd/mm/aaaa", "valor": "0.050788" }`: valor em **texto**, % ao dia, 6 casas |
| Dia de hoje (04/11, às 18h30) | `404`: o CDI do dia ainda não estava publicado; o de 03/11 já estava |
| Ano de 2016 inteiro | 251 linhas, de 04/01/2016 a 30/12/2016 |
| Intervalo maior que 10 anos, ou sem datas | `406`: a API recusa. Por isso a carga é feita **ano a ano** |
| 22/12/2025 a 05/01/2026 | **24/12 e 31/12 têm CDI**, e a B3 não abre nesses dias. O CDI segue os **dias úteis bancários**, não o calendário de pregão |
| Feriado de 02/11/2026 | Sem linha (correto) |

### 4.2 Aprovadas junto com a Spec (Nicoly, 04/11/2026)

| Tema | Proposta | Motivo |
|---|---|---|
| **Fonte** | API SGS do Banco Central, **série 12**, formato JSON, sem token. Endereço em `BCB_SGS_BASE_URL` (padrão `https://api.bcb.gov.br`; os testes apontam para um servidor falso) | Fonte já definida em [decisões técnicas](../decisoes_tecnicas.md) §3; trocar de fonte é trocar o adaptador (DA06) |
| **O que guardar** | A taxa **como publicada**: percentual ao dia, com 6 casas, lido pelo texto do número, sem ponto flutuante. Nenhuma conversão nesta Spec | RNF12; o fator diário (1 + taxa/100) e o acumulado são conta da SPEC-020, no núcleo de cálculo (DA10) |
| **Janela** | Desde o **primeiro dia útil de 2016** (04/01/2016), igual ao histórico de cotações | A carteira histórica desde 2016 precisa do CDI do mesmo período; ~2.700 linhas no total |
| **Dias da série** | Os dias são os que o Banco Central publica. O CDI **não** é conferido dia a dia contra o calendário de pregão (24/12 e 31/12 têm CDI sem pregão). Só são recusados: fim de semana, data futura e data antes da janela | §4.1: os calendários são diferentes. Recusar 24/12 seria apagar um dia de rendimento verdadeiro |
| Conferência | Ao contrário vale: **todo pregão é dia útil bancário**. Pregão de ano com calendário publicado que já passou e não tem CDI (depois de 3 dias úteis) vira erro da execução ("pregão de 03/11/2026 sem CDI"), sem impedir a gravação | Mostra dado faltando na fonte ou calendário errado, sem travar a série |
| **Validação** | Data no formato `dd/mm/aaaa`; valor entre **0 e 1** (% ao dia; 1% ao dia seria mais de 1.200% ao ano). Linha fora disso vira erro da execução e não é gravada; as outras seguem | Dado estranho vira erro registrado, não benchmark errado |
| **Carga retroativa** | Para cada ano da janela que ainda não está completo, uma consulta com o ano inteiro (o ano atual vai até hoje). Ano fechado e carregado fica marcado e não é consultado de novo | A API recusa intervalos de mais de 10 anos; 11 consultas carregam tudo |
| **Atualização diária** | Do dia seguinte ao último CDI guardado até hoje. Resposta `404` (nada publicado no intervalo) **não é erro**: a execução termina como `aguardando_publicacao` | O CDI de um dia sai no dia útil seguinte (§4.1) |
| **Horário** | Às **09:00 e às 18:00** (horário de Brasília) e ao iniciar o processador. A carga retroativa roda ao iniciar e junto com cada atualização, se faltar algum ano | Duas chances por dia de pegar o CDI do dia anterior; o mesmo agendador da SPEC-040 (hora fixa) |
| **Idempotência** | Chave (`indexador`, `data`), gravação por "insere ou atualiza". Valor diferente do guardado para o mesmo dia (revisão do Banco Central) **substitui** e conta como registro gravado; valor igual não conta | DA07; a fonte oficial é a referência |
| **Novas tentativas** | Rede, `5xx` ou `429`: até **3 novas tentativas**, com espera de 1, 5 e 15 minutos (igual à SPEC-008). Depois, `falha` registrada; o que já estava guardado continua (RNF13). `406` e resposta malformada não têm nova tentativa: viram erro com a mensagem da API | Mesmo padrão já usado; repetir uma consulta recusada não muda a resposta |
| **Registro** | Execução da tarefa `cdi_diario` com situação, registros gravados, período coberto e **consultas feitas**. Sem trabalho (série em dia e nada novo publicado às 18:00), não grava execução | DA14; mesmo princípio da SPEC-008 |
| Retenção | A série fica **para sempre** | É pequena e é a base dos benchmarks |
| **Onde aparece** | No **Início do colaborador**: período carregado, última atualização e avisos. Nada para o usuário até a SPEC-020 | Primeiro uso real é a comparação; a equipe precisa ver se está em dia |
| Onde fica | Módulo **Dados de Mercado** (adaptador em `infrastructure`, regras de data em `domain`), como as SPECs 008 e 009 | Separação já prevista (arquitetura §6) |
| Termos de uso | Dado público aberto do Banco Central, sem restrição de redistribuição. Mesmo assim, nenhuma rota pública nova | Nada a resolver como na OPEN-07 da brapi |

## 5. Comportamento esperado

### 5.1 Tarefa do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `cdi_diario` | 09:00, 18:00 e ao iniciar | Completa os anos da janela que faltam (carga retroativa); busca do dia seguinte ao último guardado até hoje; grava; confere os pregões publicados sem CDI |

| Situação | Quando |
|---|---|
| `sucesso` | Todas as consultas responderam, sem erro |
| `parcial` | Alguma linha recusada, algum ano que falhou ou pregão sem CDI, mas algo foi lido |
| `falha` | Nenhuma consulta pôde ser lida depois das novas tentativas |
| `aguardando_publicacao` | Nada novo publicado (`404`) e nada gravado |

### 5.2 Rotas

| Rota | Quem | Resposta |
|---|---|---|
| `GET /api/collaborator/cdi` (nova) | Colaborador | `{ from, to, days, lastRun: { at, status } \| null, missingTradingDays }`: primeira e última data guardadas, quantos dias, última execução e quantos pregões estão sem CDI. Datas em `aaaa-mm-dd` |

Nenhuma rota devolve a série. A SPEC-020 cria a leitura que precisar.

### 5.3 Telas

| Situação | Tela (Início do colaborador) |
|---|---|
| Série em dia | "Série do CDI: de 04/01/2016 a 03/11/2026 · atualizada hoje às 09:00" |
| Ainda sem dados | "Série do CDI: carregando (o processador busca no Banco Central)" |
| Atrasada | Aviso em âmbar quando o último CDI guardado tem mais de **3 dias úteis**: "A série do CDI está parada em 28/10/2026. Confira se o processador está ligado." |
| Última execução com problema | Aviso em âmbar: "A última atualização do CDI terminou com falha (09:00)." ou "Há 2 pregões sem CDI na série." |
| Janela estreita (480px) | O texto quebra em linhas; nada some |

"Dias úteis" no aviso de atraso usa o calendário de pregão quando o ano está publicado, e segunda a sexta quando não está. É só para o aviso, não para validar a série.

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `indexador` (nova) | `id`, `sigla`, `nome`, `serie_sgs`, `unidade` | `sigla` única; `unidade` em lista fechada (`percentual_ao_dia`). A migração cadastra o **CDI** (série 12, % ao dia) |
| `taxa_diaria` (nova) | `indexador_id`, `data`, `valor`, `fonte`, `gravado_em` | Chave (`indexador_id`, `data`); `indexador_id` aponta para `indexador`; `valor` decimal(10,6) entre 0 e 1; nunca em fim de semana; `fonte` em lista fechada (`bcb_sgs`) |
| `carga_indexador` (nova) | `indexador_id`, `ano`, `carregada_em`, `registros` | Chave (`indexador_id`, `ano`); marca os anos fechados já carregados |
| `tarefa_ingestao` (muda) | Novo valor `cdi_diario` | — |

INDEXADOR e TAXA_DIARIA passam a existir como no [modelo conceitual](../modelo_dominio.md) (com `nome`, série e unidade a mais). Nenhuma tabela nova guarda dado pessoal (DA13). A migração tem `down.sql` (RNF17).

Configuração nova do processador: `BCB_SGS_BASE_URL` (padrão `https://api.bcb.gov.br`). Nenhum token.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O adaptador lê a resposta do SGS em data e valor decimal (pelo texto, sem ponto flutuante); monta a consulta com `dataInicial` e `dataFinal` em `dd/mm/aaaa`; `404` vira "nada publicado"; `406`, resposta malformada, rede e `5xx` viram erros distintos |
| CA02 | Com o banco vazio, a primeira execução carrega o CDI de 04/01/2016 até o último dia publicado, com uma consulta por ano |
| CA03 | A atualização busca só a partir do dia seguinte ao último guardado; ano fechado já carregado não é consultado de novo |
| CA04 | Rodar duas vezes não duplica nem muda nada; valor revisado pelo Banco Central substitui o guardado |
| CA05 | Dias sem pregão com CDI (24/12, 31/12) são gravados; fim de semana, data futura e valor fora de 0 a 1 são recusados e registrados, sem parar o resto |
| CA06 | Pregão publicado que já passou, sem CDI depois de 3 dias úteis, vira erro da execução com a data |
| CA07 | Banco Central fora do ar: 3 novas tentativas com espera, depois `falha` registrada; processador e servidor continuam funcionando e a série guardada não muda (RNF13). Nada publicado termina como `aguardando_publicacao`, sem erro |
| CA08 | Cada execução grava tarefa, início, fim, situação, registros, período e consultas; execução sem trabalho não é gravada |
| CA09 | O Início do colaborador mostra o período carregado, a última atualização e os avisos (carregando, atrasada, falha, pregões sem CDI), em português e inglês, usável pelo teclado e a 480px (RNF04, RNF18, RNF20) |
| CA10 | As tabelas existem com as restrições do §6, o CDI vem cadastrado, e a migração pode ser desfeita e refeita (RNF17) |
| CA11 | Testes automatizados do adaptador, da janela por ano, da idempotência e da conferência com o calendário, sem acessar a internet (respostas do SGS montadas nos testes) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | ✅ Propostas do §4.2 aprovadas como escritas (Nicoly, 04/11/2026) |
| SPEC-020 | Ao acumular o CDI de um período, usar **todos os dias da série**, inclusive os sem pregão (24/12, 31/12): é rendimento verdadeiro. A data inicial e final do período vêm da carteira (pregões) |
| OPEN-21 | Fonte do Ibovespa continua em aberto (SPEC-020) |
| OPEN-40 | ✅ Série do CDI guardada para sempre |
| — | Selic e IPCA (fase de renda fixa) reaproveitam o adaptador com outra série (11 e 433); o IPCA é mensal e vai precisar de outra unidade |

## 9. Verificação (04/11/2026)

| Critério | Resultado |
|---|---|
| CA01 | ✅ Adaptador (`bcb-sgs-source.test.ts`, com `fetch` falso): consulta com `dataInicial` e `dataFinal` em `dd/mm/aaaa`; `404` vira "nada publicado"; rede, `5xx` e `429` (com nova tentativa), `406` e resposta que não é JSON ou não é lista (sem nova tentativa) viram erros distintos. Leitura das linhas em decimal pelo texto (`cdi.test.ts`) |
| CA02 | ✅ Banco vazio: uma consulta por ano, de 04/01/2016 até o último publicado, com os anos fechados marcados (`cdi-ingestion.test.ts`). **De verdade:** 2.719 dias, de 04/01/2016 a 03/11/2026, em 11 consultas e 5 segundos |
| CA03 | ✅ Série em dia não consulta; no dia seguinte, só do dia depois do último guardado; ano fechado marcado não é consultado de novo |
| CA04 | ✅ Em memória e no PostgreSQL: a mesma gravação não muda nada; valor revisado substitui só ele ("0.05" = "0.050000") |
| CA05 | ✅ 24/12 e 31/12 gravados; fim de semana, data futura, antes da janela e valor fora de 0 a 1% (ou com mais de 6 casas) viram erro, e o resto é gravado |
| CA06 | ✅ Pregão publicado sem CDI depois de 3 dias úteis vira erro com a data. **De verdade:** com 2016–2026 publicados, nenhum pregão sem CDI |
| CA07 | ✅ Banco Central fora do ar: 3 novas tentativas com espera e `falha`, sem mexer no guardado; nada publicado termina como `aguardando_publicacao`, sem erro |
| CA08 | ✅ Execução com situação, registros, período e consultas; série em dia não grava execução. As tarefas das 09:00 e das 18:00, que rodam juntas ao iniciar, não fazem duas execuções |
| CA09 | ✅ Rota `GET /api/collaborator/cdi` (`index-routes.test.ts`): período, última execução terminada, série parada há mais de 3 dias úteis e pregões sem CDI; 403 para usuário, 401 sem sessão. Início do colaborador com a linha da série e os avisos em âmbar, em português e inglês (paridade dos idiomas coberta por teste). ⏳ Conferir na tela do Electron |
| CA10 | ✅ PostgreSQL: CDI cadastrado pela migração (série 12, % ao dia); fim de semana, valor 1 ou negativo e registros negativos recusados. Migração `20261104130000_serie_cdi` sem diferença para o esquema do Prisma, desfeita e refeita |
| CA11 | ✅ Nenhum teste acessa a internet: respostas do SGS montadas nos testes (`FakeIndexSource` e `fetch` falso) |
| Conferência dos valores | ✅ CDI acumulado por ano calculado da série gravada: 14,00% (2016), 9,93% (2017), 6,42% (2018), 5,96% (2019), 2,76% (2020), 4,42% (2021), 12,39% (2022), 13,04% (2023), 10,88% (2024), 14,32% (2025), iguais aos números publicados do CDI |

Total: **713 testes** passando (com o banco real), lint, tipos e formatação.

**Para as próximas Specs:** a SPEC-020 lê a série em `taxa_diaria` (indexador `CDI`) e acumula o período com todos os dias da série, inclusive os sem pregão (§8). A SPEC-011 mostra as execuções de `cdi_diario`.
