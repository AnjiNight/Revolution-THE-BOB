# SPEC-022 — Comparação de carteiras

| Campo | Conteúdo |
|---|---|
| Status | ⏳ Escrita em 09/11/2026, a pedido do Luís; aguardando a aprovação (recomendações do §4.1 e propostas do §4.2) |
| Fase | 5 — Acompanhamento da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-021 |
| Prioridade | Could (RF19) |
| Depende de | [SPEC-012](SPEC-012.md) (carteiras ao vivo e históricas), [SPEC-019](SPEC-019.md) (rentabilidade da cota e evolução), [SPEC-020](SPEC-020.md) (CDI, Ibovespa, IFIX e "% do CDI"), [SPEC-021](SPEC-021.md) (distribuição por classe e setor) |
| Muda | Lista de carteiras (botão **Comparar carteiras** e a escolha); nova tela **Comparação**; nova rota só de leitura. Sem tabela nova |
| Requisitos | RF19; RB13; RNF04, RNF06, RNF12, RNF16, RNF18, RNF20 |
| Casos de uso | "Comparar cenários" (citado nas personas e no mapa, sem caso de uso no modelo: OPEN-22); P01 passo 9; P02 passos 6 a 8 |
| Drivers | OBJ02 |
| ADRs | [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md) (rótulo do tipo sempre visível) |

---

## 1. Objetivo

Pôr **de 2 a 4 carteiras** do usuário lado a lado, **no mesmo período**:

- a **rentabilidade** de cada uma, num gráfico em % com uma linha por carteira, e as referências (CDI, Ibovespa e IFIX) quando o usuário quiser;
- o **resumo em reais**: patrimônio, aportes, resultado;
- a **composição de hoje**: classes e setores, em % de cada carteira.

É o "compara os resultados das duas simulações" da P01 e o "comparar os cenários" da P02.

## 2. Valor

- **Usuário (P01, P02):** "a carteira com mais FIIs rendeu mais do que a com mais petróleo?". Hoje, para saber, é preciso abrir uma carteira, anotar os números, abrir a outra e comparar de cabeça, cada uma no seu período.
- **Projeto:** fecha o RF19 e, com a proposta para a OPEN-22, define o que o app chama de "cenário".

## 3. Escopo

### 3.1 Inclui

1. **Escolher de 2 a 4 carteiras** na lista de carteiras e abrir a tela **Comparação**.
2. **Rentabilidade da cota** de cada uma no mesmo período (SPEC-019), num gráfico em %, com o botão **Comparar com os índices** (SPEC-020).
3. **Tabela do resumo**: tipo, início, patrimônio, aportes líquidos, resultado, rentabilidade e "% do CDI" de cada carteira.
4. **Composição de hoje** lado a lado: classes e setores/segmentos, em % de cada carteira (SPEC-021).
5. **Carteiras ao vivo e históricas juntas**, com o rótulo do tipo sempre visível (OPEN-23).

### 3.2 Não inclui

- **Salvar a comparação**: ela é refeita a cada vez, a partir das carteiras, que já ficam salvas.
- **Criar a carteira B a partir da A** (mesmo início e mesmo valor inicial, para testar outra distribuição): proposta para a SPEC-023 (§8).
- **Métricas de risco** (volatilidade, maior queda): nenhuma Spec as calcula ainda.
- **Rentabilidade ativo por ativo**: fica com a Spec futura citada na SPEC-021 §3.2.
- **Gráfico em reais**: as carteiras podem ter tamanhos muito diferentes; os reais ficam na tabela (§4.1, decisão 3).
- **Carteiras de outros usuários.**

## 4. Decisões

### 4.1 Recomendações para o Luís aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que é "comparar cenários"** (OPEN-22, a parte da SPEC-022) | Cada **cenário é uma carteira**. O "criar uma nova simulação" das personas é criar outra carteira, e "comparar os cenários" é esta tela. A entidade SIMULACAO do modelo (uma projeção para o futuro) fica com os cenários por sentimento (SPEC-031) | As personas montam carteiras e comparam os resultados (P01: "altera a distribuição dos investimentos e compara"; P02: cenário A "mantém a composição", cenário B "reduz petróleo, aumenta FIIs"). A carteira já guarda tudo o que um cenário precisa. Sem essa definição, não há o que comparar |
| 2 | **Ao vivo junto com histórica** (OPEN-23) | **Pode misturar.** O rótulo do tipo fica sempre ao lado do nome. Se houver uma histórica, aparece a nota da DA17: "Simulação histórica: resultado calculado com dados já conhecidos" | É a sugestão da própria DA17 (ponto em aberto 3). Proibir obrigaria a P02 a manter duas cópias da mesma ideia. O rótulo mantém a comparação honesta |
| 3 | **Quantas e como** | **De 2 a 4** carteiras. O gráfico é **só em %** (rentabilidade da cota), com uma linha por carteira. Os valores em reais ficam na tabela | Com mais de 4, as linhas do gráfico e as colunas da tabela ficam ilegíveis na largura do app. Em reais, uma carteira de R$ 50 mil esmagaria uma de R$ 5 mil no gráfico; a cota compara estratégias de tamanhos diferentes (SPEC-019) |
| 4 | **Período** | **O mesmo para todas.** O padrão é **"Em comum"**: do início da carteira mais nova até hoje, o trecho em que todas existem. Os períodos da SPEC-019 continuam disponíveis: 1 mês, 6 meses, 12 meses, no ano, desde o início e personalizado. Uma carteira que começou depois do início do período conta só desde o próprio início, com "começou em 03/11/2026" ao lado | Comparar 12 meses de uma com duas semanas de outra engana. "Em comum" é a comparação justa, e o usuário ainda pode olhar um período maior, avisado |
| 5 | **Composição** | **De hoje**, como na SPEC-021. Uma tabela com as classes e os setores/segmentos nas linhas e as carteiras nas colunas, em % de cada carteira; "—" onde a carteira não tem nada | Mostra de cara a diferença entre o cenário A e o B da P02 ("menos petróleo, mais FIIs") |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Rota** | `GET /api/portfolios/comparison?ids=…&period=…` (ou `from` e `to`), só de leitura, num pedido só (§5.1). O caminho fixo `comparison` tem preferência sobre `/api/portfolios/:id` no roteador do Fastify | Um pedido só garante o mesmo "hoje", as mesmas cotações e as mesmas referências para todas as carteiras. Quatro pedidos separados poderiam cair em minutos diferentes |
| **Onde fica a conta** | No `TradingService`, reaproveitando a rentabilidade (SPEC-019 e 020) e as posições com a distribuição (SPEC-021) de cada carteira, sem núcleo novo. A única conta nova é o período "Em comum" (o início mais recente), pura e testada | Os números de cada carteira na comparação são os mesmos da tela dela (CA03). Nada é recalculado de outro jeito |
| **Fechamentos lidos uma vez** | No mesmo pedido, o fechamento de um ativo que está em mais de uma carteira é lido uma vez só. O calendário também | As carteiras de um mesmo usuário costumam repetir ativos (o A e o B da P02) |
| **Referências** | Calculadas uma vez para o período, a partir do mesmo dia-base para todas: o pregão antes do início do período; em "Desde o início", o da carteira mais antiga. O IFIX entra se alguma carteira teve FII. O "% do CDI" de cada carteira segue a regra da SPEC-020 (só com a carteira e o CDI acima de 0%) | As linhas dos índices valem igualmente para todas as carteiras |
| **Gráfico** | Uma linha contínua por carteira, cada uma com uma cor da paleta do app e um marcador próprio (círculo, quadrado, triângulo, losango), para não depender só da cor. Os índices aparecem tracejados, como na SPEC-020. Pelo teclado, o ponto mostra o dia e a % de cada carteira. Acima de 2 anos, um ponto por semana (SPEC-019) | Legível com daltonismo e pelo teclado (RNF18) |
| **Tabela do resumo** | Linhas: Tipo; Início; Patrimônio no fim; Aportes líquidos no período; Resultado no período; Rentabilidade da cota; % do CDI. Colunas: as carteiras, na ordem em que foram escolhidas. Os números seguem as regras da SPEC-019 (centavos, RB13; % com 2 casas) | A tabela também serve de texto alternativo do gráfico |
| **Avisos** | Os avisos da rentabilidade (SPEC-019: salto de preço sem evento, ativo sem fechamento) aparecem abaixo da tabela, por carteira, com o link para ela | A comparação não esconde o que a tela da carteira avisa |
| **Carteira sem lançamento no período** | Entra na tabela com "Sem lançamentos no período" e fica sem linha no gráfico | Escolher uma carteira vazia não é erro |
| **Escolha na lista** | Botão **Comparar carteiras** ao lado de "Nova carteira", com 2 carteiras ou mais. Ao clicar, aparece uma caixa de seleção em cada carteira e, embaixo, **Comparar (2)** e **Cancelar**. Com 4 marcadas, as outras caixas ficam desativadas, com "Até 4 carteiras" | Simples e acessível pelo teclado. Quem não compara não vê a lista mudar |
| **Tela Comparação** | Título "Comparação". O nome de cada carteira (com link para ela), com a cor, o marcador e o rótulo do tipo. O seletor de período, com "Em comum" primeiro. O gráfico com "Comparar com os índices". A tabela do resumo. A composição de hoje (§4.1, decisão 5). A nota da DA17, se houver histórica. "Voltar para as carteiras". A 480 px, as tabelas rolam na horizontal dentro do próprio quadro | Segue o padrão das outras telas da carteira |
| **Erros** | `ids` com menos de 2, mais de 4, repetidos ou que não são um id: 400 com `fields.ids = invalid_selection`. Carteira que não existe ou é de outro usuário: 404 `portfolio_not_found`, sem dizer qual, como nas outras rotas. Período: as mesmas regras da SPEC-019 (`after_today`, `after_end`) | Não revela a carteira de outra pessoa |
| **Exportação (SPEC-034)** | Sem mudança | Nada é guardado |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| P01: duas históricas desde 02/01/2025, cada uma com aporte único de R$ 5.000,00. A com 50% PETR4, 20% VALE3 e 30% MXRF11; B com outra divisão. Hoje A vale R$ 5.600,00 e B, R$ 5.250,00 | "Em comum" = desde 02/01/2025. A: resultado R$ 600,00, rentabilidade 12,00%. B: R$ 250,00, 5,00%. Duas linhas no gráfico desde o mesmo dia |
| A tem 12,00% e B tem −3,00% no período; o CDI rendeu 10,00% | A: "120% do CDI". B: sem "% do CDI" (carteira abaixo de 0%, regra da SPEC-020) |
| Histórica A (desde 02/01/2025) e ao vivo C (criada em 03/11/2026) | "Em comum" = desde 03/11/2026. A conta a partir do patrimônio no pregão anterior; C, desde o próprio início. Rótulos "Simulação histórica" e "Simulação ao vivo" ao lado dos nomes, e a nota da DA17 |
| As mesmas A e C, com "Desde o início" | O gráfico começa em 02/01/2025. A linha de C só começa em 03/11/2026, em 0%, com "começou em 03/11/2026" na tabela |
| P02, composição de hoje. A: Petróleo 40%, Financeiro 30%, Logística 20%, Caixa 10%. B: Petróleo 15%, Financeiro 30%, Logística 25%, Recebíveis 20%, Caixa 10% | Linhas: **Ações** 70% / 45%; Petróleo, gás e biocombustíveis 40% / 15%; Financeiro 30% / 30%; **FIIs** 20% / 45%; Logística 20% / 25%; Recebíveis — / 20%; **Caixa** 10% / 10% |
| Carteira criada hoje, ainda sem aporte, escolhida junto com outra | "Sem lançamentos no período", sem linha no gráfico. A outra aparece normalmente |
| Quatro carteiras marcadas na lista | As outras caixas ficam desativadas, com "Até 4 carteiras" |
| `ids` com o id de uma carteira de outro usuário | 404 `portfolio_not_found`, sem dizer qual |

### 4.4 Conferido em 09/11/2026

| Pergunta | Resposta |
|---|---|
| O que as personas pedem | P01 (passos 7 e 9): testar outra distribuição e comparar os resultados. P02 (passos 6 a 8): criar outra simulação, mudar pesos ou ativos e comparar. Nas duas, cada "simulação" é montada como uma carteira |
| O que a DA17 sugere | Ponto em aberto 3: "A comparação de carteiras (RF19) pode misturar os dois tipos? Sugestão: sim, sempre com o rótulo visível" |
| "Comparar cenários" | Aparece nas personas e no mapa, mas não no modelo de casos de uso; o mapa já liga a OPEN-22 a esta Spec |
| Tempo da conta | SPEC-019 §9: uma carteira com 50 ativos desde 2016 leva de 0,88 a 0,98 s. Quatro carteiras assim, sem nada compartilhado, poderiam chegar a uns 4 s; com até 50 ativos no total entre elas, o trabalho é parecido com o de uma carteira só |

## 5. Comportamento esperado

### 5.1 Rota

| Rota | Quem | Muda | Detalhes |
|---|---|---|---|
| `GET /api/portfolios/comparison` | Usuário dono das carteiras | Nova | Parâmetros: `ids` (2 a 4 ids separados por vírgula, na ordem da tela) e `period` (`common`, `1m`, `6m`, `12m`, `ytd` ou `all`; padrão `common`), ou `from` e `to`. Corpo: `from`, `to`, `baseDate`, `weekly`, `benchmarks` (o resumo de cada referência, como na SPEC-020), `benchmarkSeries` (um ponto por dia do gráfico, com a % de cada referência) e `portfolios`. Cada item de `portfolios` traz `id`, `name`, `type`, `startDate`, `performance` e `allocation`. O `performance` tem `startValue`, `endValue`, `netFlows`, `result`, `return`, `cdiShare`, `empty`, `warnings` e `series` (com `date` e `return`). O `allocation` é o mesmo da SPEC-021. Erros do §4.2 |

### 5.2 Telas

As do §4.2: em português e em inglês, pelo teclado (as caixas de seleção da lista e o seletor de período), com a tabela do resumo como alternativa ao gráfico para o leitor de tela, a 480 px e com contraste (RNF04, RNF18, RNF20).

## 6. Modelo de dados

Nenhuma mudança e nenhuma migração: a comparação é calculada a cada pedido, a partir das carteiras.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Período "Em comum" no núcleo, puro e com testes de unidade (RNF16): o início mais recente entre as carteiras; com uma carteira de hoje, o período é só hoje; os exemplos do §4.3 |
| CA02 | Rota: de 2 a 4 ids na ordem pedida; os erros do §4.2 (menos de 2, mais de 4, repetidos, inválidos; carteira de outro usuário → 404 sem dizer qual); os períodos da SPEC-019 e o `common`; referências calculadas uma vez, IFIX só com FII; "% do CDI" pela regra da SPEC-020 |
| CA03 | Os números de cada carteira na comparação são iguais aos da tela dela no mesmo período (rentabilidade, resultado, patrimônio, distribuição), nos dois tipos de carteira |
| CA04 | Carteira que começou depois do início do período conta desde o próprio início, com a data; carteira sem lançamento aparece como "Sem lançamentos no período", sem linha |
| CA05 | Menos de 2 s com até 50 ativos no total desde 2016 (RNF06), medido com dados reais. O caso de 4 carteiras com 50 ativos cada é medido e registrado no §9. Um fechamento que se repete entre carteiras é lido uma vez |
| CA06 | Telas: a escolha na lista (até 4, com o aviso), o gráfico com cores e marcadores, "Comparar com os índices", a tabela do resumo, a composição, o rótulo do tipo e a nota da DA17, os avisos por carteira; em português e inglês; pelo teclado; a 480 px; com contraste |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-22 | ⏳ A decisão 1 do §4.1, se aprovada, resolve a parte "Comparar cenários × RF19". Fica a parte da SPEC-023 (RF20, "salvar e recuperar simulações"). Com cenário = carteira, as carteiras já ficam salvas (SPEC-012). Recomendação para decidir com a SPEC-023: transformá-la em **"Nova carteira a partir de outra"** (mesmo tipo, mesmo início e mesmo valor inicial, para montar o cenário B rápido), ou marcá-la como coberta pela SPEC-012 |
| OPEN-23 | ⏳ Resolvida pela decisão 2 do §4.1, se aprovada. Fecha junto o ponto em aberto 3 da DA17 |
