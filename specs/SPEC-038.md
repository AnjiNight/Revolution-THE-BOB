# SPEC-038 — Relatório da carteira em PDF

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 17/11/2026 a pedido do Luís, aprovada com as recomendações do §4.1 ("Aprovo, implemente", 17/11/2026) e implementada (§9) |
| Fase | 8 — Experiência e conformidade ([mapa de specs](mapa_specs.md)) |
| Prioridade | Could (RF22) |
| Depende de | [SPEC-019](SPEC-019.md) (rentabilidade), [SPEC-020](SPEC-020.md) (referências), [SPEC-021](SPEC-021.md) (distribuição); usa o extrato da [SPEC-013](SPEC-013.md), as posições da [SPEC-014](SPEC-014.md), os proventos da [SPEC-043](SPEC-043.md), o modo consulta da [SPEC-032](SPEC-032.md) e o idioma da [SPEC-035](SPEC-035.md) |
| Muda | O app (botão **Baixar relatório (PDF)** na tela da carteira; o documento do relatório, que só existe na impressão; o processo principal grava o PDF onde a pessoa escolher) e o mapa (OPEN-38) |
| Requisitos | RF22; RB13, RB18, RB20; RNF04, RNF12, RNF18, RNF20 |
| Casos de uso | — (o diagrama não tem caso de uso para o relatório; ver OPEN-43) |
| Drivers | — |
| ADRs | [DA10](../adr/DA10-nucleo-calculo-puro.md) (o relatório não recalcula nada), [DA13](../adr/DA13-dados-pessoais-concentrados.md) (nenhum dado pessoal no arquivo), [DA15](../adr/DA15-carater-educacional.md) (aviso de caráter educacional) |

---

## 1. Objetivo

O usuário baixa um **relatório da carteira em PDF**, para guardar ou mostrar a alguém, com o que a tela da carteira já mostra: o resultado no período, a comparação com o CDI, o Ibovespa e o IFIX, os gráficos, as posições, a distribuição, os proventos e o extrato, com os avisos de que é uma simulação educacional.

## 2. Valor

- **Usuário (P01, P02):** guarda o resultado de uma carteira num arquivo e o mostra a quem quiser (o professor, a família, um colega), sem precisar do app.
- **Projeto:** fecha o RF22 reaproveitando as visões que já existem, sem cálculo novo: o PDF tem os mesmos números da tela.

## 3. Escopo

### 3.1 Inclui

1. Botão **Baixar relatório (PDF)** na tela de cada carteira, ao vivo ou histórica.
2. O **documento do relatório**: cabeçalho, resumo com as referências, gráficos, posições, distribuição, proventos, extrato do período e avisos (§4.1, decisão 1).
3. O PDF gravado pelo próprio app, com a janela **Salvar como**, no idioma da interface.
4. O relatório no **modo consulta** (sem conexão), com os dados guardados neste computador.

### 3.2 Não inclui

- **Comparação de carteiras** (SPEC-022) em PDF, nem relatório de várias carteiras juntas.
- **Escolher as seções** do relatório ou montar um layout próprio.
- **Enviar por e-mail** ou gerar um link: o arquivo vai direto para o computador da pessoa, como o "Baixar meus dados" (SPEC-034).
- **Cenários e notícias**: ainda não existem (SPECs 029 e 031); quando existirem, cada Spec diz se entram no relatório.
- **Imposto de renda**: os custos e o IR ficam fora da simulação (RB20), e o relatório não serve para declaração.

## 4. Decisões

### 4.1 Recomendações para o Luís aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que entra** (OPEN-38) | Uma **fotografia da carteira**, na ordem da tela: **cabeçalho** (nome, tipo, início, período, quando foi gerado e de quando são os dados); **resumo** (patrimônio, aportes menos retiradas, resultado em reais e em %, e o CDI, o Ibovespa e o IFIX no mesmo período, com "o mesmo dinheiro" e o "% do CDI"); **evolução** (o gráfico em reais e o de rentabilidade em % com as três referências); **posições**; **distribuição** por classe e por setor ou segmento; **proventos** recebidos e a receber; **extrato do período**; e os **avisos** | É o que a pessoa vê na tela, em papel: nada de número novo para conferir. A Visão, as personas e os casos de uso não dizem o que o relatório tem (OPEN-38 é uma lacuna); a tela da carteira é a referência que já foi validada |
| 2 | **Período** | O **escolhido na Rentabilidade** quando o botão é clicado (o padrão é "Desde o início"; vale também "1 mês", "6 meses", "12 meses", "No ano" e "Personalizado"). O resumo, os gráficos, os proventos recebidos e o extrato são do período; as **posições e a distribuição são as de hoje**, e o cabeçalho diz isso | É o período que a pessoa já está olhando. As posições e a distribuição só existem hoje (SPECs 014 e 021); refazer as de uma data passada seria cálculo novo |
| 3 | **Como o PDF é feito** | No **próprio app**: a tela monta o relatório como uma página que só aparece na impressão, com os mesmos gráficos e formatos, e o processo principal a imprime em PDF pelo Chromium do Electron (`printToPDF`) e grava o arquivo. **Sem biblioteca nova e sem o servidor** gerar PDF | Os dados e os gráficos (SVG próprios) já estão no app, e o PDF sai igual à tela. No servidor, seria preciso um Chromium (puppeteer) ou desenhar tudo de novo (pdfkit) e pesaria a hospedagem; uma biblioteca de PDF no app (jsPDF) pediria montar o layout à mão. Assim, o relatório funciona até sem conexão |
| 4 | **Onde fica e como salva** | O botão fica no topo da tela da carteira, junto de **Copiar carteira**, com a dica do período ("Do período da Rentabilidade: Desde o início"). O PDF é gravado pela janela **Salvar como**, com o nome sugerido `relatorio-<carteira>-<data>.pdf` (em inglês, `report-…`), na pasta Downloads; depois de gravar, a tela diz onde e oferece **Abrir** | É o mesmo caminho do "Baixar meus dados" (SPECs 034 e 035): a pessoa escolhe onde o arquivo fica, e nada passa pelo servidor |
| 5 | **Formato** | **A4 retrato**, sempre no **tema claro**, no idioma da interface (textos, moeda, números e datas), com **texto selecionável**, título do documento, títulos de seção e tabelas com cabeçalho repetido em cada página, para leitores de tela (PDF marcado). Rodapé com o nome da carteira, "Página 2 de 5" e o aviso curto. **Sem o nome e o e-mail da pessoa** | A4 é o papel do Brasil e o padrão para imprimir. O tema escuro gasta tinta e muda o contraste no papel. Sem dado pessoal, o arquivo pode ser mostrado a qualquer um (DA13) |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Cabeçalho** | "Relatório da carteira", o nome, "Ao vivo" ou "Histórica", "Desde 02/01/2026", "Período: 02/01/2026 a 17/11/2026 (Desde o início)", "Gerado em 17/11/2026, 10:32" e de quando são os dados: o horário das cotações, como na tela; no modo consulta, "Dados de 16/11/2026, 21:12, guardados neste computador". Se a carteira foi copiada de outra (SPEC-023), "Criada a partir de «…»" | Quem lê o papel precisa saber de quando são os números |
| **Resumo** | Patrimônio no fim do período, aportes menos retiradas, resultado em reais e rentabilidade em %. Para cada referência, a rentabilidade no período, "No CDI, você teria R$ …" e, quando a carteira está positiva, o "% do CDI" (SPEC-020). Referência ainda sem dado até o fim do período: "até 14/11" | Os mesmos números e regras da tela |
| **Gráficos** | O de **patrimônio e investido** (em reais) e o de **rentabilidade em %** com o CDI, o Ibovespa e o IFIX, em vetor, com legenda e as cores da tela adaptadas ao papel (claro); semanais quando a tela é semanal (períodos longos, SPEC-019). Uma descrição em texto acompanha cada gráfico, para leitores de tela | No papel não há "Comparar com os índices": as referências entram no gráfico em % |
| **Posições** | Ativo (ticker e nome), quantidade, preço médio, último preço e de quando (horário do pregão ou data do fechamento), valor atual, resultado em reais e em %, e proventos recebidos; no fim, o caixa e o total. Os avisos de evento corporativo da tela entram como nota | A tabela da tela, sem os botões |
| **Distribuição** | Ações, FIIs e Caixa com a % do patrimônio; dentro de cada classe, os setores (ações) ou segmentos (FIIs) com a %, do maior para o menor, "Outros" no fim; os ativos sem preço entram pelo custo, com a nota da tela; o caixa negativo fica fora, como na tela | SPEC-021 |
| **Proventos** | Recebidos no período (líquidos) e a receber, com o próximo pagamento. Sem a autorização do Investidor10, a nota da tela ("proventos desligados") | SPEC-043 |
| **Extrato** | Todos os lançamentos que valem no período, **do mais antigo para o mais recente** (como um extrato de banco), com o saldo depois de cada um: aportes, retiradas, compras e vendas (ativo, quantidade e preço), proventos (líquido; no JCP, o IR retido) e frações. Os **estornados ficam de fora** (não contam no saldo), com a nota "3 lançamentos estornados não aparecem". O app lê todas as páginas do extrato (100 por vez) antes de gerar | Num relatório, o extrato se lê do começo para o fim. Os estornados já não contam em nenhum número (SPEC-015) |
| **Avisos** | No fim e em resumo no rodapé: o aviso de caráter educacional ("Projeto acadêmico de caráter educacional. Não constitui recomendação de investimento", RB18 e DA15); os custos de operação fora da simulação (RB20); as fontes dos dados (B3, brapi, Banco Central e Investidor10) e o atraso das cotações do pregão; os avisos da rentabilidade (salto de preço sem evento, ativo sem fechamento), quando houver | As mesmas regras da tela valem para o papel |
| **Gerando** | O botão vira "Gerando o relatório…" (desativado, anunciado aos leitores de tela) enquanto o app lê o que falta e o PDF é montado. Cancelar o "Salvar como" não grava nada e não mostra erro. Depois de gravar: "Relatório salvo em Downloads" com **Abrir** | A pessoa sabe o que está acontecendo |
| **Carteira sem lançamento** | Botão desativado, com "Ainda não há lançamentos para o relatório" | Não há o que mostrar |
| **Modo consulta** (SPEC-032) | O relatório sai com os dados guardados, e o cabeçalho diz de quando são. Se faltar alguma leitura (o período nunca foi aberto neste computador, ou o extrato passa da primeira página), o botão explica: "Precisa de conexão: o extrato completo não está guardado neste computador" | Sem conexão, o app só mostra o que já foi consultado |
| **Nome do arquivo** | `relatorio-` ou `report-`, o nome da carteira sem acentos, em minúsculas e com hífens (no máximo 60 caracteres, sem os caracteres proibidos no Windows) e a data de hoje: `relatorio-e-se-eu-tivesse-comecado-em-2019-2026-11-17.pdf` | Funciona em qualquer sistema e se acha fácil na pasta |
| **Onde fica no código** | O documento é um componente da tela da carteira (`PortfolioReport`), escondido na tela e visível só na impressão (`@media print`, tema claro, quebras de página que não cortam linhas de tabela nem gráficos); o processo principal recebe o pedido por um canal novo, imprime a própria janela com `printToPDF` (A4, rodapé com número de página, PDF marcado) e grava com "Salvar como". **Nenhuma rota nova** no servidor | Reaproveita as leituras e os componentes; o servidor não muda |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| "Aposentadoria" (ao vivo, desde 02/01/2026), período "Desde o início" | O "Salvar como" sugere `relatorio-aposentadoria-2026-11-17.pdf` em Downloads. O PDF tem umas 4 páginas: cabeçalho e resumo ("Patrimônio R$ 12.480,32 · Resultado +R$ 980,32 (+8,52%) · No CDI, você teria R$ 12.204,10"), os dois gráficos, posições, distribuição, proventos, extrato e avisos. "Relatório salvo em Downloads" e **Abrir** |
| Histórica "E se eu tivesse começado em 2019", período "12 meses" | O resumo, os gráficos, os proventos recebidos e o extrato são dos últimos 12 meses; as posições e a distribuição, de hoje ("Posições e distribuição em 17/11/2026") |
| App em inglês | "Portfolio report", "R$1,234.56", "Nov 17, 2026", e o arquivo `report-retirement-2026-11-17.pdf` para uma carteira chamada "Retirement" |
| Uma compra estornada no período | Não aparece no extrato; a nota diz "1 lançamento estornado não aparece" |
| Sem conexão, carteira aberta ontem | O relatório sai com "Dados de 16/11/2026, 21:12, guardados neste computador". Com o período "12 meses" nunca aberto neste computador, o botão explica que precisa de conexão |
| A pessoa cancela o "Salvar como" | Nada é gravado, e a tela volta ao normal |
| Carteira criada agora, sem lançamento | Botão desativado: "Ainda não há lançamentos para o relatório" |
| O VALE3 teve um salto sem evento da B3 no período | O aviso da tela também sai no relatório |
| Leitor de tela no PDF | O título "Relatório da carteira Aposentadoria", os títulos das seções e as tabelas com cabeçalho |

### 4.4 Conferido em 17/11/2026

| Pergunta | Resposta |
|---|---|
| O que a tela da carteira já lê | `get` (nome, tipo, início, cópia de), `performance` (período; patrimônio, aportes menos retiradas, resultado, rentabilidade, série diária ou semanal, as referências com "o mesmo dinheiro" e o "% do CDI", e os avisos), `positions` (posições, caixa, total, proventos recebidos e a receber, próximo pagamento e a distribuição) e `cash` (extrato do mais recente para o mais antigo, 100 por vez, com o saldo depois de cada lançamento e os estornados marcados) |
| Os números | Chegam prontos do servidor, em decimal com 2 casas (RB13, RNF12); o app só formata no idioma. O relatório não precisa calcular nada |
| Os gráficos | São SVG próprios (rentabilidade e ficha do ativo): impressos, saem em vetor |
| Imprimir a tela hoje | Não há estilo de impressão: sairia com o menu, o tema escuro e os botões |
| Gravar um arquivo | O "Baixar meus dados" (SPEC-034) já usa a janela "Salvar como" do Electron, com o nome do arquivo no idioma do app (SPEC-035) |
| Electron | Versão 44, que imprime uma janela em PDF pelo Chromium (`printToPDF`): tamanho A4, margens e rodapé com número de página |
| Modo consulta | Ficam guardadas as leituras já abertas neste computador; o extrato além da primeira página e os períodos nunca abertos, não (SPEC-032) |
| Os documentos | A Visão, as personas e os casos de uso não citam o relatório; o conteúdo é a OPEN-38 (lacuna) |

## 5. Comportamento esperado

### 5.1 Na tela da carteira

| Situação | Tela |
|---|---|
| Carteira com lançamentos | **Baixar relatório (PDF)** no topo, junto de **Copiar carteira**, com a dica do período da Rentabilidade |
| Clique | "Gerando o relatório…" (botão desativado, `role="status"`); o app lê o que falta (o extrato inteiro); abre o "Salvar como" |
| Gravado | "Relatório salvo em Downloads" (ou na pasta escolhida) com **Abrir**; o foco vai para o aviso |
| Cancelado | Nada é gravado; o botão volta |
| Erro (leitura que falhou, disco cheio) | A mensagem de erro do app, com o foco nela; nada pela metade fica gravado |
| Sem lançamentos | Botão desativado com o motivo |
| Modo consulta sem tudo guardado | Botão desativado com "Precisa de conexão" e o que falta |
| 480 px | O botão cabe no topo da tela; o relatório não depende da largura da janela (é A4) |

### 5.2 O documento

Em A4 retrato, tema claro, nesta ordem: cabeçalho, resumo, evolução, posições, distribuição, proventos, extrato e avisos. Cada página tem o rodapé com o nome da carteira, "Página X de Y" e o aviso curto. Uma linha de tabela nunca é cortada entre páginas, e o cabeçalho das tabelas se repete. Em português ou em inglês, conforme a interface.

### 5.3 O processo principal

| Passo | O quê |
|---|---|
| Pedido | Um canal novo recebe só o nome sugerido do arquivo; o conteúdo é a própria janela de quem pediu |
| PDF | `printToPDF` da janela, em A4, com o fundo, o rodapé e o PDF marcado |
| Gravar | "Salvar como" na pasta Downloads; sem escolha, nada é gravado; devolve se gravou e onde |
| Abrir | **Abrir** pede ao sistema para abrir o arquivo gravado (só esse caminho) |

## 6. Modelo de dados

Nenhuma mudança: sem tabela, sem migração e sem rota nova. O relatório usa as leituras que a tela da carteira já faz.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A tela de cada carteira tem **Baixar relatório (PDF)**, com o período da Rentabilidade; desativado, com o motivo, sem lançamentos ou, no modo consulta, faltando leitura |
| CA02 | O PDF tem o cabeçalho, o resumo com as três referências, os dois gráficos, as posições, a distribuição, os proventos, o extrato do período (do mais antigo para o mais recente, sem os estornados, com a nota) e os avisos (educacional, custos, fontes e atraso, e os da rentabilidade); os números são os mesmos da tela |
| CA03 | A4 retrato, tema claro, texto selecionável, PDF marcado (título, títulos de seção, tabelas com cabeçalho repetido), rodapé com "Página X de Y"; nenhuma linha de tabela cortada entre páginas |
| CA04 | "Salvar como" com o nome sugerido no idioma e sem acentos; cancelar não grava; depois de gravar, o aviso com **Abrir** |
| CA05 | No idioma da interface: textos, moeda, números, datas e nome do arquivo (português e inglês) |
| CA06 | No modo consulta, o relatório sai com os dados guardados e "Dados de …"; faltando leitura, o botão diz o que falta |
| CA07 | Nenhum dado pessoal no PDF (nome, e-mail); nada passa pelo servidor além das leituras de sempre |
| CA08 | Pelo teclado, a 480 px e com contraste; "Gerando o relatório…" e "Relatório salvo" anunciados aos leitores de tela |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-38 | ✅ Resolvida com a aprovação (17/11/2026), pela decisão 1 do §4.1 (o conteúdo do relatório) |
| OPEN-43 | O diagrama de casos de uso continua sem "Exportar relatório"; fica para a atualização do diagrama |
| Evolução | Comparação de carteiras em PDF, escolher as seções e incluir cenários e notícias quando existirem (SPECs 029 e 031) |

## 9. Verificação (17/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | No processo principal, `app/src/main/portfolio-report.ts` (`reportFileName`, `reportFooter`, `reportPdfOptions` e `savePortfolioReport`), com os canais `report:save` e `report:open` (`REPORT_CHANNELS`) e `window.api.report`. Na interface, `PortfolioReport.tsx` (o `ReportButton` e o documento, posto no `body` por um portal), `report.ts` (o extrato do período, os proventos em centavos, até onde ler o extrato e a data dos dados guardados) e `report.css` (`@media print`). A Rentabilidade avisa a página quando o período muda (`onQueryChange`); o bloco das referências (`Benchmarks`) e a data dos lançamentos (`entryWhen`) são os mesmos da tela |
| Ordem do "Salvar como" | Primeiro a janela, depois a impressão: quem cancela não espera o PDF ser montado |
| Abrir | O processo principal guarda o caminho gravado; o **Abrir** não recebe caminho nenhum da interface |
| Gráficos | Versões estáticas dos dois gráficos da Rentabilidade, desenhadas com as mesmas funções (`chartLayout`, `pathOf` e os eixos) na largura útil do A4. Os da tela medem a janela e têm cursor, e não serviam para o papel |
| Proventos do período | A soma do líquido dos proventos do extrato do período, em centavos exatos (sem ponto flutuante); a venda de fração não é provento e fica de fora |
| Extrato | Lido página por página até passar do início do período: uma histórica longa com o período "12 meses" não lê anos à toa. A ordem do relatório é a do servidor invertida, então o saldo depois de cada lançamento continua certo |
| Modo consulta | O botão não fica desativado antes, porque só a leitura sabe o que falta. Depois do clique, "Precisa de conexão: a rentabilidade deste período não está guardada neste computador" (ou as posições, ou o extrato completo), com o foco na mensagem |
| Carteira sem lançamento | O botão confere a primeira página do extrato (a mesma que a tela lê) e fica desativado com "Ainda não há lançamentos para o relatório." |
| Sem posições | "Nenhum ativo na carteira.": o texto da tela fala em "Use Comprar", que não serve no papel |
| Espera antes de imprimir | Um quadro de pintura ou, no máximo, 100 ms. Com a janela escondida ou minimizada não há quadros, e a geração ficava parada (achado na prévia, com a pane do navegador escondida); o documento já está na página, e a impressão monta o próprio layout |
| Título do PDF | Enquanto imprime, o título da página é "Relatório da carteira <nome>" (ele vira o título do PDF); depois, volta |
| Pré-visualização | A ponte falsa (`app/.previa`, fora do Git) ganhou `report.save` e `report.open`. Com `window.__previa.holdReport`, a gravação espera, e o documento pode ser visto copiando as regras de impressão para a tela |

| Critério | Resultado |
|---|---|
| CA01 | ✅ Pré-visualização: o botão ao lado de **Copiar carteira**, com "Do período da Rentabilidade: Desde o início", que vira "12 meses" ao trocar o período. Na carteira "Reserva", sem lançamentos, o botão fica desativado com o motivo. No modo consulta, a explicação vem depois do clique (ajuste acima) |
| CA02 | ✅ Pré-visualização, com dados de exemplo nas leituras de uma carteira: cabeçalho; resumo com as três referências e o "% do CDI"; os dois gráficos; posições (com o desdobramento e os proventos de cada ativo); distribuição por classe e por setor ou segmento; proventos (recebidos no período, a receber e o próximo pagamento); extrato do mais antigo para o mais recente, com o JCP e o IR retido, sem a venda estornada (com a nota) e sem o aporte de antes do período; e os avisos. `report.test.ts`: o extrato do período, os proventos em centavos, a leitura das páginas e a data dos dados |
| CA03 | ✅ `portfolio-report.test.ts`: A4 retrato com o fundo, o rodapé com o nome da carteira, o aviso e "Página X de Y" (o nome não vira HTML), PDF marcado e sumário pelos títulos. No CSS: cabeçalho das tabelas repetido em cada página, linhas que não se partem e o tema claro. ⏳ Ver o PDF de verdade no Electron (a pré-visualização não imprime) |
| CA04 | ✅ `portfolio-report.test.ts`: nome sugerido sem acentos e sem caracteres proibidos, no idioma; cancelar não imprime nem grava; erro ao imprimir ou ao gravar não deixa arquivo. Pré-visualização: "Relatório salvo em Downloads." com **Abrir** (o rótulo diz o nome do arquivo) e o foco na mensagem; cancelado, o foco volta ao botão |
| CA05 | ✅ Pré-visualização em inglês: "Download report (PDF)", "For the Performance period: Since inception", "Portfolio report", as seções, as datas e a moeda em inglês, o rodapé "Page … of …" e o título "… portfolio report"; o arquivo `report-…` (teste) |
| CA06 | ✅ Pré-visualização sem conexão: o relatório sai com "Dados: De 15 de novembro de 2026 às 18:12, guardados neste computador (sem conexão)"; no período "12 meses", nunca aberto, a explicação |
| CA07 | ✅ No código: o pedido ao processo principal leva só o nome da carteira e os textos do rodapé; o documento não tem o nome nem o e-mail da pessoa; nenhuma rota nova no servidor |
| CA08 | ✅ Pré-visualização: o botão é nativo e, depois do resultado, o foco vai para a mensagem; a 480 px, os botões quebram em duas linhas, sem rolagem lateral; "Gerando o relatório…" e "Relatório salvo" em `role="status"` e o erro em `role="alert"`. O documento usa as cores do tema claro, mesmo com o app no escuro |

Total: **1.139 testes** passando (10 novos), com o banco de teste, mais lint, tipos e formatação.
