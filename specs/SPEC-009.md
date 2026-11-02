# SPEC-009 — Cotações do pregão (nível gratuito) e fechamento do dia

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pelo Luís em 02/11/2026 e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | *Must* |
| Depende de | [SPEC-005](SPEC-005.md) (calendário de pregão), [SPEC-006](SPEC-006.md) (catálogo), [SPEC-008](SPEC-008.md) (padrão de ingestão e fechamento diário) |
| Requisitos | RF09; RB11; RNF03, RNF04, RNF12, RNF13, RNF17, RNF18, RNF20 |
| Casos de uso | Consultar cotação; fluxo 7.2 da arquitetura (ingestão com falha parcial) |
| Drivers | FAS03, QA02, QA04, PA03, RES03, RES07 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA08](../adr/DA08-cache-dois-niveis-offline-leitura.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA16](../adr/DA16-cotacoes-por-plano.md) |

---

## 1. Objetivo

O processador passa a buscar na **brapi**, durante o pregão, o **preço atual** dos ativos ativos do catálogo:

- só em **dia de pregão** (calendário da SPEC-005) e só no **horário da bolsa**;
- a cada **30 minutos**, ou com intervalo maior quando a cota mensal do plano gratuito não comporta todos os ativos;
- cada cotação guarda **data e hora, fonte e nível** (DA16);
- depois do fechamento, o preço final vira o **fechamento provisório do dia**, que o arquivo da B3 (SPEC-008) substitui na manhã seguinte.

O usuário passa a ver, na lista **Ativos**, o último preço, a variação do dia e o horário da cotação.

## 2. Valor

- **Usuário:** vê o preço do dia de cada ação e FII, sempre com o horário de referência e o aviso de atraso.
- **Sistema:** preço para a carteira ao vivo (SPEC-014) e para a ficha do ativo (SPEC-010); um só conjunto de coletas atende todos os usuários (PA03).
- **Equipe:** vê se a coleta está funcionando e quanto da cota do mês já foi usado.
- **Custo zero** (RES03): plano gratuito da brapi.

## 3. Escopo

### 3.1 Inclui

1. **Adaptador da brapi** (DA06): cotação simples de um ativo (ações e FIIs), com o token do plano gratuito.
2. **Tarefa do pregão** no processador: coleta nos horários do §4, para os ativos ativos do catálogo.
3. **Intervalo automático** para a cota do mês nunca acabar (§4, decisão 2).
4. **Fechamento provisório** do dia, gravado depois da última coleta, com a precedência da SPEC-008 (a B3 substitui).
5. **Registro de execuções** (DA14) com o número de consultas feitas, e erros por ativo.
6. **Limpeza** das cotações do pregão com mais de 30 dias.
7. **Último preço na lista Ativos** do usuário e do colaborador, e a situação da coleta na tela do colaborador.

### 3.2 Não inclui

- **Nível assinante** (provedor pago, menor atraso): SPEC-026. A tabela já guarda o nível.
- **Ficha do ativo e gráfico**: SPEC-010.
- **Compra e venda na carteira ao vivo** e o que fazer com a bolsa fechada (OPEN-08): SPECs 013 e 014.
- **Tela de monitoramento e reexecução**: SPEC-011.
- **Índices** (Ibovespa, IFIX), **proventos** (OPEN-06) e **ativos desativados** na coleta do pregão (eles continuam com o fechamento diário da B3, SPEC-008).
- **Cache em Redis** (RNF03): proposto para depois (§8).

## 4. Decisões

### 4.1 Respondidas pelo Luís em 02/11/2026

| # | Tema | Decisão | Motivo |
|---|---|---|---|
| 1 | **Termos da brapi (OPEN-07)** | Usar a brapi para **mostrar as cotações aos usuários do próprio app**, com regras fixas: mostrar a fonte ("brapi") e o horário de cada cotação; **nunca** escrever "tempo real"; **nunca** passar os dados para fora do app (nem exportação, nem rota pública de cotações para terceiros) | Os termos proíbem "revender, redistribuir ou sublicenciar os Dados [...] para terceiros"; o FAQ da brapi diz que o próprio produto pode mostrar os dados aos seus usuários, com horário e contexto e sem chamar de tempo real; o plano gratuito é o indicado para protótipo sem receita, o caso deste projeto acadêmico |
| 2 | **Cota mensal** | O processador **ajusta o intervalo sozinho** para a cota do mês nunca acabar (regra no §4.2) | O plano gratuito tem 15 mil consultas por mês, um ativo por consulta: a cada 30 minutos, a cota aguenta uns 38 ativos; com 50, acabaria no meio do mês e o app ficaria sem preço até o mês virar |
| 3 | **Onde aparece o preço** | Já na lista **Ativos** (usuário e colaborador): último preço, variação do dia e horário | Valor visível ao usuário nesta Spec, sem esperar a ficha (SPEC-010) |

### 4.2 Aprovadas junto com a Spec (Luís, 02/11/2026)

| Tema | Proposta | Motivo |
|---|---|---|
| Fonte e rota | brapi, **cotação simples** de um ativo por consulta (`/api/quote/{ticker}`, que vale para ações e FIIs em todos os planos), com o token no cabeçalho `Authorization: Bearer`. O adaptador confere os campos na primeira coleta real | Única rota de cotação de FIIs aberta no plano gratuito; trocar de provedor é trocar o adaptador (DA06) |
| Token | `BRAPI_TOKEN` no `api/.env` (fora do Git). **Cada pessoa da equipe usa o seu**: a cota é por chave. Sem token, a brapi só responde PETR4, MGLU3, VALE3 e ITUB4, e a tela do colaborador avisa | Segredo não vai para o GitHub; dois computadores com a mesma chave gastariam a mesma cota |
| Quais ativos | Só os **ativos** do catálogo (arquitetura, fluxo 7.2) | Desativado não pode ser comprado; para vender, quem tem usa o fechamento da B3 (SPEC-008), que continua sendo coletado |
| **Horário** | Coletas de **30 em 30 minutos, das 10h30 até 30 minutos depois do fechamento** (horário de Brasília). A B3 muda o fechamento duas vezes por ano, junto com o horário de verão dos EUA: do primeiro pregão depois do 2º domingo de março até o primeiro pregão depois do 1º domingo de novembro, a negociação vai até 17h (última coleta às 17h30, 15 coletas por dia); no resto do ano, até 18h (última às 18h30, 17 coletas). Os horários ficam num lugar só (`SESSION`, em `trading-session.ts`), caso a B3 mude a regra | Com o atraso de ~30 minutos da brapi, a coleta das 10h30 já traz o começo do pregão, e a última traz o preço do fechamento. Em 2026: 10h–16h55 de 9/3 a 2/11; 10h–17h55 a partir de 3/11 |
| Regra do intervalo | A cada coleta, o processador reparte o que sobra de **90% da cota do ciclo** entre os ativos ativos e as coletas que faltam até o fim do ciclo. *Ajuste da implementação:* com token, a brapi conta a cota por **ciclo de cobrança** (não pelo mês do calendário) e informa em cada resposta o limite, o que sobra e quando renova (`x-ratelimit-limit`, `x-ratelimit-remaining`, `ratelimit-reset`); o processador usa esses números. Sem essa informação (sem token, ou antes da primeira consulta), usa `BRAPI_MONTHLY_QUOTA` (padrão 15.000) por mês do calendário. Se der para todos, busca a cada 30 minutos; se não der, pula coletas, mantendo-as espaçadas, e **a do fechamento sempre acontece**. Os outros 10% ficam como reserva (testes, novas tentativas) | Nunca mais de uma consulta por ativo a cada 30 minutos; nunca estourar a cota (decisão 2) |
| Dia de pregão | Fim de semana e feriado (calendário da SPEC-005): nenhuma coleta. Ano sem calendário publicado: nenhuma coleta, e a execução registra o motivo | RB11; o aviso do calendário no Início do colaborador já existe |
| Cotação repetida ou antiga | O horário da cotação (`regularMarketTime`) é a chave: a mesma cotação duas vezes não duplica nada. Cotação de outro dia (antes da abertura, ou em dia de abertura tardia, como a Quarta-feira de Cinzas às 13h) é ignorada, sem erro. *Ajuste da implementação:* o `regularMarketTime` é o horário em que a brapi atualizou o dado, não o do negócio (no feriado de 2/11/2026 ela mostrava o horário do dia com os preços de sexta). Por isso, preço igual ao fechamento anterior guardado, com o fechamento anterior da brapi diferente dele, também é cotação antiga e é ignorada | Idempotência (DA07); a brapi devolve o preço de ontem enquanto o pregão não abre |
| Validação | Preço positivo; dentro da mínima e da máxima do dia, quando vierem; horário da cotação num dia de pregão e não no futuro. Valores lidos pelo texto do número, em decimal, sem conta em ponto flutuante | RNF12; dado estranho vira erro registrado, não preço na tela |
| **Falhas** | Erro de rede ou resposta 5xx: **uma** nova tentativa do mesmo ativo depois de 10 segundos; se falhar de novo, erro registrado e a coleta segue com os outros ativos. Resposta 429: a coleta para ali e termina como `parcial`; a próxima coleta, 30 minutos depois, tenta de novo. **Cota esgotada** (429 sem cota restante): a execução termina como `cota_esgotada` e não há novas coletas até a cota renovar, com aviso ao colaborador. Em qualquer falha, o app continua mostrando a última cotação válida, com o horário dela (RNF13) | Falha parcial não interrompe o todo (DA07); a próxima coleta, 30 minutos depois, já é a nova tentativa, sem gastar cota à toa |
| **Fechamento provisório** | Depois da última coleta do dia, o preço final de cada ativo vai para `cotacao_diaria` com fonte `brapi`: abertura, máxima, mínima e fechamento do dia; **preço médio, negócios e volume ficam vazios** (a brapi não traz esses dados como a B3). Na manhã seguinte, o arquivo da B3 substitui (precedência da SPEC-008) | O dia de hoje já aparece nos gráficos à noite; se a B3 atrasar o arquivo, o dia não fica sem fechamento |
| Ajuste na SPEC-008 | A atualização diária da B3 passa a escolher os dias a buscar pelo **último pregão vindo da B3**, não pelo último de qualquer fonte (`quoteRanges` só conta a B3; a situação do histórico na tela também) | Sem isso, o fechamento provisório da brapi faria a B3 pular o dia e nunca substituí-lo |
| Variação do dia | Último preço comparado ao **fechamento do pregão anterior** guardado (B3 ou provisório); se não houver, o fechamento anterior informado pela brapi. Percentual com 2 casas, arredondado meio para cima (RB13) | Mesma referência dos gráficos |
| Retenção (OPEN-40) | Cotações do pregão guardadas por **30 dias** (limpeza diária); o fechamento de cada dia fica para sempre | Para o preço atual basta a última; 30 dias é o prazo já decidido para logs |
| Registro | Cada coleta grava uma execução da tarefa `cotacao_pregao`, com o **número de consultas** feitas e a cota que a brapi informou (restante, limite e renovação); cada falha por ativo vira erro da execução | DA14; o uso da cota vem do próprio registro |
| Texto na tela | "Cotação das 14:30 (atraso de até 30 min)" para cotação de hoje; "Cotação de 31/10 às 18:00" para cotação de outro dia; "Fonte: brapi". **Nunca** "tempo real" | DA16 e decisão 1 |
| Cache (RNF03) | **Sem Redis nesta Spec**: a última cotação de ~50 ativos sai do PostgreSQL com um índice. O Redis entra quando a carteira ao vivo (SPEC-014/019) precisar | Menos uma peça para instalar e hospedar agora; a consulta é pequena |
| Onde fica | Módulo **Dados de Mercado** (adaptador em `infrastructure`); o catálogo recebe a última cotação por uma porta, como já recebe a situação do histórico | Mesma separação da SPEC-008 |

## 5. Comportamento esperado

### 5.1 Tarefa do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `cotacao_pregao` | A cada 30 minutos, das 10h30 até 30 minutos depois do fechamento, em dia de pregão | Decide pela regra do intervalo se esta coleta acontece; busca a cotação de cada ativo ativo; grava as novas; na última do dia, grava o fechamento provisório |
| Limpeza | Uma vez por dia | Apaga cotações do pregão com mais de 30 dias |

| Situação da execução | Quando |
|---|---|
| `sucesso` | Todos os ativos responderam |
| `parcial` | Algum ativo falhou ou a coleta parou num 429, mas algum respondeu |
| `falha` | Nenhum ativo respondeu (ou o ano não tem calendário publicado) |
| `cota_esgotada` | A brapi avisou que a cota do ciclo acabou; as coletas param até ela renovar |

### 5.2 Rotas

| Rota | Quem | Mudança |
|---|---|---|
| `GET /api/assets` | Qualquer pessoa conectada | Cada ativo ganha `quote`: `{ price, change, at, source: 'brapi' }` ou `null` (sem cotação ainda). `price` e `change` em decimal (texto), `at` em ISO 8601 |
| `GET /api/collaborator/assets` | Colaborador | O mesmo `quote` por ativo, e a resposta ganha `quoteCollection`: última coleta (horário e situação), intervalo atual, consultas usadas e cota do ciclo, quando a cota renova, cota esgotada e se há token configurado |

Nenhuma rota devolve cotações em massa ou fora das telas do app (decisão 1).

### 5.3 Telas

| Situação | Tela |
|---|---|
| Lista Ativos (usuário e colaborador) | Nova coluna **"Último preço"**: preço em reais no formato do idioma, variação com sinal (+1,23% / −0,85%, nunca só pela cor) e o horário: "Cotação das 14:30 (atraso de até 30 min)" ou "Cotação de 31/10 às 18:00". Sem cotação: "Sem cotação ainda" |
| Rodapé da lista | "Cotações da brapi, com atraso de até 30 minutos. Não são em tempo real." |
| Tela do colaborador | Junto do contador: "Cotações do pregão: última coleta às 14:30 · a cada 30 min · 6.240 de 15.000 consultas no ciclo da brapi". Avisos: sem token ("só PETR4, MGLU3, VALE3 e ITUB4 recebem cotação", lembrando que cada pessoa gera o próprio token), cota esgotada ("as cotações voltam em 01/12 às 00:00"), intervalo maior que 30 minutos por causa da cota e última coleta com falhas |
| Janela estreita (480px) | O preço vai para baixo do nome do ativo |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `cotacao_pregao` (nova) | `ativo_id`, `momento`, `nivel`, `preco`, `abertura_dia`, `maxima_dia`, `minima_dia`, `fechamento_anterior`, `fonte`, `coletada_em` | Chave (`ativo_id`, `momento`, `nivel`); `ativo_id` aponta para `ativo`; `preco` positivo e entre mínima e máxima do dia quando vierem; `momento` nunca em fim de semana no horário de Brasília; `nivel` em lista fechada (`gratuito`, `assinante`); `fonte` em lista fechada |
| `cotacao_diaria` (muda) | `preco_medio`, `negocios`, `volume` passam a aceitar vazio | Vazios **só** quando `fonte = 'brapi'`; vindo da B3, continuam obrigatórios |
| `execucao_tarefa` (muda) | Novas colunas `consultas`, `cota_restante`, `cota_limite`, `cota_renova_em` | `consultas` não negativa, padrão 0; cota restante e limite não negativos ou vazios |
| `tarefa_ingestao` (muda) | Novo valor `cotacao_pregao` | — |
| `situacao_execucao` (muda) | Novo valor `cota_esgotada` | — |
| `nivel_cotacao` (novo tipo) | `gratuito`, `assinante` | — |

COTACAO passa a ter data e hora, fonte e nível (arquitetura §9, DA16). Nenhuma tabela nova guarda dado pessoal (DA13). A migração tem `down.sql` (RNF17).

Configuração nova do servidor e do processador: `BRAPI_TOKEN` (opcional; **cada pessoa usa o seu**, ver README), `BRAPI_MONTHLY_QUOTA` (padrão 15.000, usada só quando a brapi não informa a cota) e `BRAPI_BASE_URL` (padrão `https://brapi.dev`; os testes apontam para um servidor falso).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O adaptador lê a resposta da brapi (ação e FII) em preço, horário, abertura, máxima, mínima e fechamento anterior, em decimal; envia o token; ticker desconhecido, resposta malformada e 429 viram erros distintos |
| CA02 | Coletas só em dia de pregão e no horário do §4.2, com a troca de horário de março e novembro; fim de semana, feriado e ano sem calendário não geram consulta |
| CA03 | Regra do intervalo: com N ativos e a cota que sobra, o total de consultas do ciclo nunca passa de 90% da cota; nunca mais de uma consulta por ativo a cada 30 minutos; a coleta do fechamento sempre acontece; com cota suficiente, coleta a cada 30 minutos |
| CA04 | A mesma cotação duas vezes não duplica (idempotência); cotação de outro dia é ignorada sem erro |
| CA05 | Rede ou 5xx: uma nova tentativa; ativo que falha não para os outros; 429 encerra a coleta como `parcial`; cota esgotada suspende as coletas até a cota renovar; o app continua mostrando a última cotação válida (RNF13) |
| CA06 | Depois da última coleta, o fechamento provisório vai para `cotacao_diaria` com fonte `brapi`; o arquivo da B3 da manhã seguinte o substitui; a B3 nunca é substituída pela brapi |
| CA07 | Cada coleta grava a execução com situação, registros, ativos afetados e consultas; cada falha aponta o ativo |
| CA08 | Cotações do pregão com mais de 30 dias são apagadas; o fechamento diário não |
| CA09 | Lista Ativos mostra preço, variação com sinal e horário com o aviso de atraso; sem cotação, "Sem cotação ainda"; nenhuma tela escreve "tempo real"; a fonte aparece |
| CA10 | Tela do colaborador mostra a última coleta, o intervalo, o uso da cota e os avisos (sem token, cota esgotada, intervalo maior) |
| CA11 | Português e inglês (moeda e horário no formato do idioma), usável pelo teclado e a 480px (RNF04, RNF18, RNF20) |
| CA12 | As tabelas existem com as restrições do §6 e a migração pode ser desfeita e refeita (RNF17) |
| CA13 | Testes automatizados do adaptador, da regra do intervalo e dos horários, sem acessar a internet (respostas da brapi montadas nos testes) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-07 | ✅ **Resolvida** (Luís, 02/11/2026): uso da brapi para mostrar as cotações no próprio app, com as regras da decisão 1 |
| OPEN-48 | Parte da brapi: ✅ a cotação simples de FII funciona no plano gratuito (conferido em 02/11/2026 com uma consulta real do MXRF11, com token). Sem token, só PETR4, MGLU3, VALE3 e ITUB4 |
| OPEN-40 | ✅ Cotações do pregão por 30 dias; fechamento diário para sempre (Luís, 02/11/2026) |
| RNF03 | ✅ Redis fica para a carteira ao vivo (SPEC-014/019); aqui a última cotação vem do PostgreSQL (Luís, 02/11/2026) |
| DA16, ponto 4 | Parcial: dias de abertura tardia só repetem a cotação anterior (ignorada); leilões de abertura e fechamento não são tratados à parte |
| OPEN-08 | Compra e venda com a bolsa fechada: fica com as SPECs 013 e 014 |
| — | Token de produção: escolher junto com a hospedagem (OPEN-02) |

## 9. Verificação (02/11/2026)

| Critério | Resultado |
|---|---|
| CA01 | ✅ Adaptador (`brapi-quote-source.test.ts`, com `fetch` falso): ação e FII lidos em decimal pelo texto do número (`decimal.test.ts` recusa notação científica), token no `Authorization`, sem token nenhum cabeçalho; 404/400 (não encontrado), 401/402/403 (token), 429 com e sem cota restante, 5xx, rede fora e JSON quebrado viram erros distintos; cabeçalhos de cota incompletos não viram cota. Formato conferido antes com 2 consultas reais (PETR4 sem token e MXRF11 com token) |
| CA02 | ✅ Horários (`trading-session.test.ts`): troca de 9/3 e 3/11 de 2026, 15 ou 17 coletas, horário de Brasília independente da máquina. Coleta (`intraday-collection.test.ts`): fim de semana, feriado e antes das 10h30 não consultam; ano sem calendário registra o motivo uma vez por dia |
| CA03 | ✅ Regra pura (`quota-plan.test.ts`): ciclo inteiro simulado com 50 e com 200 ativos sem passar da cota, usando quase toda, coletas espaçadas e o fechamento todo dia; com pouca cota, só o fechamento |
| CA04 | ✅ Em memória e no PostgreSQL: a mesma cotação não duplica (outro nível é outra cotação); cotação de outro dia e cotação antiga com horário novo (caso do feriado) ignoradas sem erro |
| CA05 | ✅ Uma nova tentativa depois de 10 s na rede; ticker não encontrado e dado estranho viram erro com o ativo e a coleta segue; 429 para como `parcial`; cota esgotada para como `cota_esgotada` até renovar e volta depois; a última cotação válida continua na tela |
| CA06 | ✅ Fechamento provisório só na última coleta, com média, negócios e volume vazios; a B3 o substitui e nunca é substituída (`history-ingestion.test.ts`: o provisório não faz a B3 pular o dia) |
| CA07 | ✅ PostgreSQL: execução com situação, registros, ativos, consultas e a cota informada; consultas negativas recusadas |
| CA08 | ✅ Limpeza apaga só cotações do pregão com mais de 30 dias; o fechamento diário fica |
| CA09 | ✅ Formatos (`format.test.ts`): reais e variação com sinal nos dois idiomas, horário de Brasília e data quando é de outro dia. Rota (`asset-routes.test.ts`): `quote` na busca e no catálogo. Conferido na tela: preço, variação (+ verde, − vermelho, 0 cinza), "Cotação das 19:15 (atraso de até 30 min)", "Cotação de 30/10 às 18:00", "Sem cotação ainda" e o rodapé com a brapi; nenhum "tempo real" |
| CA10 | ✅ Conferido na tela do colaborador: linha da coleta e os quatro avisos (sem token, cota esgotada, intervalo de 45 min e última coleta com falhas) |
| CA11 | ✅ Português e inglês ("R$52.71", "07:16 PM"), tema claro e escuro, 480px com o preço embaixo do nome; contraste das cores de variação de 5,3:1 a 6,5:1 no tema claro. A coluna nova é só texto: o teclado continua como na SPEC-006 |
| CA12 | ✅ PostgreSQL: fim de semana, preço fora da faixa e fechamento da B3 incompleto recusados. Migração `20261102120000_cotacoes_pregao` sem diferença para o esquema do Prisma, desfeita e refeita sozinha, desfeita **com dados** (sai só o provisório da brapi e as execuções da coleta; o histórico da B3 fica) e no ciclo completo do CI (todas desfeitas e refeitas). Aplicada também no banco de desenvolvimento |
| CA13 | ✅ Nenhum teste acessa a internet: respostas da brapi montadas nos testes (`FakeQuoteSource` e `fetch` falso) |
| Ponta a ponta | ✅ Peças reais (configuração, `BrapiQuoteSource` com `fetch` de verdade, repositórios do Prisma e PostgreSQL de teste) contra um servidor HTTP falso da brapi: 18 verificações, da primeira coleta à pausa por cota esgotada e à limpeza. API compilada sobe e responde (`/api/health` ok; busca sem login, 401) |

Total: **549 testes** passando (com o banco real), lint, tipos, formatação e build.

**Antes de usar de verdade:** cada pessoa da equipe gera o **próprio** token na brapi e coloca em `BRAPI_TOKEN` no `api/.env` (passo a passo no README). As cotações só aparecem com o processador ligado (`npm run dev:worker`) em horário de pregão; ele também roda a carga do histórico da SPEC-008, que na primeira vez baixa os arquivos anuais da B3.

**Para as próximas Specs:** a SPEC-010 (ficha do ativo) lê a última cotação por `IntradayCollection.latestQuotes()` e o fechamento diário de `cotacao_diaria` (o provisório da brapi vem com fonte `brapi`); a SPEC-011 mostra as execuções de `cotacao_pregao` com consultas e cota; a SPEC-014 usa a última cotação como preço da compra ao vivo; o nível `assinante` (SPEC-026) grava na mesma tabela com outro `nivel`.
