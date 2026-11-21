# SPEC-033 — Notificações de variação relevante

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 17/11/2026 a pedido do Luís, aprovada com as recomendações do §4.1 ("Aprovo, implemente", 17/11/2026) e implementada (§9) |
| Fase | 8 — Experiência e conformidade ([mapa de specs](mapa_specs.md)) |
| Prioridade | Could (RF35) |
| Depende de | [SPEC-009](SPEC-009.md) (cotações do pregão e variação do dia), [SPEC-014](SPEC-014.md) (posições); usa as posições da histórica ([SPEC-016](SPEC-016.md)), a ficha do ativo ([SPEC-010](SPEC-010.md)), o modo consulta ([SPEC-032](SPEC-032.md)) e o idioma ([SPEC-035](SPEC-035.md)) |
| Muda | O servidor (uma rota de leitura: a variação do dia dos ativos das carteiras do usuário), o app (avisos do sistema operacional com o app aberto ou minimizado; a escolha em **Meu perfil**; o clique no aviso abre a ficha) e o mapa (OPEN-35) |
| Requisitos | RF35 (o RF34, aviso de vencimento de renda fixa, foi adiado pela DA22); RNF04, RNF18, RNF19, RNF20 |
| Casos de uso | — (o diagrama não tem caso de uso para os avisos; ver OPEN-43) |
| Drivers | OBJ02 |
| ADRs | [DA03](../adr/DA03-cliente-desktop-multiplataforma.md) (notificações do sistema operacional), [DA07](../adr/DA07-ingestao-assincrona.md) (o app só lê o que o processador gravou), [DA13](../adr/DA13-dados-pessoais-concentrados.md) (nenhum dado pessoal novo), [DA16](../adr/DA16-cotacoes-por-plano.md) (cotação do nível gratuito, com atraso) |

---

## 1. Objetivo

Enquanto o app está aberto, mesmo minimizado, o usuário recebe um **aviso do Windows** quando um ativo das suas carteiras **sobe ou cai muito no dia** (5% ou mais, por padrão): "PETR4 subiu 5,2% hoje", com o preço, o horário da cotação e as carteiras em que ele está. O clique no aviso abre a ficha do ativo.

## 2. Valor

- **Usuário (P01, P02):** acompanha o que acontece com os ativos das simulações sem ficar olhando a tela da carteira, e percebe no mesmo dia um movimento que vale entender (uma notícia, um resultado).
- **Projeto:** fecha o RF35 com um recurso do sistema operacional, que é uma das razões do app ser desktop (DA03).

## 3. Escopo

### 3.1 Inclui

1. **Avisos do sistema operacional** de variação relevante dos ativos em posição nas carteiras do usuário (ao vivo e históricas), durante o pregão, com o app aberto ou minimizado.
2. A escolha em **Meu perfil**: avisos ligados ou desligados e o limiar (3%, 5% ou 10%), guardados neste computador.
3. O **clique no aviso**, que traz o app para a frente na ficha do ativo.
4. Uma **rota de leitura** com a variação do dia dos ativos das carteiras do usuário.

### 3.2 Não inclui

- **Aviso com o app fechado** (por e-mail ou por um serviço em segundo plano): §4.1, decisão 1.
- **Aviso de vencimento de renda fixa** (RF34): a renda fixa foi adiada (DA22).
- Avisos de **preço-alvo**, de **notícias** e de **proventos**, e avisos para o **colaborador**.
- Uma **lista dos avisos** dentro do app.
- **Cotação em tempo real**: as cotações do pregão têm atraso de até 45 minutos (DA16), e o aviso diz isso.

## 4. Decisões

### 4.1 Recomendações para o Luís aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Onde o aviso aparece e com o app fechado** (OPEN-35) | Aviso do **sistema operacional** (a notificação do Windows), **enquanto o app está aberto, mesmo minimizado**. Com o app fechado, nenhum aviso | A DA03 escolheu o desktop também pelos recursos do sistema, e o aviso do Windows não pede provedor, conta nem consentimento. Avisar com o app fechado exigiria e-mail (o provedor ainda não foi escolhido, SPEC-004; seria preciso pedir consentimento e cuidar para não virar spam) ou deixar o app rodando na bandeja, o que muda o que "fechar" faz hoje. Fica como evolução |
| 2 | **O que é "variação relevante"** (OPEN-35) | A **variação do dia** (a última cotação do pregão contra o fechamento do pregão anterior, a mesma da lista Ativos e da ficha, SPEC-009) de **5% ou mais, para cima ou para baixo**. A pessoa escolhe **3%, 5% ou 10%** em Meu perfil, ou desliga | Um movimento de 5% num dia é raro para a maioria das ações e dos FIIs: o aviso aparece pouco e quando importa. 3% é para quem quer acompanhar de perto; 10%, só os extremos. A variação sobre o preço médio já está na tela da carteira; o aviso é sobre o que aconteceu hoje |
| 3 | **Quais ativos** | Os **em posição em qualquer carteira** do usuário, ao vivo ou histórica, com **um aviso por ativo**, mesmo que ele esteja em várias carteiras (o aviso diz quais) | A histórica também tem posição hoje, avaliada pelo último preço (SPEC-016). Um ativo em três carteiras não vira três avisos |
| 4 | **Quantas vezes** | No máximo **um aviso por ativo por dia em cada sentido** ("subiu" e, se ele virar, "caiu"). Com **mais de 3 ativos** na mesma conferência, **um aviso só**, com a lista. O que já foi avisado hoje fica guardado neste computador e não se repete quando o app é reaberto | O aviso não pode incomodar: num dia de queda geral, seriam dezenas de avisos |
| 5 | **Onde fica a escolha** | Em **Meu perfil**, na seção **Avisos de variação**: **ligados por padrão, com 5%**. A escolha fica **neste computador**, para cada conta, como o idioma (SPEC-035) | O aviso é deste computador. Nada muda no servidor nem no banco, e nenhum dado pessoal novo é guardado (DA13). Ligado por padrão para a pessoa descobrir o recurso; desligar é um clique |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Quando o app confere** | Nos dias úteis, das **10:30 às 18:30** (o horário das coletas do pregão, SPEC-009), **a cada 5 minutos** enquanto o app está aberto. A rota responde com ETag e "nada mudou" (304) na maior parte das vezes, então conferir é barato (RNF19). Em feriado não há cotação do dia, e nada é avisado | As cotações chegam de 30 em 30 minutos; conferir a cada 5 minutos avisa logo depois da coleta, sem pesar no servidor |
| **Texto do aviso** | Título "PETR4 subiu 5,2% hoje"; texto "R$ 38,40 às 14:30 (atraso de até 45 min) · Carteiras: Aposentadoria e Dividendos". Agrupado: título "5 ativos das suas carteiras caíram 5% ou mais hoje"; texto "VALE3 −6,1%, PETR4 −5,4%, ITUB4 −5,1% e mais 2". No idioma da interface. **Sem valores da carteira** (patrimônio, resultado) | O que importa cabe no aviso. Quem está perto da tela vê o preço do ativo, que é público, e não o dinheiro da simulação |
| **Clique no aviso** | Traz a janela do app para a frente (restaura se estiver minimizada) e abre a **ficha do ativo** (SPEC-010); no aviso agrupado, a tela **Carteiras** | É onde está a explicação do movimento (gráfico, indicadores, proventos) |
| **A rota** | `GET /api/portfolios/day-changes`, só para a conta de usuário: os ativos em posição nas carteiras dele que têm cotação do pregão de **hoje**, com ticker, nome, preço, variação do dia, horário da coleta e as carteiras (id e nome). Sem cotação de hoje (antes das 10:30, feriado, fim de semana), a lista vem vazia. Com ETag (RNF19). Colaborador: 403 | Nenhuma rota de hoje junta as posições de todas as carteiras com a variação do dia |
| **Onde a conferência roda** | Na interface, que tem os textos no idioma escolhido, mesmo com a janela minimizada (uma conferência a cada 5 minutos não sofre com a economia de energia das janelas escondidas). O processo principal só mostra o aviso do sistema e avisa a interface do clique | O processo principal não tem os textos do app; a interface já tem a sessão e as leituras |
| **Nome do app no aviso** | O app passa a se identificar no Windows com o `appId` do instalador (`br.mackenzie.simulador-investimentos`), para o aviso sair com o nome e o ícone do app | Sem isso, o aviso pode aparecer como "Electron" durante o desenvolvimento |
| **Sem conexão** (SPEC-032) | Não confere nem avisa; quando a conexão volta, a próxima conferência avisa o que ainda estiver acima do limiar | Sem conexão não há cotação nova |
| **Configurações do Windows** | Se as notificações do app estiverem desligadas no Windows, ou com o "Não incomodar" ligado, o aviso não aparece; o app não insiste nem pede permissão. Meu perfil explica: "Os avisos seguem as configurações de notificação do Windows" | É a pessoa quem decide no sistema |
| **Ao ligar ou mudar o limiar** | Vale a partir da próxima conferência; o que já passou do novo limiar hoje é avisado uma vez | O comportamento esperado de quem acabou de ligar |
| **Colaborador** | Não recebe avisos (não tem carteira) e não vê a seção em Meu perfil | RF35 é do usuário |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Segunda, 14:35: PETR4 a R$ 38,40, +5,2% sobre o fechamento de sexta; ele está em "Aposentadoria" e "Dividendos" | Aviso "PETR4 subiu 5,2% hoje", com "R$ 38,40 às 14:30 (atraso de até 45 min) · Carteiras: Aposentadoria e Dividendos". O clique abre a ficha do PETR4 |
| 15:05: PETR4 chega a +7% | Nada: ele já foi avisado hoje como "subiu" |
| 16:00: PETR4 vira e fica em −5,3% | Aviso "PETR4 caiu 5,3% hoje" (o outro sentido) |
| Dia de queda geral: 6 ativos das carteiras caem 5% ou mais na mesma conferência | Um aviso só, "6 ativos das suas carteiras caíram 5% ou mais hoje", com os 3 maiores e "e mais 3"; o clique abre Carteiras |
| O app é fechado às 15:00 e reaberto às 16:00 | O que já foi avisado não se repete |
| Limiar em 10% | PETR4 +5,2% não avisa |
| Feriado ou fim de semana | A rota vem vazia; nenhum aviso |
| Sem conexão | Nenhum aviso até a conexão voltar |
| Conta de colaborador | Nenhum aviso; Meu perfil não mostra a seção |
| App fechado | Nenhum aviso (decisão 1) |

### 4.4 Conferido em 17/11/2026

| Pergunta | Resposta |
|---|---|
| As cotações do pregão | Coletadas de 30 em 30 minutos, das 10:30 até meia hora depois do fechamento (17h enquanto vale o horário de verão dos EUA, 18h no resto do ano), com atraso de até 45 minutos (DA16, SPECs 009 e 040) |
| A variação do dia | `AssetQuote.change`: a última cotação contra o fechamento do pregão anterior guardado da B3, em %, com 2 casas; `null` sem essa referência (SPEC-009) |
| As rotas | Nenhuma devolve a variação do dia dos ativos de uma carteira: as posições trazem o último preço e a variação sobre o preço médio; a lista Ativos traz a variação do dia, mas por busca |
| O app | Não mostra notificações hoje e não se identifica no Windows (`setAppUserModelId`); o `appId` do instalador é `br.mackenzie.simulador-investimentos`. Fechar a janela fecha o app (não há ícone na bandeja) |
| Escolhas locais | O idioma fica neste computador (SPEC-035), e o modo consulta guarda as leituras (SPEC-032) |
| Os documentos | RF35 é *Could*; a OPEN-35 pergunta o limiar e o aviso com o app fechado; a arquitetura tem o módulo Notificações (RF35) e cita e-mail no diagrama de contexto; a DA03 cita as notificações do sistema operacional |

## 5. Comportamento esperado

### 5.1 A rota

| Rota | Detalhes |
|---|---|
| `GET /api/portfolios/day-changes` | Só a conta de usuário (403 para colaborador, 401 sem sessão). Para cada ativo em posição em alguma carteira dela, com cotação do pregão de hoje: `assetId`, `ticker`, `name`, `price`, `change` (variação do dia, em %, ou `null` sem referência), `at` (horário da coleta) e `portfolios` (id e nome, na ordem da lista de carteiras). Sem cotação de hoje, lista vazia. Com ETag (304 quando nada mudou) |

### 5.2 No app

| Quando | O quê |
|---|---|
| Dia útil, das 10:30 às 18:30, a cada 5 minutos, com a conta de usuário e os avisos ligados | Lê a rota; para cada ativo com `|change|` ≥ limiar que ainda não foi avisado hoje naquele sentido, prepara o aviso; até 3, um aviso por ativo; mais que 3, um aviso agrupado (os 3 maiores e "e mais N"). Guarda o que avisou, com a data |
| Clique no aviso | Restaura e traz a janela para a frente; abre a ficha do ativo (ou Carteiras, no agrupado) |
| Sem conexão, avisos desligados, colaborador | Não confere |

### 5.3 Meu perfil

Seção **Avisos de variação**, para a conta de usuário: a caixa "Avisar quando um ativo das minhas carteiras subir ou cair muito no dia" (marcada por padrão) e a escolha do limiar (3%, 5% ou 10%), com a dica: "Só com o app aberto (pode estar minimizado), durante o pregão. As cotações têm atraso de até 45 minutos. Os avisos seguem as configurações de notificação do Windows." A escolha vale na hora, fica neste computador e é de cada conta. Em português e em inglês, pelo teclado e a 480 px.

## 6. Modelo de dados

Nenhuma mudança no banco: sem tabela e sem migração. A escolha (ligado e limiar) e os avisos já dados no dia ficam neste computador, para cada conta.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | `GET /api/portfolios/day-changes` devolve os ativos em posição nas carteiras do usuário (ao vivo e históricas) com cotação de hoje, a variação do dia e as carteiras; vazia sem cotação de hoje; 403 para colaborador e 401 sem sessão; ETag e 304 |
| CA02 | Com o app aberto ou minimizado, no horário do pregão, um ativo com variação de pelo menos o limiar gera um aviso do sistema; no máximo um por ativo por dia em cada sentido; mais de 3 ativos de uma vez viram um aviso só; nada se repete ao reabrir o app |
| CA03 | O aviso tem o ticker, o sentido, a variação, o preço, o horário e o atraso da cotação e as carteiras, no idioma da interface, sem valores da carteira; o app aparece com o próprio nome |
| CA04 | O clique traz a janela para a frente na ficha do ativo (ou em Carteiras, no agrupado) |
| CA05 | Meu perfil tem a seção com o liga e desliga e o limiar (3%, 5% ou 10%), guardados neste computador para cada conta; desligado, o app não confere; o colaborador não vê a seção |
| CA06 | Sem conexão, com o app fechado ou com as notificações do Windows desligadas, nenhum aviso |
| CA07 | A seção de Meu perfil em português e inglês, pelo teclado, a 480 px e com contraste |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-35 | ✅ Resolvida para o RF35 com as decisões 1 e 2 do §4.1 (17/11/2026): limiar de 5% no dia (3% ou 10% à escolha) e nenhum aviso com o app fechado. A antecedência do aviso de vencimento (RF34) fica com a renda fixa (DA22) |
| OPEN-43 | O diagrama de casos de uso continua sem os avisos; fica para a atualização do diagrama |
| Evolução | Aviso com o app fechado (e-mail ou bandeja), preço-alvo, notícias e proventos |

## 9. Verificação (18/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | No servidor, `TradingService.dayChanges` (as posições de hoje de cada carteira, ao vivo e histórica) e a rota em `portfolio-routes.ts`; a variação vem do adaptador de mercado (`MarketQuote.change`), com a mesma conta da lista Ativos (`percentChange` sobre o fechamento anterior guardado da B3). No app, os canais `portfolios:day-changes`, `notify:show` e `notify:clicked` (`NOTIFY_CHANNELS`); no processo principal, `variation-notice.ts` confere o pedido da interface (título até 120 caracteres, texto até 300, destino: a ficha de um ativo ou Carteiras); na interface, `variation.ts` (a escolha, os avisos dados, o horário, o que avisar e os textos), `useVariationNotices.ts` (a conferência) e `VariationAlerts.tsx` (Meu perfil) |
| Leitura da rota | Pela mesma leitura das telas, com o ETag guardado (quase sempre 304), mas sem mexer na data da faixa do modo consulta. Uma resposta vinda da cópia local (a conexão caiu no meio) é ignorada |
| Guardado antes de mostrar | O que vai ser avisado fica guardado antes de pedir o aviso: se o app fechar no meio, nada se repete |
| Clique pela Central de Ações | O processo principal guarda os avisos (os 30 últimos) até o clique, mesmo depois de saírem da tela para a Central de Ações do Windows: sem a referência, esse clique se perdia |
| Ao sair da conta | Os avisos da conta saem da Central de Ações, porque têm os nomes das carteiras (não estava na Spec) |
| Carteiras no aviso | Até 3 nomes; com mais, "Carteiras: A, B, C e mais 3" (o aviso tem tamanho máximo, e o Windows corta texto longo). Com uma só, "Carteira:" |
| Agrupado nos dois sentidos | "N ativos das suas carteiras variaram 5% ou mais hoje" (a Spec só tinha os exemplos de um sentido); na lista, a variação com sinal |
| Sinal de menos | O do formato do idioma ("-6,1%"), como no resto do app, e não o "−" do exemplo |
| Limiar em Meu perfil | "3% (mais avisos)", "5% (padrão)" e "10% (só os extremos)"; com os avisos desligados, a lista fica desativada |
| Sem armazenamento local | A escolha e os avisos dados ficam na memória até fechar o app, como o idioma (SPEC-035) |
| Pré-visualização | A ponte falsa (`app/.previa`, fora do Git) ganhou `portfolios.dayChanges` e `notifications`, `?clock=` (põe o relógio do app no pregão) e `?changes=group` |

| Critério | Resultado |
|---|---|
| CA01 | ✅ `day-changes-routes.test.ts` (4 testes): carteiras ao vivo e histórica, o PETR4 nas duas (na ordem da lista), a cotação de ontem fora, a lista vazia na manhã seguinte, `change` nulo sem referência, ETag e 304, 403 para colaborador e 401 sem sessão. `portfolio-market.test.ts`: a variação sobre o fechamento guardado da B3 |
| CA02 | ✅ `variation.test.ts`: o limiar para cima e para baixo, um aviso por ativo por dia em cada sentido, mais de 3 viram um, os avisos dados valem só no dia, o horário (dias úteis, das 10:30 às 18:30 de Brasília, qualquer que seja o fuso do computador). Pré-visualização, com o relógio na segunda às 14:35: um aviso, "PETR4 subiu 5,2% hoje"; ao reabrir, nada se repete; com 3%, só o "ITUB4 caiu 3,4% hoje", que faltava |
| CA03 | ✅ `variation.test.ts`, com os textos de verdade: "PETR4 subiu 5,2% hoje" e "R$ 38,40 às 14:30 (atraso de até 45 min) · Carteiras: Aposentadoria e Dividendos"; o agrupado; em inglês, "PETR4 rose 5.2% today". Nenhum valor da carteira. O app se identifica no Windows com o `appId` do instalador. ⏳ Ver o aviso de verdade no Windows (Electron) |
| CA04 | ✅ Pré-visualização: o clique (simulado) abre a ficha do PETR4 e, no agrupado, Carteiras. ⏳ No Electron, conferir a janela restaurada e trazida para a frente |
| CA05 | ✅ Pré-visualização: a seção em Meu perfil, ligada com 5%; desligar guarda a escolha e desativa a lista; desligados, ao reabrir, a rota nem é lida; pelo teclado, a escolha de 3% fica guardada; o colaborador não vê a seção. Guardado por conta (`simulador.avisos.<id>`) |
| CA06 | ✅ Pré-visualização: sem conexão, a rota não é lida; com a conexão de volta, a conferência roda e avisa; às 19:00 e no sábado, nenhuma leitura. `variation-notice.test.ts`: pedidos estranhos recusados. ⏳ No Electron, com as notificações do app desligadas no Windows, nenhum aviso |
| CA07 | ✅ Pré-visualização: em português e em inglês; pelo teclado (Espaço liga e desliga, Tab vai para a lista, as setas mudam o limiar); a 480 px, sem rolagem lateral, nos temas claro e escuro, com a caixa e a lista de sempre do app; a dica ligada à caixa (`aria-describedby`) |

Total: **1.154 testes** passando (15 novos), com o banco de teste, mais lint, tipos e formatação.
