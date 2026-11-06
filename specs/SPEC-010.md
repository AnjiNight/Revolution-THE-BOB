# SPEC-010 — Ficha do ativo com histórico de cotações

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pelo Luís em 03/11/2026, com as respostas do §4.1 (saltos: B; período: 1 ano), e implementada (ver §9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | *Must* (RF08) |
| Depende de | [SPEC-006](SPEC-006.md) (catálogo e busca), [SPEC-008](SPEC-008.md) (histórico da B3), [SPEC-009](SPEC-009.md) (cotação do pregão), [SPEC-040](SPEC-040.md) (logos e catálogo completo) |
| Muda | SPEC-006 (a lista **Ativos** passa a abrir a ficha) |
| Requisitos | RF08; RNF04, RNF12, RNF13, RNF18, RNF20 |
| Casos de uso | Buscar ativo → Consultar cotação; P01 passos 1–2 |
| Drivers | OBJ02, QA02, QA13 |
| ADRs | [DA08](../adr/DA08-cache-dois-niveis-offline-leitura.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA16](../adr/DA16-cotacoes-por-plano.md), [DA18](../adr/DA18-historico-cotacoes-arquivos-b3.md) |

---

## 1. Objetivo

O usuário abre, pela lista **Ativos**, a **ficha** de uma ação ou de um FII. A ficha mostra:

- os **dados do ativo**: logo, ticker, nome, classe e setor ou segmento;
- a **última cotação**, sempre com o horário ou a data de referência (DA16);
- o **último pregão da B3**: abertura, máxima, mínima, fechamento, negócios e volume;
- o **gráfico dos fechamentos** desde 2016, com escolha de período e um resumo do período;
- o **aviso** de que os preços estão como a B3 publica, sem ajuste (SPEC-008).

## 2. Valor

- **Usuário (P01, passos 1–2):** estuda o ativo antes de simular, com preço e histórico reais num lugar só (OBJ02).
- **Sistema:** a ficha é a base das notícias na ficha e do gráfico Notícias × Preço (SPEC-029).
- **Equipe:** confere o histórico de um ativo sem consultar o banco.

## 3. Escopo

### 3.1 Inclui

1. **Tela da ficha**, aberta pela lista Ativos do usuário e pela lista do colaborador.
2. **Última cotação**: a do pregão (brapi) ou o fechamento da B3, a que for mais recente (§4.2).
3. **Último pregão da B3**, com uma explicação curta de cada termo (QA13).
4. **Gráfico de linha dos fechamentos**, com os períodos 1 mês, 6 meses, 1 ano, 5 anos e Tudo.
5. **Resumo do período**: variação, mínima e máxima.
6. **Aviso de preços sem ajuste** e o tratamento dos saltos de preço (§4.1, decisão 1).
7. **Duas rotas novas**, só de leitura.

### 3.2 Não inclui

- **Ajuste por proventos e eventos** (dividendos, rendimentos de FIIs, desdobramentos, grupamentos): OPEN-06, numa Spec própria. O §4.3 mostra por que ela precisa vir antes das SPECs 016 e 019.
- **Notícias** na ficha e marcadores de notícia no gráfico: SPEC-029.
- **Gráfico de velas**, volume no gráfico, indicadores técnicos e comparação com índice (SPEC-020).
- **Ponto de hoje no gráfico**: o gráfico vai até o último fechamento da B3; o preço do pregão fica no topo (§4.2).
- **Consulta sem conexão** (cache local da DA08): SPEC-032.
- **Comprar e vender pela ficha**: o botão chega com a SPEC-014.
- **Dados da empresa** (valor de mercado, P/L, dividend yield): ainda não há fonte.

## 4. Decisões

### 4.1 Respondidas pelo Luís em 03/11/2026

**Respostas: decisão 1 = B; decisão 2 = 1 ano** (as recomendações).

| # | Tema | Opções | Recomendação |
|---|---|---|---|
| 1 | **Saltos de preço** (desdobramento e grupamento). Sem ajuste, um desdobramento aparece no gráfico como uma queda: o BBAS3 "cai" 50,6% em 16/04/2024 (desdobramento de 1 para 2) | **A.** Só o aviso fixo. **B.** Aviso fixo + o gráfico **marca** cada salto grande e explica, e a **variação do período não é calculada** quando há salto no período. **C.** Não fazer a ficha antes da Spec de proventos e eventos (OPEN-06) | **B**: a ficha sai agora, e quem olha o gráfico não confunde um desdobramento com um tombo. A Spec de proventos ajusta de verdade depois |
| 2 | **Período que abre** | 1 mês, 6 meses, **1 ano** ou Tudo | **1 ano**: mostra a tendência sem o gráfico ficar espremido. Num período de 1 ano, só 58 dos 711 ativos têm salto (§4.3) |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Onde abre** | Nas duas listas Ativos (usuário e colaborador), o ticker vira um botão que abre a ficha (*na implementação*, ver §9: no lugar de um botão **Ficha** ao lado de Editar). **Voltar** retorna à lista com a mesma busca e os mesmos filtros | Caminho natural do P01 (buscar, depois consultar); voltar sem perder a busca |
| Quem vê | Qualquer pessoa conectada (usuário ou colaborador). Cotação é dado público de mercado, sem dado pessoal: nada vai para a auditoria | Leitura pura; a diferença por plano chega com a SPEC-026 |
| Ativo desativado | A ficha abre, com "Desativado no catálogo desde 12/07/2026". Ele continua fora da busca do usuário (SPEC-006), mas quem tiver o ativo vai chegar à ficha pela carteira (SPEC-014) | Mesmo princípio da SPEC-006: quem tem o ativo vê o ativo |
| **Última cotação (topo)** | Vale a mais recente entre a **cotação do pregão** (SPEC-009 e 040) e o **fechamento da B3** (SPEC-008). Cotação do pregão de um dia depois do último fechamento: "R$ 53,10 +0,74% · Cotação das 14:30 (atraso de até 45 min)". Caso contrário: "R$ 52,71 +0,98% · Fechamento de 30/10/2026 (B3)". A variação é sobre o fechamento anterior guardado (regra da SPEC-009). Nunca "tempo real" | No fim de semana o fechamento oficial da B3 vale mais que a última coleta de sexta; durante o pregão, a coleta é mais nova |
| Último pregão da B3 | Abertura, máxima, mínima, fechamento, número de negócios e volume financeiro ("R$ 3,3 bi"), com a data. Cada termo tem um botão de ajuda com uma frase simples (ex.: "Volume: quanto dinheiro trocou de mãos neste ativo no dia") | QA13: linguagem acessível para quem está começando |
| **Gráfico** | Linha do **fechamento** de cada pregão, só com o que veio dos arquivos da B3. Desenhado pelo **próprio app em SVG**, sem biblioteca nova | Um gráfico de linha simples não justifica uma dependência; assim o app controla o teclado, o contraste e o tamanho, e a regra de segurança das telas não muda |
| Períodos | 1M, 6M, 1A, 5A e Tudo. O período **termina no último fechamento guardado** e começa no mesmo dia, N meses antes (ou no primeiro pregão depois dele). Tudo começa no primeiro fechamento guardado: 04/01/2016, ou o primeiro pregão do ativo. Se o ativo tem menos histórico que o período, aparece o que há, com "Histórico desde 15/03/2024" | Período ancorado no dado, não no relógio: no domingo, "1 mês" continua com uns 21 pregões |
| Pontos | Um ponto por pregão, sem amostragem: em Tudo, uns 2.700 pontos (o PETR4 tem 2.691), uns 100 KB | Exato e simples; o tamanho é pequeno |
| **Resumo do período** | **Variação** do primeiro ao último fechamento do período, com 2 casas; **mínima** e **máxima** dos fechamentos, com as datas. O servidor calcula em decimal (RNF12), por funções puras do módulo de Cálculo Financeiro (DA10). O app converte para número só para posicionar a linha na tela, nunca para mostrar valores | Valor mostrado sempre exato; regra testável sem banco |
| Cursor | Passando o mouse, aparece a data e o fechamento do pregão mais próximo. Pelo teclado, o gráfico recebe foco: ← e → andam um pregão, Page Up e Page Down andam um mês, Home e End vão ao início e ao fim. O valor fica numa caixa visível e é lido pelo leitor de tela | RNF18; o gráfico não fica só para quem usa mouse |
| **Saltos** (decisão 1: B) | Salto: fechamento **1,8 vez maior ou menor** que o do pregão anterior (alta de 80% ou queda de 44% ou mais). O gráfico mostra uma linha tracejada na data. Embaixo dele: "16/04/2024: −50,6% de um pregão para o seguinte. Desdobramentos e grupamentos mudam o preço sem mudar o valor de quem tem o ativo; também pode ter sido uma variação real". Com salto no período, a variação aparece como "não calculada: há salto de preço no período". O sistema não tenta adivinhar o tipo de salto | Os dados do §4.3 mostram desdobramentos, grupamentos e quedas reais com o mesmo formato; adivinhar erraria (ex.: AMER3) |
| **Aviso fixo** | Sempre visível, junto do gráfico: "Preços como a B3 publica, sem ajuste por dividendos, rendimentos de FIIs, desdobramentos ou grupamentos. A variação não é a rentabilidade de quem tinha o ativo." | SPEC-008 já previa este aviso; nos FIIs, o preço cai todo mês no pagamento do rendimento |
| Histórico ainda não pronto | Carregando: "O histórico deste ativo ainda está sendo carregado. Volte em alguns minutos." Não encontrado: "Este ativo não aparece nos arquivos da B3 desde 2016." O topo mostra a cotação do pregão, se houver | Ativo recém-importado (SPEC-040) fica alguns minutos sem histórico |
| Atualização | Com a ficha aberta, o app pede a cotação do topo **a cada 5 minutos**, só ao nosso servidor. O gráfico muda quando chega o fechamento da B3 | A coleta continua centralizada, a cada 30 min (PA03); pedindo a cada 5 min, a cotação nova aparece na tela em até 5 min |
| Falha | Se uma atualização falhar, a ficha continua com o que já tinha e mostra "Não foi possível atualizar agora. Tentamos de novo em 5 minutos." Se a ficha não abrir, aparece a mensagem e o botão **Tentar de novo**. Nunca erro técnico (QA02, RNF13) | 0 telas quebradas |
| Onde fica no servidor | Rotas no módulo **Catálogo de Ativos**, junto de `GET /api/assets`. As cotações chegam por portas que o módulo **Dados de Mercado** implementa, ligadas no `main.ts`, como o volume da SPEC-040. Resumo e saltos: funções puras em **Cálculo Financeiro** | Módulos não importam uns aos outros (arquitetura §6) |
| Desempenho | A ficha e cada período respondem em menos de 1 s. A consulta usa a chave (`ativo_id`, `data`) que `cotacao_diaria` já tem | O banco tem 1,06 milhão de fechamentos (§4.3) |
| Logo | O da SPEC-040, em tamanho maior (48 px); sem logo, o círculo com as letras | Reaproveita a rota e o cache |

### 4.3 Dados conferidos no banco de desenvolvimento (03/11/2026)

Os calendários de 2016 a 2026 foram publicados e a carga do histórico rodou:

- **1.059.148 fechamentos** de 711 ativos, de 04/01/2016 a 30/10/2026;
- 4 linhas recusadas por defeito no próprio arquivo da B3.

Saltos encontrados (fechamento pelo menos 1,8 vez maior ou menor que o do pregão anterior):

| O quê | Resultado |
|---|---|
| Desde 2016 | **468 saltos em 239 ativos** (um terço do catálogo) |
| No último ano | 89 saltos em 58 ativos |
| Desdobramentos reais | BBAS3 em 16/04/2024 (56,46 → 27,91), WEGE3 em 28/04/2021, HGLG11 em 18/04/2018 (1.397,50 → 139,50), MXRF11 em 17/05/2017 |
| Grupamentos reais | MGLU3 em 27/05/2024 (1,32 → 13,15) |
| Quedas reais | AMER3 em 12/01/2023 (12,00 → 2,72) |

Com um limite de 1,5 vez seriam 818 saltos; com 2 vezes, 364. Mas um desdobramento de 1 para 2 num dia de alta fica abaixo de 2 vezes, e por isso o limite proposto é 1,8.

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Resposta |
|---|---|---|
| `GET /api/assets/:id` (nova) | Qualquer pessoa conectada | 200 com a ficha:<br>• os dados da busca, mais `active` e `deactivatedAt`;<br>• `quote`: a última cotação do pregão, ou `null`;<br>• `lastSession`: o último pregão da B3, com data, abertura, máxima, mínima, fechamento, fechamento anterior, variação, negócios e volume, ou `null`;<br>• `history`: situação, primeiro e último pregão (SPEC-008).<br>404 `asset_not_found` |
| `GET /api/assets/:id/history?period=1m\|6m\|1y\|5y\|max` (nova) | Qualquer pessoa conectada | 200 com:<br>• `period`, `from`, `to`;<br>• `points`: data e fechamento de cada pregão;<br>• `summary`: `change` (ou `null` com salto no período), e `min` e `max` com a data;<br>• `jumps`: data e variação de cada salto.<br>Sem cotação, `points` vem vazio. 400 `validation_error` para outro período; 404 `asset_not_found` |

Preços e variações vão como decimal em texto (RNF12). Sem login, 401. O app chama as rotas pela ponte do Electron, como as outras.

### 5.2 Telas

| Situação | Tela |
|---|---|
| Lista Ativos (usuário e colaborador) | O ticker de cada linha vira botão: "Abrir a ficha de PETR4" |
| Topo da ficha | **Voltar**; logo, ticker, nome, classe e setor ou segmento; preço, variação e horário ou data (§4.2); "Desativado no catálogo desde…" quando for o caso |
| Último pregão | Os seis valores com a data, cada um com o botão de ajuda |
| Gráfico | Botões de período (o escolhido fica marcado); resumo do período; o gráfico; os saltos; o aviso fixo; "Fonte: arquivos da B3 · último fechamento em 30/10/2026" |
| Janela de 480 px | Gráfico com a largura da tela; os cinco botões de período numa linha; resumo e último pregão um embaixo do outro; sem rolagem horizontal |
| Histórico carregando ou não encontrado | As mensagens do §4.2 no lugar do gráfico |
| Ativo inexistente | "Ativo não encontrado" e **Voltar** |

## 6. Modelo de dados

Nenhuma tabela nova e nenhuma migração. As rotas leem `ativo`, `logo_ativo`, `cotacao_pregao`, `cotacao_diaria` e `carga_historico`. A chave (`ativo_id`, `data`) de `cotacao_diaria` já atende a consulta por período.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A ficha abre pela lista Ativos do usuário e pela do colaborador; **Voltar** retorna com a mesma busca e os mesmos filtros |
| CA02 | O topo mostra a cotação mais recente entre a do pregão e o fechamento da B3, com horário ("atraso de até 45 min") ou data ("Fechamento de… (B3)"); a variação tem sinal e não depende só da cor; nunca aparece "tempo real" |
| CA03 | O último pregão mostra abertura, máxima, mínima, fechamento, negócios e volume, com a data; cada termo tem a sua explicação, acessível pelo teclado |
| CA04 | Os períodos começam e terminam como no §4.2; Tudo começa no primeiro fechamento guardado; ativo com menos histórico mostra "Histórico desde…"; a ficha abre em 1 ano (decisão 2) |
| CA05 | Variação, mínima e máxima saem em decimal, com 2 casas na variação, e batem com casos calculados à mão (testes sem banco) |
| CA06 | Saltos de 1,8 vez ou mais são marcados no gráfico e listados, e a variação do período não é calculada quando há salto |
| CA07 | O aviso de preços sem ajuste aparece sempre junto do gráfico |
| CA08 | Histórico carregando, não encontrado ou vazio mostra a mensagem certa, sem quebrar a tela; o topo continua com a cotação do pregão, se houver |
| CA09 | Com a ficha aberta, a cotação é pedida de novo a cada 5 minutos; falha numa atualização mantém o que estava na tela e mostra o aviso, sem erro técnico (QA02, RNF13) |
| CA10 | Ativo desativado abre com o aviso; ativo inexistente devolve 404 e a tela "Ativo não encontrado" |
| CA11 | Português e inglês, com datas e valores no formato de cada idioma. Gráfico pelo teclado (setas, Page Up, Page Down, Home, End), com a data e o preço lidos pelo leitor de tela e o resumo também em texto. Contraste de 4,5:1 nos textos e de 3:1 na linha do gráfico. A 480 px, nada passa da largura (RNF04, RNF18, RNF20) |
| CA12 | Rotas: 401 sem login, 400 para período inválido, 404 para ativo inexistente; preços em texto decimal; a ficha e cada período respondem em menos de 1 s com o banco de desenvolvimento cheio |
| CA13 | Testes sem internet: cálculos sem banco; consultas no banco de teste (`simulador_test`) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| Decisões 1 e 2 | ✅ Respondidas pelo Luís em 03/11/2026: saltos marcados (B) e período de 1 ano |
| OPEN-06 | ⏳ **Proventos e eventos corporativos.** Saltos em 239 ativos (§4.3) mostram que a SPEC-016 (carteira histórica) e a SPEC-019 (rentabilidade) não podem vir sem ela: quem "comprou" BBAS3 em 2023 veria a carteira cair pela metade em 16/04/2024. Sugestão: uma Spec própria, antes da SPEC-016, com a fonte de eventos da B3 |
| Textos de ajuda | ⏳ As frases dos termos (abertura, volume etc.) são revisadas pela equipe no Pull Request |
| SPEC-029 | Os marcadores de notícia usam o mesmo recurso dos saltos no gráfico |

## 9. Verificação (03/11/2026)

| Critério | Resultado |
|---|---|
| CA01 | ✅ Conferido na tela: o ticker abre a ficha nas duas listas; **Voltar** devolve a lista com a mesma busca e o foco no ticker que abriu a ficha; ao abrir, o foco vai para o ticker no topo |
| CA02 | ✅ Regra compartilhada (`asset-detail.test.ts`): a cotação do pregão vale quando é de um dia depois do último fechamento, pelo dia em Brasília (23h30 de 30/10 ainda é 30/10); senão, o fechamento da B3. Rota: cotação com a variação sobre o fechamento guardado. Na tela: "Cotação das 18:34 (atraso de até 45 min)" ou "Fechamento de 30 de out. de 2026 (B3)", com o sinal na variação |
| CA03 | ✅ Rota com os seis valores e o fechamento anterior; o fechamento provisório que não é da B3 fica de fora (no PostgreSQL também). Na tela, cada termo com o botão de ajuda (`aria-expanded`), pelo teclado |
| CA04 | ✅ Núcleo de cálculo (`price-history.test.ts`): o mesmo dia N meses antes, o último dia do mês quando ele não existe (inclusive 29/02), Tudo sem início. Rotas: 1 ano por padrão, 1 mês, Tudo e "Histórico desde…" (5 anos com histórico de 2025) |
| CA05 | ✅ Variação, mínima e máxima em decimal, com 2 casas meio para cima (RB13) e a data mais antiga no empate; conferido à mão também no ponta a ponta (PETR4: −14,84%) |
| CA06 | ✅ Salto de 1,8 vez ou mais nos dois sentidos (o limite incluso); com salto, variação não calculada. Na tela: linha tracejada na data, a lista com o texto e a explicação. No ponta a ponta, o desdobramento do BBAS3 em 16/04/2024 (−50,57%) sai dos arquivos reais da B3 |
| CA07 | ✅ Aviso fixo no painel do histórico em todas as situações (carregando, falha, sem histórico) |
| CA08 | ✅ Rotas e tela: histórico carregando ("Volte em alguns minutos"), não encontrado e série vazia; o topo continua com a cotação do pregão |
| CA09 | ✅ Na tela, com o relógio acelerado: a ficha pede a cotação de novo no intervalo de 5 minutos; com falha, continua com o que tinha (inclusive o gráfico) e mostra "Não foi possível atualizar agora…". Falha do gráfico e da ficha com **Tentar de novo**; nenhuma mensagem técnica |
| CA10 | ✅ Ativo desativado abre com "Desativado no catálogo desde…"; ativo inexistente: 404 e "Ativo não encontrado" |
| CA11 | ✅ Conferido na tela: português e inglês, tema claro e escuro, 480 px sem rolagem para os lados. Gráfico como controle deslizante: setas, Page Up, Page Down, Home e End, com data e preço lidos pelo leitor de tela (`aria-valuetext`) e a dica das teclas. Contraste: textos de 4,52:1 a 17:1; linha do gráfico 6,2:1 (claro) e 7,5:1 (escuro); marca do salto 5,1:1 e 7,8:1 |
| CA12 | ✅ Rotas (`asset-detail-routes.test.ts`): 401, 400 (`period`), 404 (inclusive id que não é UUID), decimais em texto. No banco de desenvolvimento cheio (1,06 milhão de fechamentos): ficha em 6 ms, gráfico de 1 ano em 7 ms e de Tudo em 18 ms |
| CA13 | ✅ Nenhum teste acessa a internet; os cálculos rodam sem banco; as consultas novas no `simulador_test` (`prisma-quote.db.test.ts`, `prisma-intraday.db.test.ts`) |
| Ponta a ponta | ✅ Peças reais: os arquivos anuais verdadeiros da B3 de 2023 a 2025 (guardados, sem baixar nada), `HistoryIngestion`, repositórios do Prisma no PostgreSQL de teste e o servidor respondendo por HTTP, com cadastro e confirmação pela API: 11 verificações |

Total: **671 testes** passando (com o banco real), lint, tipos e formatação.

**Ajustes da implementação:**

- **Lista do colaborador:** o ticker abre a ficha, como na lista do usuário, em vez de um botão **Ficha** ao lado de Editar. Com três botões, a coluna do ativo ficava espremida e "Desativar" era cortado em janelas médias.
- **Decimais:** as contas em decimal (`decimal.ts`) passaram do módulo Dados de Mercado para o núcleo de cálculo (`financial-calculation`), que o catálogo e os dados de mercado usam (DA10).
- **Busca sem texto:** o volume do último pregão (ordem da SPEC-040) passou a ser lido ativo por ativo, pela chave (ativo, data). Com o histórico inteiro carregado, a consulta antiga levava meio segundo a cada busca; agora a busca inteira leva uns 30 ms.
- **Consultas de um ativo só:** a ficha lê a situação do histórico, a última cotação do pregão e os pregões só do ativo aberto, em vez dos de todo o catálogo.
- **Gráfico:** cada período é pedido uma vez; quando chega um fechamento novo da B3 (na atualização de 5 minutos), os períodos são pedidos de novo.
- **Linha inteira abre a ficha** (pedido do Luís em 03/11/2026), na lista do usuário: o botão do ticker ganha uma camada que cobre a linha, com destaque ao passar o mouse e o contorno do foco na linha inteira. No teclado e no leitor de tela continua um botão só ("Abrir a ficha de PETR4"). Na lista do colaborador, só o ticker abre a ficha, porque a linha tem os botões Editar e Desativar.
- **"Mostrar mais"** (pedido do Luís em 03/11/2026): a lista deixa de parar nos 50 primeiros; a mudança é da busca da SPEC-006 e está descrita na nota no fim dela.
- **Lista Ativos mais compacta** (pedido do Luís em 03/11/2026): na janela padrão do app (1100 × 720), a lista começava abaixo da primeira tela. O título ficou menor, a busca e os filtros ficaram numa linha só, e o exemplo da busca foi para dentro do campo ("Ex.: PETR4, Itaú ou logística"), com o contraste do texto secundário. Agora a primeira linha da lista aparece a uns 400 px do alto na tela do usuário e a uns 520 px na do colaborador; nas janelas estreitas, os filtros continuam uns embaixo dos outros.

**Para as próximas Specs:** a SPEC-014 põe o botão de compra na ficha (`AssetDetailPage`); a SPEC-029 acrescenta os marcadores de notícia ao `PriceChart`, como os saltos; a Spec de proventos e eventos (OPEN-06) troca o aviso fixo e os saltos pelos preços ajustados.
