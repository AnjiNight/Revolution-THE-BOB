# SPEC-008 — Carga do histórico diário de cotações

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pela Nicoly em 29/10/2026 e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | *Must* |
| Depende de | [SPEC-001](SPEC-001.md) (processador), [SPEC-005](SPEC-005.md) (calendário de pregão), [SPEC-006](SPEC-006.md) (catálogo) |
| Requisitos | RF09 (parte histórica); RB11; RNF12, RNF13, RNF15, RNF17 |
| Casos de uso | Consultar cotação (lado do sistema) |
| Drivers | FAS03, QA02, QA08, QA12, PA03, RES03, RES07, PRE03 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA18](../adr/DA18-historico-cotacoes-arquivos-b3.md) (aceita nesta Spec) |

---

## 1. Objetivo

O processador passa a carregar o **fechamento diário** dos ativos do catálogo (ações e FIIs) a partir dos **arquivos de séries históricas da B3 (COTAHIST)**:

- **carga retroativa**: quando um ativo é cadastrado, o processador carrega o histórico dele desde o primeiro pregão de 2016;
- **atualização diária**: todo dia, o processador busca os pregões que ainda faltam e acrescenta o fechamento de cada ativo.

Cada execução fica registrada (quando, o que fez, quantos registros, quais erros). Esta Spec **estabelece o padrão de ingestão** (adaptador, idempotência, novas tentativas e execução registrada) que as SPECs 007, 009 e 027 reaproveitam.

## 2. Valor

- **Sistema:** passa a ter anos de preços, que são a base da carteira histórica (016), dos gráficos (010), da evolução patrimonial (019) e dos cenários (031).
- **Equipe:** cada carga deixa registro; uma falha aparece sem precisar abrir o banco (a tela de monitoramento vem na SPEC-011).
- **Custo zero** (RES03): os arquivos da B3 são públicos e gratuitos.

## 3. Escopo

### 3.1 Inclui

1. **Adaptador da B3** (DA06): baixa o arquivo anual (`COTAHIST_AAAA.ZIP`) ou diário (`COTAHIST_DDDMMAAAA.ZIP`), descompacta em fluxo e lê o formato posicional, ficando só com o mercado à vista dos tickers do catálogo.
2. **Carga retroativa** de cada ativo, ano a ano, de 2016 até o ano atual.
3. **Atualização diária** dos pregões que faltam, para todos os ativos do catálogo, ativos ou desativados.
4. **Registro de execuções** (`execucao_tarefa`) e dos erros de cada uma (`erro_execucao`), seguindo a DA14.
5. **Novas tentativas** quando a B3 não responde.
6. **Situação do histórico** de cada ativo na tela "Ativos" da Área do colaborador, com aviso dos anos que esperam o calendário.
7. **Regra de precedência** entre fontes, gravada junto de cada cotação.

### 3.2 Não inclui

- **Cotações do pregão** (a cada ~30 min, pela brapi): SPEC-009. Esta Spec só deixa a regra de precedência pronta.
- **Proventos e eventos corporativos** (dividendos, JCP, rendimentos de FIIs, desdobramentos, grupamentos): ficam para uma Spec própria (OPEN-06). Os preços são guardados **como a B3 publica, sem ajuste**.
- **Ficha do ativo e gráfico**: SPEC-010, que exibe o aviso de preços não ajustados.
- **Tela de monitoramento e botão de reexecutar**: SPEC-011. Aqui a equipe vê só a situação por ativo.
- **Série do Ibovespa** (OPEN-21) e **CDI** (SPEC-007).

## 4. Decisões tomadas nesta Spec

Aprovadas pela Nicoly em 29/10/2026: a **DA18 passa a Aceita** (histórico pelos arquivos COTAHIST da B3), a janela começa em **2016**, **proventos ficam fora** e o processador **coleta também os ativos desativados**.

| Tema | Decisão | Motivo |
|---|---|---|
| **Fonte (DA18, OPEN-05)** | Arquivos COTAHIST da B3: anual para a carga retroativa, diário para a atualização | Anos de dados sem custo; a brapi gratuita só tem 3 meses |
| **Janela (OPEN-05)** | A partir do **primeiro pregão de 2016** (04/01/2016). Para ativo que começou a ser negociado depois, o histórico começa no primeiro pregão dele | 10 anos cobrem a carteira histórica e o treino da IA (DA20) sem deixar o banco grande (~50 ativos × ~2.500 pregões) |
| **Proventos (OPEN-06)** | Fora desta Spec. Preço guardado como publicado, sem ajuste | Ainda não há fonte de proventos; ajustar errado seria pior do que não ajustar |
| **Ativo desativado** | Continua sendo coletado | O arquivo da B3 já traz todos os papéis; quem tem o ativo precisa de preço para vender (pendência da SPEC-006) |
| Precedência | Se o mesmo ativo e dia já tiverem cotação de outra fonte, **o arquivo da B3 substitui**; uma fonte que não é a B3 nunca substitui a B3. A lista de fontes já tem `brapi`, que a SPEC-009 passa a gravar | DA18 |
| Mercado | Só o **mercado à vista, lote padrão** (`TPMERC = 010`); ignora fracionário, opções e termo. O `CODBDI` não filtra (uma empresa em situação especial muda de código e perderia o histórico) | O catálogo só tem ações e FIIs negociados à vista (DA23) |
| O que guardar | Data, abertura, máxima, mínima, fechamento, preço médio, quantidade de negócios e volume financeiro, já divididos pelo fator de cotação (`FATCOT`) | Gráficos e cenários usam mais do que o fechamento; o custo é o mesmo |
| Precisão | Preços em decimal com 6 casas (divisão pelo fator arredondada meio para cima); volume com 2 casas (RNF12). Nada passa por ponto flutuante | Preço guardado como fonte; o arredondamento de 2 casas (RB13) acontece nos valores da carteira |
| Dia sem pregão | Linha de um dia que o calendário (SPEC-005) diz não ter pregão é **recusada** e vira erro da execução | RB11; mostra calendário errado em vez de esconder |
| **Ano sem calendário** | O processador só carrega pregões de anos com calendário publicado. Quando o calendário de um ano é publicado depois, a carga retroativa daquele ano acontece na verificação seguinte. A tela do colaborador avisa quais anos da janela estão esperando o calendário | O calendário é a referência de quais dias têm pregão |
| **Idempotência** | Rodar de novo a mesma carga não duplica nada: chave única (`ativo`, `data`) e gravação por "insere ou atualiza". Cada ano lido para um ativo fica marcado (`carga_historico`), mesmo sem cotações, e não é lido de novo | DA07; permite reexecutar sem medo |
| Arquivos baixados | Os arquivos **anuais de anos fechados** ficam guardados numa pasta do processador (`B3_CACHE_DIR`, padrão `api/.cache/b3`) e não são baixados de novo; o do ano atual e os diários são apagados depois de lidos | Um ano fechado nunca muda; cadastrar um ativo novo não baixa ~600 MB de novo |
| **Novas tentativas** | Até **3 novas tentativas** por arquivo, com espera de 1, 5 e 15 minutos. Arquivo que ainda não existe (404) não é erro: a execução termina como "aguardando publicação" e o dia é buscado de novo na próxima | A B3 publica o arquivo diário só depois do pregão |
| Horário | Atualização diária às **08:00** (horário de Brasília), mais uma vez ao iniciar o processador; carga retroativa verificada a cada **15 minutos** e ao iniciar. Uma execução nunca começa enquanto a anterior da mesma tarefa não terminou | O arquivo de um pregão já está publicado na manhã seguinte; ativo novo tem histórico em poucos minutos |
| Janela da atualização diária | Do dia seguinte ao último pregão guardado (o mais antigo entre os ativos, ignorando quem não tem cotação há mais de 90 dias) até ontem, voltando no máximo 90 dias. Só entram ativos que já passaram pela carga retroativa | Recupera alguns dias com o processador desligado sem baixar meses de arquivos diários |
| Registro | Verificação **sem trabalho não grava execução** (a carga retroativa olha a cada 15 minutos). Cada execução guarda no máximo 100 erros; o resto vira uma linha de resumo | O registro mostra o que aconteceu, sem 96 linhas vazias por dia |
| Ticker corrigido | O histórico segue o **ativo**, não o código: o que já foi carregado com o código antigo fica. A carga só busca pelo código atual | Mesmo princípio da SPEC-006 (BRDT3 virou VBBR3) |
| Falha de fonte | Não para o app nem o processador: a tarefa grava o erro, mantém o que já tinha e tenta de novo no próximo horário (RNF13) | DA07 |
| Onde fica | Módulo **Dados de Mercado** do servidor (arquitetura §6), com o adaptador em `infrastructure`. O catálogo recebe a situação do histórico por uma porta, sem ler cotações | Separação já prevista |

### 4.1 Formato do arquivo (resumo)

Cada linha tem 245 caracteres. Só as linhas com `TIPREG = 01` são cotações:

| Campo | Posição | Uso |
|---|---|---|
| `DATA` | 3–10 | Data do pregão (AAAAMMDD) |
| `CODBDI` | 11–12 | Classificação do papel (`02` lote padrão, `12` FIIs); não é usado como filtro |
| `CODNEG` | 13–24 | Ticker |
| `TPMERC` | 25–27 | `010` (à vista) |
| `PREABE`, `PREMAX`, `PREMIN`, `PREMED`, `PREULT` | 57–121 | Preços com 2 casas implícitas |
| `TOTNEG` | 148–152 | Número de negócios |
| `VOLTOT` | 171–188 | Volume financeiro com 2 casas implícitas |
| `FATCOT` | 211–217 | Fator de cotação (o preço vale para esse número de ações) |

## 5. Comportamento esperado

### 5.1 Tarefas do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `historico_retroativo` | A cada 15 min e ao iniciar | Para cada ano publicado de 2016 até o atual, lê o arquivo anual para os ativos que ainda não têm aquele ano marcado em `carga_historico`; marca o ano para cada um deles, com quantas cotações havia |
| `fechamento_diario` | 08:00 e ao iniciar | Lê o arquivo diário de cada pregão da janela do §4 e grava o fechamento dos ativos que já passaram pela carga retroativa |

Cada execução grava uma linha em `execucao_tarefa` com: tarefa, início, fim, situação, registros gravados, ativos afetados e período coberto. Cada problema (linha inválida, dia sem pregão, cotação de outro dia, ano sem calendário, falha de download depois das tentativas) grava uma linha em `erro_execucao`.

| Situação | Quando |
|---|---|
| `sucesso` | Todos os arquivos lidos, sem erro |
| `parcial` | Algum erro ou algum arquivo que falhou, mas algo foi lido |
| `falha` | Nenhum arquivo pôde ser lido |
| `aguardando_publicacao` | O arquivo esperado ainda não existe e nada foi gravado |

### 5.2 Rotas

| Rota | Quem | Mudança |
|---|---|---|
| `GET /api/collaborator/assets` | Colaborador | Cada ativo ganha `history`: `{ status: 'pending' \| 'loaded' \| 'not_found', from, to }`; a resposta ganha `historyYearsWithoutCalendar` (anos da janela sem calendário publicado) |

`not_found`: todos os anos publicados foram lidos e o ticker não apareceu em nenhum (ticker errado ou ativo que não é negociado à vista). Nenhuma rota nova para o usuário nesta Spec (a ficha vem na SPEC-010).

### 5.3 Telas

| Situação | Tela |
|---|---|
| Tela Ativos (colaborador) | Embaixo do nome de cada ativo: "Histórico: carregando…", "Histórico de {data} a {data}" ou "Histórico: não encontrado nos arquivos da B3" (âmbar) |
| Anos sem calendário | Aviso em âmbar junto do contador: "O histórico de cotações de 2016–2025 só é carregado depois que o calendário de pregão desses anos for publicado (em Calendário)." |
| Novo ativo | Depois de salvar: "{ticker} cadastrado. O histórico de cotações dele será carregado em alguns minutos." |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `cotacao_diaria` (nova) | `ativo_id`, `data`, `abertura`, `maxima`, `minima`, `fechamento`, `preco_medio`, `negocios`, `volume`, `fonte`, `gravado_em` | Chave (`ativo_id`, `data`); `ativo_id` aponta para `ativo` (sem apagar em cascata); nunca em fim de semana; preços positivos; `minima ≤ abertura, fechamento ≤ maxima`; negócios e volume não negativos; `fonte` em lista fechada (`b3_cotahist`, `brapi`) |
| `carga_historico` (nova) | `ativo_id`, `ano`, `carregada_em`, `registros` | Chave (`ativo_id`, `ano`); `ativo_id` aponta para `ativo`; `registros` não negativo (zero quando o ticker não apareceu no ano) |
| `execucao_tarefa` (nova) | `id`, `tarefa`, `iniciada_em`, `terminada_em`, `situacao`, `registros`, `ativos_afetados`, `periodo_inicio`, `periodo_fim` | `tarefa` e `situacao` em listas fechadas; sem `terminada_em` (em andamento) não tem situação, e terminada sempre tem |
| `erro_execucao` (nova) | `id`, `execucao_id`, `ativo_id`, `data`, `mensagem` | `execucao_id` aponta para `execucao_tarefa`; `ativo_id` e `data` opcionais; mensagem até 500 caracteres |

COTACAO passa a existir com fonte (arquitetura §9); EXECUCAO_TAREFA e ERRO_EXECUCAO também. A migração tem `down.sql` (RNF17). Nenhuma tabela nova guarda dado pessoal (DA13).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O leitor do arquivo extrai data, ticker, preços divididos pelo `FATCOT`, negócios e volume de linhas da B3 (ação, unit e FII); ignora cabeçalho, rodapé, fracionário e outros mercados; linha malformada vira erro sem derrubar o arquivo |
| CA02 | Ativo recém-cadastrado ganha o histórico desde o primeiro pregão de 2016 (ou desde o primeiro pregão dele) em até 15 minutos com o processador rodando, nos anos com calendário publicado |
| CA03 | A atualização diária acrescenta os pregões que faltam para todos os ativos, inclusive os desativados, e só para anos com calendário publicado |
| CA04 | Rodar duas vezes a mesma carga não duplica nem muda nada (idempotência) |
| CA05 | Cotação da B3 substitui a de outra fonte no mesmo dia; outra fonte nunca substitui a B3 |
| CA06 | Linha de dia sem pregão é recusada e registrada como erro (RB11) |
| CA07 | B3 fora do ar: 3 novas tentativas com espera, depois `falha` registrada; o processador e o servidor continuam funcionando (RNF13). Arquivo ainda não publicado termina como `aguardando_publicacao`, sem erro |
| CA08 | Toda execução grava tarefa, início, fim, situação, registros, ativos afetados e período; cada erro aponta para a execução |
| CA09 | Arquivo anual de ano fechado é baixado uma vez só e reaproveitado na carga do próximo ativo |
| CA10 | Tela do colaborador mostra a situação do histórico de cada ativo (carregando, período, não encontrado) e os anos que esperam o calendário, em português e inglês, usável pelo teclado e a 480px (RNF04, RNF18, RNF20) |
| CA11 | As tabelas existem com as restrições do §6 e a migração pode ser desfeita e refeita (RNF17) |
| CA12 | Testes automatizados do leitor, da precedência e da conta de pregões que faltam, sem acessar a internet (arquivos de exemplo montados nos testes) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-05 | ✅ **Resolvida** (Nicoly, 29/10/2026): DA18 aceita; histórico desde 2016 |
| OPEN-06 | ⏳ Continua em aberto: fonte de proventos e eventos corporativos, numa Spec própria. Até lá os preços não são ajustados (aviso na SPEC-010) |
| OPEN-40 | Retenção: cotações diárias ficam para sempre; registros de execução por 90 dias (sugestão, confirmar na SPEC-011) |
| OPEN-48 | ⏳ Confirmar na primeira carga real que os FIIs do catálogo aparecem no COTAHIST do mercado à vista |
| SPEC-006 | ✅ Resolvida: ativo desativado continua sendo coletado |
| — | ⏳ Primeira carga contra a B3 de verdade (download real dos arquivos): ainda não feita, ver §9 |
| — | Histórico com o código antigo de um ativo que trocou de ticker (antes de ser cadastrado): fora desta Spec |

## 9. Verificação (29/10/2026)

| Critério | Resultado |
|---|---|
| CA01 | ✅ Leitor puro (`cotahist.test.ts`): posições do leiaute oficial, ação, unit e FII (`CODBDI 12`), fator de cotação (1.000 e 3, arredondamento meio para cima a 6 casas), cabeçalho, rodapé, fracionário e opções ignorados, CRLF, linha curta, campo não numérico, data impossível, fator zero, preço fora da faixa ou zerado |
| CA02, CA03 | ✅ Serviço (`history-ingestion.test.ts`, sem rede): anos publicados lidos só para os tickers do catálogo; ano fechado pedido como "pode guardar" e o atual não; anos sem calendário e antes de 2016 não são pedidos; ativo novo carrega só o que falta para ele; a atualização diária começa no dia seguinte ao último pregão mais antigo, pula fim de semana, para no arquivo não publicado e não inclui ativo que ainda não passou pela carga retroativa. Desativado coletado (`prisma-quote.db.test.ts`) |
| CA04, CA05 | ✅ Em memória e no PostgreSQL: carga repetida igual; brapi → B3 substitui, B3 → brapi não muda nada (0 linhas gravadas) |
| CA06 | ✅ 31/12/2025 (sem pregão na sugestão do calendário) recusado e registrado com o ativo e a data; cotação de outro dia no arquivo diário recusada; ano sem calendário interrompe a atualização com erro |
| CA07 | ✅ Esperas de 1, 5 e 15 minutos, 4 pedidos por arquivo, `falha` quando nenhum ano lê e `parcial` quando um lê; ano que falhou não fica marcado e é carregado na verificação seguinte. Adaptador (`b3-cotahist-source.test.ts`): 404 vira "não publicado", 503 e página HTML com status 200 viram erro, sem deixar arquivo pela metade. Processador: tarefa que falha só gera log de erro |
| CA08 | ✅ PostgreSQL: execução em andamento sem situação; ao terminar, situação, totais, período e erros com ativo e data; no máximo 100 erros por execução mais o resumo; verificação sem trabalho não grava nada |
| CA09 | ✅ Anual de ano fechado baixado uma vez e lido de novo do disco; ano atual e diários apagados depois de lidos, inclusive quando a leitura é interrompida no meio |
| CA10 | ✅ Rota (`asset-routes.test.ts`): `history` por ativo e `historyYearsWithoutCalendar`. Situação pura (`history-status.test.ts`). Tela: linha do histórico embaixo do nome, aviso dos anos em âmbar com os anos juntados (`formatYears`, testado), textos em português e inglês. ⏳ Conferir no Electron |
| CA11 | ✅ PostgreSQL: fim de semana, preços fora da faixa, preço zero, negócios negativos, cotação sem ativo e ativo com cotações apagado recusados; execução com situação incoerente recusada. Migração `20261029120000_historico_cotacoes` conferida contra o esquema do Prisma (nenhuma diferença), desfeita (tabelas e tipos removidos) e refeita |
| CA12 | ✅ Nenhum teste acessa a internet: os arquivos e ZIPs da B3 são montados nos testes (`cotahist-fixtures.ts`) |
| Processador | ✅ Tarefa a cada 15 minutos não começa de novo antes de terminar; tarefa das 08:00 de Brasília roda ao iniciar e depois no horário (`worker.test.ts`) |

Total: **491 testes** passando (com o banco real), lint, tipos, formatação e build. Os testes contra o PostgreSQL agora rodam no projeto `api-db`, um arquivo por vez (eles limpam tabelas que os outros usam).

**Antes de usar de verdade:** a equipe precisa publicar o calendário de pregão de 2016 a 2025 (Área do colaborador → Calendário → Carregar sugestão, conferir e Publicar); sem isso, só o ano atual é carregado. A primeira carga baixa uns 10 arquivos anuais da B3 (uns 600 MB a 900 MB no total), que ficam guardados em `api/.cache/b3`.

**Para as próximas Specs:** a SPEC-009 grava com `QuoteRepository.save(quotes, 'brapi')` (a precedência já está no banco) e acrescenta a tarefa em `tarefa_ingestao`; as SPECs 007 e 027 reaproveitam `TaskRunRepository`, o `RunLog` e as novas tentativas de `HistoryIngestion`; a SPEC-010 lê `cotacao_diaria` e mostra o aviso de preços não ajustados; a SPEC-011 lê `execucao_tarefa` e `erro_execucao`.
