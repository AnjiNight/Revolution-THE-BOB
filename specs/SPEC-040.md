# SPEC-040 — Catálogo completo da B3, com logos

| Campo | Conteúdo |
|---|---|
| Status | Escrita em 02/11/2026. Aguarda o **teste da rota de lista da brapi com a bolsa aberta** (§4.3, 03/11/2026) e a aprovação do Luís |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)), logo depois da SPEC-009 |
| Prioridade | *Should* (RF39); a busca (RF07, *Must*) fica com todos os ativos da bolsa |
| Depende de | [SPEC-006](SPEC-006.md) (catálogo e auditoria), [SPEC-008](SPEC-008.md) (arquivos da B3), [SPEC-009](SPEC-009.md) (coleta da brapi) |
| Muda | SPEC-006 (quem decide o que entra no catálogo; aviso acima de 50), SPEC-009 (forma da coleta do pregão), [DA16](../adr/DA16-cotacoes-por-plano.md) (o catálogo deixa de precisar ser curado) |
| Requisitos | RF07, RF09, RF39; RB22; RNF04, RNF12, RNF13, RNF15, RNF17, RNF18, RNF20 |
| Casos de uso | Buscar ativo; Consultar cotação; P03 "cadastrar ou atualizar ativos" |
| Drivers | OBJ02, FAS03, FAS10, QA02, QA04, PA03, RES03, RES07 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA16](../adr/DA16-cotacoes-por-plano.md), [DA18](../adr/DA18-historico-cotacoes-arquivos-b3.md), [DA22](../adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md), [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) |

---

## 1. Objetivo

O catálogo deixa de ser montado à mão e passa a ter **todas as ações (com as units) e todos os FIIs negociados na B3 nos últimos 3 meses**, com o **logo** de cada um:

- o **processador** importa os ativos sozinho, todo dia: entra quem começou a ser negociado e sai (desativado) quem parou;
- o **colaborador** continua dono do catálogo: edita nome e setor ou segmento, confere a classificação sugerida, desativa e reativa, e ainda pode cadastrar à mão;
- a coleta de preços passa a caber na cota gratuita da brapi mesmo com uns mil ativos.

## 2. Valor

- **Usuário:** encontra qualquer ação ou FII da bolsa, reconhece cada um pelo logo e vê o preço do dia.
- **Equipe:** não precisa cadastrar mais de mil ativos à mão; só confere a classificação.
- **Sistema:** o histórico (SPEC-008) e as cotações (SPEC-009) passam a cobrir a bolsa inteira.

## 3. Escopo

### 3.1 Inclui

1. **Importação diária** do catálogo: ações, units e FIIs da lista da brapi que tiveram negócio na B3 nos últimos 3 meses.
2. **Classificação sugerida** (setor das ações, segmento dos FIIs), marcada como **a revisar** até o colaborador conferir.
3. **Desativação e reativação automáticas** pelo processador, com registro na auditoria.
4. **Logos**: o servidor baixa, guarda e entrega ao app. Ativo sem logo ganha um círculo com as letras do ticker.
5. **Nova forma de coletar o preço do pregão**, que caiba na cota com o catálogo inteiro (§4.2, conforme o teste do §4.3).
6. **Telas**: logo na lista Ativos; na tela do colaborador, o resultado da importação, o filtro "a revisar" e a conferência da classificação.

### 3.2 Não inclui

- **ETFs, BDRs, FI-Infra, FI-Agro, FIDCs e FIPs** (DA22, DA23): a importação os ignora.
- **Juntar um ativo que trocou de código** (ex.: BRDT3 → VBBR3): a importação cria o código novo, e o antigo é desativado depois de 3 meses sem negócio. Juntar os dois fica para depois.
- **Dados da empresa** que a brapi também traz (valor de mercado, setor em inglês etc.): só nome, classe, classificação, logo e preço entram.
- **Ficha do ativo** com logo e gráfico: SPEC-010.
- **Botão "importar agora"** para o colaborador: a reexecução de tarefas é da SPEC-011.

## 4. Decisões

### 4.1 Respondidas pelo Luís em 02/11/2026

| # | Tema | Decisão | Motivo |
|---|---|---|---|
| 1 | **O que entra** | **Todas as ações e todos os FIIs** da B3, e o colaborador continua podendo editar | O usuário encontra qualquer ativo da bolsa; a equipe corrige o que a fonte errar |
| 2 | **Logo** | Cada ação e cada FII com a sua imagem | Mais fácil reconhecer o ativo na lista |
| 3 | **Ativos quase parados** | Entra só quem teve **negócio na B3 nos últimos 3 meses** | Ticker sem negócio não teria preço nem histórico novo |
| 4 | **Ativo que sai da bolsa** | **Desativado automaticamente**, com registro na auditoria; o colaborador pode reativar | O catálogo não acumula ativos mortos; a equipe continua no controle |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Fontes** | **Lista da brapi** (`/api/quote/list`: até 2.000 ativos por consulta, com ticker, nome, tipo, subsetor e logo), para saber o que existe e como se chama. **Arquivos da B3** (os que a SPEC-008 já lê), para saber **quem negociou e quando**, e para conferir a classe | A brapi traz nome e logo, e a B3 é a fonte oficial dos negócios. Em 02/11/2026, a lista da brapi tinha 783 ações (com units) e 332 FIIs |
| Quem negociou | Ao ler cada arquivo da B3 (anual ou diário), o processador guarda, para **todos** os tickers de ação, unit e FII do arquivo, o último pregão com negócio (tabela nova, §6). Na primeira importação, lê o arquivo anual do ano atual (e o do ano anterior, de janeiro a março) | A SPEC-008 já baixa esses arquivos; só passa a guardar a data de todos os tickers, não só os do catálogo |
| Classe | **Ação** para ação e unit, **FII** para FII, e as duas fontes têm de concordar. Se discordarem, o ativo não entra, e o motivo fica no registro da execução. A classe continua sem mudar depois (RB22) | A classe nunca é deduzida do ticker (DA23); duas fontes oficiais evitam um ETF entrar como ação |
| **Classificação sugerida** | Tabela fixa no código que liga o **subsetor da brapi** (são os nomes de segmento da B3, como "Bancos" ou "Exploração. Refino e Distribuição") ao setor da B3 das ações ou ao segmento dos FIIs. O que não estiver na tabela, ou for ambíguo, entra como **Outros**. Todo ativo importado nasce **a revisar** | A brapi erra: o MXRF11, que é FII de papel (recebíveis), veio como "Logística". O colaborador confere; a tabela é revisada no Pull Request |
| Nome | O nome que a brapi informa (razão social), só sem espaços repetidos e cortado em 100 caracteres. O colaborador pode trocar por um mais curto | Não há regra boa para "embelezar" razão social; trocar é rápido |
| **Nunca desfazer o colaborador** | A importação **só cria** ativos novos, desativa e reativa. **Nunca muda** ticker, nome, classe ou classificação de um ativo que já existe | Assim, o que o colaborador edita nunca é sobrescrito |
| **Desativação automática** | Ativo ativo sem negócio na B3 nos últimos 3 meses é desativado, se já foi negociado alguma vez ou existe há mais de 3 meses. Só acontece com os arquivos da B3 **em dia** (último pregão lido = pregão anterior). A auditoria grava a ação **sem id de colaborador** (feita pelo processador) | O ativo que um colaborador acabou de cadastrar para um IPO não some. Se a B3 estiver atrasada, ninguém é desativado por engano |
| Reativação automática | Só para ativo **desativado pelo processador** que voltou a ter negócio. O que um colaborador desativou nunca volta sozinho | Respeita a escolha da equipe (decisão 4) |
| Quem tem o ativo | Continua valendo a regra da SPEC-006: desativado some da busca, mas quem tem vê e vende | Ninguém fica preso a um ativo |
| Quando roda | Todo dia às **08:30** de Brasília, depois da atualização da B3 das 08:00 (SPEC-008), e ao ligar o processador se ainda não rodou no dia. Gasta 2 consultas da brapi (lista de ações e lista de FIIs) | Um ativo novo aparece no dia seguinte ao primeiro negócio |
| **Logos** | O servidor baixa a imagem do endereço que a brapi informa, **só do servidor de ícones da brapi, por HTTPS**, e aceita apenas SVG ou PNG de até 100 KB. Guarda no banco e baixa de novo depois de 30 dias. A mesma imagem repetida em muitos tickers é tratada como logo genérico, e o ativo fica sem logo | Tudo vem do nosso servidor: o app continua bloqueando imagens da internet, funciona sem conexão e não expõe o usuário a outro site |
| Logo no app | Sempre como imagem (`<img>`), nunca inserido como código; decorativa (o ticker está do lado). Sem logo: círculo com as 2 primeiras letras do ticker, numa cor para ação e outra para FII | Um SVG dentro de `<img>` não roda script; o círculo mantém a lista alinhada |
| **Coleta do pregão — plano A** (se o teste do §4.3 confirmar) | A cada coleta da SPEC-009, **uma consulta à lista da brapi por classe** (ações e FIIs) traz o preço e a variação de todos. São uns 700 a 800 consultas por mês com a importação, contra 15 mil de cota. Horários, dias de pregão, limpeza de 30 dias, registro e avisos continuam os da SPEC-009 | Uma consulta por ativo não cabe: com uns mil ativos, a cota não daria nem uma atualização por dia para todos |
| Plano A: horário | A lista não traz o horário de cada preço: vale o **horário da coleta**, com o atraso informado pela brapi (cabeçalho de atualização do plano, conferido no teste), e continua o texto "Cotação das 14:30 (atraso de até 30 min)" | DA16: toda cotação mostra o horário, nunca "tempo real" |
| Plano A: cotação antiga | Preço **e** variação iguais aos do pregão anterior guardado da B3 são de ontem (abertura tardia, como a Quarta-feira de Cinzas): ignorados, sem erro | Sem horário por ativo, é a forma de não mostrar o preço de ontem como de hoje |
| Plano A: fechamento provisório | A lista não traz abertura, máxima e mínima: **deixa de existir** o fechamento provisório da SPEC-009. O dia entra nos gráficos com o arquivo da B3 da manhã seguinte | A tabela diária exige abertura, máxima e mínima; inventá-las seria dado falso |
| **Coleta do pregão — plano B** (se a lista só mudar no fechamento) | A lista roda uma vez por dia, depois do fechamento: preço do dia para todos. De 30 em 30 minutos, a coleta por ativo da SPEC-009 fica só para os **mais negociados** (maior volume financeiro no último pregão da B3), quantos couberem na cota: uns 35 | Durante o pregão, os mais procurados têm preço; os outros mostram o fechamento do dia |
| Variação do dia | A mesma regra da SPEC-009: comparada ao fechamento anterior guardado da B3. Sem esse fechamento (histórico ainda carregando), a variação não aparece | Uma referência só para todos os ativos |
| Busca sem texto | Ordenada pelos **mais negociados** (volume financeiro do último pregão da B3); com texto, a ordem da SPEC-006. Continuam até 50 resultados | Com mil ativos, a lista em ordem alfabética começaria por tickers que quase ninguém procura |
| Lista do colaborador | Até **100 por vez**, com "refine a busca" quando houver mais; o aviso "acima de 50 ativos" (DA16) sai e fica a situação da coleta | Mil linhas de uma vez deixariam a tela lenta; o limite de 50 não vale mais com a lista |
| Histórico (SPEC-008) | Os ativos importados entram na carga retroativa normal: uns 3 milhões de linhas em `cotacao_diaria` (algumas centenas de MB). Os arquivos baixados da B3 são os mesmos, porque cada um já traz a bolsa inteira | O tamanho do download não muda; a primeira carga demora mais, no processador, sem travar o app |
| DA16 | Quando a Spec for aprovada, a DA16 ganha uma nota: o catálogo não precisa mais ser curado, e a capacidade do plano gratuito passa a depender da rota de lista | A decisão de arquitetura fica registrada onde foi tomada |

### 4.3 Teste da rota de lista (03/11/2026, com a bolsa aberta)

São umas 5 consultas no total, com e sem token. Uma consulta sem token não gasta a cota.

| # | O que conferir | Decide |
|---|---|---|
| T1 | Duas consultas à lista com 30 minutos de intervalo: o preço muda durante o pregão? É igual ao `regularMarketPrice` da cotação simples do mesmo ativo no mesmo momento? | Plano A ou plano B |
| T2 | Com token: quanto cada consulta à lista gasta da cota (cabeçalhos `x-ratelimit-*`) e qual o atraso informado (cabeçalho de atualização do plano) | Conta da cota e texto do atraso |
| T3 | Sem token: a lista responde igual? | Se quem não tem token também vê os preços |
| T4 | Logo de um ativo pequeno e de vários FIIs: imagem própria ou genérica? Baixar um logo gasta cota? | Regra do logo genérico |

O resultado entra nesta seção antes da aprovação.

## 5. Comportamento esperado

### 5.1 Tarefas do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `importacao_catalogo` (nova) | Todo dia às 08:30 de Brasília e ao ligar, se ainda não rodou no dia | Lê a lista da brapi; cruza com os negócios da B3; cria os novos, desativa e reativa; baixa os logos que faltam ou que têm mais de 30 dias |
| Leitura da B3 (SPEC-008, muda) | A cada arquivo lido | Também guarda o último pregão com negócio de todos os tickers de ação, unit e FII |
| `cotacao_pregao` (SPEC-009, muda) | Os mesmos horários | Plano A ou B do §4.2 |

| Situação da importação | Quando |
|---|---|
| `sucesso` | Lista e arquivos da B3 lidos; tudo aplicado |
| `parcial` | Algum ativo ou logo falhou, mas o resto foi aplicado; ou a B3 está atrasada (nada é desativado) |
| `falha` | A lista da brapi não respondeu: nada muda no catálogo |

Na execução ficam os totais: ativos criados, desativados e reativados, logos baixados e ignorados (com o motivo).

### 5.2 Rotas

| Rota | Quem | Mudança |
|---|---|---|
| `GET /api/assets` | Qualquer pessoa conectada | Cada ativo ganha `hasLogo`; sem texto, a ordem é a dos mais negociados |
| `GET /api/assets/:id/logo` (nova) | Qualquer pessoa conectada | 200 com a imagem (SVG ou PNG) e cache de 1 dia; 404 `logo_not_found` |
| `GET /api/collaborator/assets` | Colaborador | Até 100 ativos com `hasMore`; novo filtro `review=pending`; cada ativo ganha `origin` (`team` ou `import`), `classificationPending` e `autoDeactivated`; a resposta ganha `pendingReviewCount` e `catalogImport` (última importação: quando, situação e totais) |
| `PATCH /api/collaborator/assets/:id` | Colaborador | Mudar o setor ou segmento também marca a classificação como conferida |
| `POST /api/collaborator/assets/:id/confirm-classification` (nova) | Colaborador | 200; marca como conferida sem mudar nada; registro de auditoria. Já conferida: 200 sem novo registro |

O app pede o logo pela ponte do Electron, como as outras chamadas, e mostra a imagem em memória. A regra de segurança das telas continua a mesma.

### 5.3 Telas

| Situação | Tela |
|---|---|
| Lista Ativos (usuário e colaborador) | Logo (ou círculo com as letras) à esquerda do ticker, também a 480px |
| Rodapé da lista do usuário | "O catálogo tem as ações e os FIIs negociados na B3 nos últimos 3 meses. Cotações da brapi, com atraso de até 30 minutos. Não são em tempo real." |
| Tela do colaborador | Linha da importação: "Importação de hoje às 08:30: 3 novos, 1 desativado" (ou o aviso de falha ou de B3 atrasada); contador "N com classificação a revisar", com o filtro **A revisar**; ao lado do nome do ativo importado e ainda não conferido, o selo "Classificação a revisar" |
| Editar ativo | Para ativo importado: "Importado da B3 em 03/11/2026" e o botão **Confirmar classificação** |
| Ativo desativado pelo processador | "Desativado automaticamente: sem negócio na B3 desde 12/07/2026" |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `ativo` (muda) | Novas: `origem` (`equipe` ou `importacao`), `classificacao_conferida_em`, `desativado_automaticamente` | `origem` em lista fechada, padrão `equipe`; cadastrado pela equipe já nasce conferido; `desativado_automaticamente` só pode ser verdadeiro em ativo desativado |
| `negociacao_b3` (nova) | `ticker`, `classe`, `ultimo_pregao`, `atualizado_em` | Chave `ticker`; `ultimo_pregao` nunca em fim de semana; sem chave estrangeira (nem todo ticker está no catálogo). Dado público, sem dado pessoal |
| `logo_ativo` (nova) | `ativo_id`, `situacao` (`ok` ou `sem_logo`), `tipo`, `conteudo`, `resumo`, `baixado_em` | Chave `ativo_id`, que aponta para `ativo`; com `ok`: `tipo` em lista fechada (SVG ou PNG) e `conteudo` de até 100 KB; com `sem_logo`, sem conteúdo |
| `registro_auditoria` (muda) | `colaborador_id` passa a aceitar vazio | Vazio só nas ações do processador (`asset_imported`, `asset_auto_deactivated`, `asset_auto_reactivated`); continua só aceitando inclusão |
| `tarefa_ingestao` (muda) | Novo valor `importacao_catalogo` | — |

A migração tem `down.sql` (RNF17). Na volta, os ativos importados continuam no catálogo como se tivessem sido cadastrados pela equipe. Ativo nunca é apagado.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A importação cria ações, units e FIIs da lista da brapi com negócio na B3 nos últimos 3 meses; ETFs, BDRs e outros fundos ficam de fora; ticker fora do formato e classe diferente entre as fontes não entram, e o motivo fica na execução |
| CA02 | Classificação pela tabela fixa; o que não está nela entra como Outros; todo ativo importado nasce a revisar; o cadastrado pela equipe nasce conferido |
| CA03 | A importação nunca muda ticker, nome, classe ou classificação de um ativo existente; rodar duas vezes no mesmo dia não cria nada nem grava auditoria de novo |
| CA04 | Ativo sem negócio há 3 meses é desativado pelo processador, com auditoria sem id de colaborador; com a B3 atrasada, ninguém é desativado; ativo novo de IPO, ainda sem negócio, não é desativado antes de 3 meses |
| CA05 | Só o ativo desativado pelo processador volta sozinho quando tem negócio de novo; o desativado pelo colaborador, nunca |
| CA06 | Colaborador: filtro "a revisar", contador, confirmar classificação (com auditoria, e sem novo registro se já conferida), editar o setor marca como conferido, lista de 100 por vez com `hasMore`, linha da importação |
| CA07 | Logos: só do servidor de ícones da brapi por HTTPS, só SVG ou PNG de até 100 KB; logo genérico vira "sem logo"; baixados de novo depois de 30 dias; falha num logo não para a importação; rota entrega a imagem ou 404 |
| CA08 | Coleta do pregão no plano escolhido pelo teste: no A, uma consulta por classe por coleta, cotação de ontem ignorada, sem fechamento provisório; no B, os mais negociados que couberem na cota de 30 em 30 minutos e a lista depois do fechamento. Em qualquer um, nunca passa de 90% da cota (SPEC-009) |
| CA09 | Busca sem texto pelos mais negociados; logo ou círculo com as letras em cada linha; novo rodapé; nunca "tempo real" |
| CA10 | Cada importação grava a execução com situação e totais; cada falha aponta o ativo ou o logo |
| CA11 | Português e inglês; usável pelo teclado; a 480px o logo continua ao lado do ticker; o círculo das letras com contraste de pelo menos 4,5:1 (RNF04, RNF18, RNF20) |
| CA12 | As tabelas existem com as restrições do §6, e a migração pode ser desfeita e refeita, inclusive com ativos importados (RNF17) |
| CA13 | Testes sem internet: lista da brapi, logos e arquivos da B3 montados nos testes |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| Teste do §4.3 | ⏳ 03/11/2026, com a bolsa aberta: decide o plano A ou B, o texto do atraso e a regra do logo genérico |
| Termos da brapi para logos | ⏳ Conferir se os termos falam dos ícones. Os logos são marcas das empresas: aqui só identificam o ativo dentro do app, com as mesmas regras da decisão 1 da SPEC-009 (nada repassado para fora) |
| Tabela de classificação | ⏳ A tabela dos uns 100 subsetores da brapi é revisada no Pull Request |
| Troca de código | Fica para depois: juntar o ativo antigo ao novo (ex.: BRDT3 → VBBR3) |
| OPEN-48 | Parte histórica: com esta Spec, só entra FII que aparece nos arquivos da B3 (a mesma fonte do histórico da SPEC-008), então todo FII do catálogo tem histórico |
