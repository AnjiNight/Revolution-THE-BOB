# SPEC-021 — Distribuição da carteira por classe e setor

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 09/11/2026, a pedido do Luís; aprovada por ele no mesmo dia com as recomendações do §4.1 e as propostas do §4.2, pedindo antes a revisão do setor de todos os ativos do catálogo ("revise todos os ativos … e corrija os que estiverem errados, depois pode implementar a spec") |
| Fase | 5 — Acompanhamento da carteira ([mapa de specs](mapa_specs.md)), depois da SPEC-020 |
| Prioridade | Should (RF18) |
| Depende de | [SPEC-014](SPEC-014.md) (posições e valor de mercado), [SPEC-043](SPEC-043.md) (posições corrigidas), [SPEC-006](SPEC-006.md) (classe e setor do catálogo), [SPEC-040](SPEC-040.md) (classificação sugerida na importação), [SPEC-041](SPEC-041.md) (segmento dos FIIs no Investidor10), [SPEC-042](SPEC-042.md) (página da empresa na B3) |
| Muda | Tela da carteira (painel **Distribuição**, depois das Posições); rota das posições (SPEC-014, ganha a distribuição e o setor de cada posição); sugestão de classificação dos ativos "a revisar" (SPEC-040), com a classificação setorial da B3 (ações) e o segmento do Investidor10 (FIIs) |
| Requisitos | RF18; RB09, RB13, RB22; RNF04, RNF12, RNF15, RNF16, RNF17, RNF18, RNF20 |
| Casos de uso | Consultar posição e saldo; P01 e P02 passo 2 ("minha carteira está diversificada?") |
| Drivers | OBJ01, QA13 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA09](../adr/DA09-lancamentos-imutaveis.md), [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA17](../adr/DA17-carteira-ao-vivo-e-historica.md), [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) |

---

## 1. Objetivo

Mostrar **como a carteira está dividida hoje**, como nas corretoras:

- por **classe**: Ações, FIIs e Caixa, em % do patrimônio;
- dentro de cada classe, por **setor** (ações) ou **segmento** (FIIs), com os ativos de cada um.

Para que a divisão por setor diga alguma coisa, a Spec também **melhora a classificação sugerida** dos ativos que a equipe ainda não conferiu (§4.1, decisão 5): hoje, 67% dos FIIs e 28% das ações do catálogo estão em "Outros".

## 2. Valor

- **Usuário (P01, P02):** "estou concentrado demais em bancos? Meus FIIs são todos de papel?". A tabela de posições mostra ativo por ativo; a distribuição mostra o todo.
- **Projeto:** fecha o RF18. A classificação melhor também serve à busca por setor (SPEC-006) e à lista Ativos.

## 3. Escopo

### 3.1 Inclui

1. **Distribuição de hoje** nas carteiras ao vivo e histórica (avaliada hoje, DA17): classes, setores ou segmentos, e os ativos de cada setor, com valor e %.
2. **Painel Distribuição** na tela da carteira, com barras (§4.1, decisão 4).
3. **Classificação sugerida melhor** para os ativos "a revisar": **setor econômico da B3** para as ações e **segmento do Investidor10** para os FIIs, sem tocar no que a equipe já conferiu.

### 3.2 Não inclui

- **Distribuição numa data passada** ("como estava em 2020"): pode vir depois, com as posições de cada dia do núcleo da SPEC-019.
- **Rentabilidade por ativo no período** (com vendas e proventos), que a SPEC-019 deixou para cá: as posições já mostram a variação de cada ativo sobre o preço médio. O resultado por ativo num período fica para uma Spec futura (não há no mapa).
- **Meta de alocação** ("quero 40% em FIIs") e rebalanceamento.
- **Subsetor e segmento das ações** (o 2º e o 3º nível da B3): ficam guardados, mas a tela usa só o setor econômico, que é a lista do catálogo (SPEC-006).

## 4. Decisões

### 4.1 Aceitas pelo Luís em 09/11/2026

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que mostrar** | Três níveis: **classe** (Ações, FIIs e **Caixa**) em % do patrimônio; **setor ou segmento** em % da classe e da carteira; e, ao abrir um setor, os **ativos** dele com valor e %. O Caixa entra como classe | É como as corretoras mostram. O caixa faz parte do patrimônio (é o "Total" das posições); sem ele, uma carteira com 70% em dinheiro pareceria 100% investida |
| 2 | **Valor de cada ativo** | O mesmo das posições (SPEC-014 e SPEC-043): quantidade corrigida × último preço (a cotação do pregão; sem ela, o último fechamento). Ativo sem nenhum preço entra pelo custo (preço médio × quantidade), com aviso | O total da distribuição bate com o "Total" das posições, e as duas telas nunca discordam |
| 3 | **Data** | **Hoje**, nas duas carteiras (a histórica avaliada hoje, DA17) | É a pergunta de quem olha a carteira. A distribuição numa data passada fica para depois (§3.2) |
| 4 | **Gráfico** | **Barras horizontais**, não pizza: uma barra dividida para as classes e, em cada classe, uma barra por setor, sempre com o nome, o valor e a % escritos ao lado | Barras são mais fáceis de comparar e de ler pelo teclado e pelo leitor de tela; a pizza com 11 fatias fica ilegível |
| 5 | **Classificação dos ativos "a revisar"** | O processador troca a **sugestão** por uma fonte melhor, **só nos ativos que a equipe ainda não conferiu**: nas ações, o **setor econômico da B3** (página da empresa, a mesma da SPEC-042); nos FIIs, o **segmento do Investidor10** (já coletado pela SPEC-041, só com o interruptor ligado). Cada troca fica na auditoria. O que a equipe conferiu nunca muda | Conferido em 09/11/2026 no banco de desenvolvimento: **nenhum** dos 713 ativos foi conferido ainda; 223 dos 334 FIIs e 108 das 379 ações estão em "Outros". A sugestão da brapi também erra: põe o MXRF11 em Logística e o HGLG11 (galpões) em Outros. A B3 classifica todas as empresas listadas; o Investidor10 tem o segmento de 317 dos 334 FIIs |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Rota** | `GET /api/portfolios/:id/positions` (SPEC-014) ganha `allocation` (§5.1) e o `sector` de cada posição. Sem rota nova | As mesmas posições e o mesmo total, num pedido só |
| **Onde fica a conta** | Núcleo novo `financial-calculation/allocation.ts` (puro, DA10): recebe as posições valorizadas e o caixa e devolve as classes, os setores e os ativos, em centavos | Testável sem banco (RNF16), como a rentabilidade |
| **Arredondamento** | Valores em centavos (RB13); % com 2 casas, meio para cima, cada uma calculada sobre o total exato. A soma das % pode dar 99,99% ou 100,01% | É o que a regra de arredondamento dá; forçar 100,00% mudaria uma das % sem motivo visível |
| **Ordem** | Classes: Ações, FIIs, Caixa. Setores e ativos do maior valor para o menor, "Outros" sempre por último | O que pesa mais primeiro |
| **Caixa negativo** | (SPEC-043, proventos que somem) O caixa negativo fica **fora** das barras e das %, com o aviso "Caixa negativo: R$ −58,50; a distribuição considera só os ativos" | Não há fatia negativa numa barra |
| **Carteira sem ativos** | Só o Caixa (100%) e "Compre um ativo para ver a distribuição por setor". Sem caixa nem ativos, o painel não aparece | Nada a dividir |
| **Tela** | Painel **Distribuição** depois das Posições: a barra das classes com a legenda; abaixo, "Ações por setor" e "FIIs por segmento" lado a lado (empilhados a 480 px), cada setor com a barra, o valor, "% das ações" e "% da carteira", e um botão que abre os ativos dele. Uma nota de rodapé: "Setores pela classificação da B3; segmentos dos FIIs sugeridos a partir do Investidor10, conferidos pela equipe" | Como o resto da carteira; a nota diz de onde vem a classificação |
| **Setor econômico da B3** | Na tarefa semanal dos eventos (`eventos_b3`, SPEC-042), depois da página da empresa (que já traz o `codeCVM`), mais um pedido à página de detalhe (`GetDetail`), com o mesmo ritmo (um pedido a cada 2 s), só para a empresa sem classificação guardada ou guardada há mais de 30 dias. Guarda o texto da B3 ("Consumo Cíclico / Comércio / Eletrodomésticos") por empresa | A primeira vez são uns 400 pedidos a mais (uns 13 minutos no domingo de madrugada); depois, uns 15 por semana |
| **Da B3 para o catálogo** | O 1º nível vira o código do catálogo pelo nome, sem acentos nem pontuação ("Petróleo. Gás e Biocombustíveis" → `petroleo_gas_biocombustiveis`, "Consumo não Cíclico" → `consumo_nao_ciclico`). Vale para todas as ações da empresa (pelo código de 4 letras, como os eventos da SPEC-042), units incluídas | A lista do catálogo (SPEC-006) é a dos setores econômicos da B3 |
| **Do Investidor10 para o catálogo** | Pelo tipo e pelo segmento: tipo "Fundo de Fundos" → Fundo de fundos; tipo "Fundo de Desenvolvimento" → Desenvolvimento; segmento "Títulos e Valores Mobiliários" → Recebíveis; "Lajes Corporativas" → Lajes corporativas; "Logístico / Indústria / Galpões" → Logística; "Shoppings / Varejo" → Shoppings; "Híbrido" → Híbrido; "Residencial" → Residencial; "Hotéis" → Hotéis; "Hospitalar", "Agências Bancárias" e "Educacional" → Renda urbana; segmento "Outros" com tipo "Fundo de Papel" → Recebíveis. O resto ("Outros") não troca a sugestão | Cobre os textos encontrados nos 317 FIIs coletados (§4.4) |
| **Quando troca** | Só ativo **a revisar** (sem `classificacao_conferida_em`), só quando a fonte dá um setor específico (nunca troca uma sugestão por "Outros") e só quando muda. Roda ao fim da tarefa dos eventos (ações) e da coleta do Investidor10 (FIIs), e uma vez sobre o que já está guardado, ao implantar | A equipe continua decidindo; a fonte só melhora o palpite |
| **Auditoria (RNF15)** | Cada troca vira um registro `classificacao_sugerida`, sem colaborador (o processador, como na SPEC-040), com o setor de antes e o de depois e a fonte (`b3` ou `investidor10`) | Dá para saber de onde veio cada sugestão |
| **Investidor10 desligado** | Os FIIs ficam com a sugestão da brapi; as ações melhoram do mesmo jeito (a B3 não depende do interruptor) | O interruptor da SPEC-041 vale para tudo do Investidor10 |
| **Exportação (SPEC-034)** | Sem mudança | A distribuição é calculada; a classificação não é dado pessoal |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Caixa R$ 2.000,00; 100 PETR4 a R$ 31,20; 200 ITUB4 a R$ 37,00; 1.000 MXRF11 a R$ 9,80; 30 HGLG11 a R$ 160,00 (total R$ 27.120,00) | **Ações** R$ 10.520,00 (38,79%), **FIIs** R$ 14.600,00 (53,83%), **Caixa** R$ 2.000,00 (7,37%): a soma dá 99,99% (§4.2, arredondamento) |
| Ações do mesmo exemplo | Financeiro R$ 7.400,00 (70,34% das ações, 27,29% da carteira); Petróleo, gás e biocombustíveis R$ 3.120,00 (29,66%, 11,50%) |
| FIIs do mesmo exemplo, com a classificação melhorada | Híbrido (MXRF11) R$ 9.800,00 (67,12% dos FIIs, 36,14% da carteira); Logística (HGLG11) R$ 4.800,00 (32,88%, 17,70%). Com a sugestão de hoje, o MXRF11 apareceria em Logística e o HGLG11 em Outros |
| ALPA4, CYRE4 e BRAP4, hoje em "Outros" e a revisar | Consumo cíclico, Consumo cíclico e Materiais básicos (B3, conferido em 09/11/2026) |
| KNCR11, hoje em "Outros" | Recebíveis (Investidor10: "Títulos e Valores Mobiliários") |
| Ativo que a equipe já conferiu como Financeiro | Continua Financeiro, diga a B3 o que disser |
| Investidor10 diz "Outros" e a brapi sugeriu Residencial | Continua Residencial (a fonte não troca por "Outros") |
| Carteira só com R$ 5.000,00 em caixa | Caixa 100% e "Compre um ativo para ver a distribuição por setor" |
| Caixa negativo de R$ 58,50 | Fora das barras, com o aviso; as % são sobre os ativos |
| Ativo sem cotação nem fechamento | Entra pelo custo, com "PETR4 entrou pelo custo: ainda sem preço" |

### 4.4 Conferido em 09/11/2026

| Pergunta | Resposta |
|---|---|
| Classificação hoje (banco de desenvolvimento) | 713 ativos, **0 conferidos**. Ações: 108 de 379 em "Outros". FIIs: 223 de 334 em "Outros"; MXRF11 em Logística |
| Página de detalhe da B3 | `GET …/listedCompaniesProxy/CompanyCall/GetDetail/{base64}` com `{"codeCVM":"9512","language":"pt-br"}` traz `industryClassification`: "Petróleo. Gás e Biocombustíveis / Petróleo. Gás e Biocombustíveis / Exploração. Refino e Distribuição" (a B3 troca as vírgulas por pontos). O `codeCVM` vem da página que a SPEC-042 já consulta. Conferidas: ITUB e SANB (Financeiro), MGLU, ALPA e CYRE (Consumo Cíclico), WEGE (Bens Industriais), TOTS (Tecnologia da Informação), ABEV (Consumo não Cíclico), BRAP (Materiais Básicos) |
| Investidor10 | 317 dos 334 FIIs com segmento. Os mais comuns: "Títulos e Valores Mobiliários" (79), "Híbrido" (74), "Lajes Corporativas" (44), "Outros" (41), "Logístico / Indústria / Galpões" (31), "Shoppings / Varejo" (28), e poucos "Hospitalar", "Agências Bancárias", "Residencial", "Hotéis", "Fundo de Fundos" e "Educacional". Tipos: "Fundo de Papel", "Fundo de Tijolo", "Fundo Misto", "Fundo de Fundos", "Fundo de Desenvolvimento", "Outro" |

## 5. Comportamento esperado

### 5.1 Rota

| Rota | Quem | Muda | Detalhes |
|---|---|---|---|
| `GET /api/portfolios/:id/positions` (SPEC-014) | Usuário dono | Ganha campos | Cada posição ganha `sector`. Novo `allocation`: `total` (caixa positivo + ativos), `classes` (`kind`: `stock`, `fii` ou `cash`; `value`; `percent`; nas duas primeiras, `sectors` com `sector`, `value`, `percent`, `percentOfClass` e `assets` com `assetId`, `ticker`, `value`, `percent`), `atCost` (tickers avaliados pelo custo) e `negativeCash` (o valor, ou `null`). Sem novos erros |

### 5.2 Tarefas do processador

| Tarefa | Muda |
|---|---|
| `eventos_b3` (SPEC-042) | Depois dos eventos de cada empresa, busca a classificação da B3 quando falta ou tem mais de 30 dias; no fim, troca a sugestão das ações a revisar (§4.2) |
| `investidor10` (SPEC-041) | No fim, troca a sugestão dos FIIs a revisar pelo segmento coletado (§4.2) |

### 5.3 Telas

As do §4.2, em português e inglês, pelo teclado (os setores abrem por botões com `aria-expanded`), com o texto de cada barra legível sem a barra (leitor de tela), a 480 px e com contraste (RNF04, RNF18, RNF20). Na Área do colaborador, nada muda: o ativo continua "a revisar", agora com a sugestão melhor.

## 6. Modelo de dados

| Tabela | Colunas | Regras |
|---|---|---|
| `classificacao_b3` (nova) | `codigo` (4 letras), `codigo_cvm`, `setor`, `subsetor`, `segmento`, `coletada_em` | Chave `codigo`; os três textos como a B3 publica |
| `acao_auditoria` (enum) | + `classificacao_sugerida` | Feita pelo processador, sem colaborador (SPEC-040) |

Nenhuma mudança em `ativo`: a troca é do `setor` que já existe, como a equipe faria pela tela. A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Núcleo puro com testes de unidade (RNF16): os exemplos do §4.3 (classes, setores, ativos, a soma 99,99%), carteira só com caixa, caixa negativo, ativo pelo custo, a ordem com "Outros" no fim |
| CA02 | A rota das posições traz `allocation` e o `sector` de cada posição; o `total` bate com o "Total" das posições; nas duas carteiras |
| CA03 | Classificação da B3: um pedido de detalhe por empresa sem classificação ou com mais de 30 dias, no ritmo de 2 s; o 1º nível vira o setor do catálogo (todos os 11 nomes da B3 e a grafia com pontos); falha de uma empresa não para as outras |
| CA04 | Investidor10: a tabela do §4.2 com os textos reais; "Outros" não troca; com o interruptor desligado, nada muda nos FIIs |
| CA05 | Só os ativos a revisar mudam; o conferido pela equipe nunca; cada troca na auditoria com antes, depois e fonte (RNF15) |
| CA06 | Com os dados reais do banco de desenvolvimento, quantos ativos saem de "Outros" (medido e registrado no §9) |
| CA07 | Telas: barra das classes, setores com % da classe e da carteira, ativos de cada setor, avisos (caixa negativo, pelo custo), nota das fontes; português e inglês; teclado; 480 px; contraste |
| CA08 | Migração com a tabela e o valor novo da auditoria, desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | ⏳ Termos do site da B3 para a página de detalhe: as mesmas regras da SPEC-042 §4.3 (uso acadêmico, só dentro do app) |
| — | ⏳ Investidor10: a classificação sugerida a partir dele fica no catálogo; vale a autorização de uso acadêmico até a apresentação (SPEC-041). Depois dela, os FIIs voltam a depender da revisão da equipe |
| SPEC-019 | ⏳ A SPEC-019 diz que a "rentabilidade por ativo" vinha aqui: com a aprovação, ela passa a ser de uma Spec futura (§3.2) |

## 9. Verificação (09/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | Núcleo `financial-calculation/allocation.ts` (puro); a rota das posições (`TradingService.positions`) devolve `allocation` e o `sector` de cada posição (o catálogo passa o setor pela porta `PortfolioMarket.asset`). No app, o painel `PortfolioAllocation` fica dentro das Posições, com os mesmos dados (sem outro pedido) |
| Classificação | Domínio `sector-suggestion.ts` (as tabelas do §4.2), serviço `ClassificationSuggestions`, repositório `PrismaClassificationRepository` (tabela `classificacao_b3` e a troca com a auditoria na mesma transação). A tarefa `eventos_b3` pede a página de detalhe (`GetDetail`) com o `codeCVM` da página da empresa e, no fim, aplica as sugestões; a coleta do Investidor10 também, no fim |
| Total da distribuição | O "Total" das posições deixa de fora o ativo sem preço; a distribuição o inclui pelo custo, com o aviso. Só nesse caso (e com caixa negativo) os dois totais diferem |
| Estilo | O estilo global dos botões centraliza o conteúdo: a linha de cada setor ganhou `justify-content: stretch` para ocupar a coluna |
| Ordem da tela (pedido do Luís, 09/11/2026) | Do que mais se consulta para o que menos se consulta, como nos apps de carteira: no topo, o **Caixa** só com o saldo, Aportar e Retirar; depois **Rentabilidade** (SPEC-019), **Posições** e **Distribuição**; no fim, o **Extrato** (o que vai entrar, os lançamentos e os estornos). O componente do caixa (SPEC-013) ficou em duas partes, `summary` e `statement`. Antes, o extrato ficava entre a rentabilidade e as posições e empurrava as posições para baixo |

**Correção do catálogo (pedido do Luís), no banco de desenvolvimento em 09/11/2026:** a tarefa dos eventos rodou uma vez com a classificação: 298 empresas, 596 pedidos à B3 em 21 minutos, sem erro; com o Investidor10 ligado, **326 trocas** de sugestão, todas na auditoria:

| | Antes | Depois |
|---|---|---|
| Ações em "Outros" | 108 de 379 | **2** (MAPT3 e MAPT4: a própria B3 classifica a Cemepe como "Outros") |
| FIIs em "Outros" | 223 de 334 | **27** (o Investidor10 diz "Outros" ou não tem a página) |

As trocas mais comuns: 75 FIIs de "Outros" para Recebíveis, 56 para Híbrido, 19 para Desenvolvimento e 16 para Lajes corporativas; nas ações, 23 para Bens industriais, 21 para Utilidade pública, 18 para Consumo cíclico, 17 para Financeiro e 16 para Materiais básicos. Também corrigiu sugestões erradas que não eram "Outros": MXRF11 de Logística para Híbrido, HGLG11 de Outros para Logística, EPAR3 e NORD3 de Bens industriais para Financeiro. Nenhum ativo conferido pela equipe mudou (não havia nenhum).

**Correção à mão (pedido do Luís, 09/11/2026):** dos 27 FIIs que ficaram em "Outros", 10 tinham o segmento óbvio pelo nome do fundo e foram corrigidos pela edição do catálogo (a mesma da tela Ativos), como colaborador no nome do Luís; por isso ficam **conferidos** e cada troca está na auditoria (`ativo_editado`): AVUR11 e JFLL11 → Residencial; FAED11, MAXR11 e VIUR11 → Renda urbana; ICDI11 e MAGM11 → Recebíveis; PLAG11 → Logística; CCME11 e SMRE11 → Híbrido. Ficam **17** FIIs em "Outros", para a equipe conferir quando quiser: os de energia (RENV11, SNEL11, TRPL15) e os que nem o nome nem o Investidor10 dizem o segmento (AUMT11, BFCC11, BLMG11, HIRE11, JPRD11, LSOP11, PATA11, PLTB11, PMRL11, RBOP11, RBRP11, RJDA15, RSRV11, STYI11).

| Critério | Resultado |
|---|---|
| CA01 | ✅ `allocation.test.ts`: os exemplos do §4.3 (38,79% + 53,83% + 7,37% = 99,99%; os setores e as % da classe), "Outros" no fim, só caixa, caixa negativo e ativo pelo custo |
| CA02 | ✅ `trading-routes.test.ts`: `allocation` e `sector` na rota das posições, com o total igual ao das posições (R$ 5.225,00: 56,84% em ações, 43,16% em caixa) |
| CA03 | ✅ `sector-suggestion.test.ts` (os 11 setores da B3, a grafia com pontos, nomes antigos) e `b3-events-collection.test.ts` (o pedido de detalhe pelo `codeCVM`, de novo só depois de 30 dias, sem `codeCVM` e falha da página sem parar as outras). Com a B3 real: as 298 empresas classificadas |
| CA04 | ✅ A tabela do Investidor10 com os textos reais (`sector-suggestion.test.ts`); "Outros" não troca; desligado, os FIIs não mudam (`classification-suggestions.test.ts`, `investidor10-collection.test.ts`) |
| CA05 | ✅ Só os a revisar e só com o setor de antes; o conferido nunca muda; a auditoria `classificacao_sugerida` sem colaborador, com antes, depois e fonte (`prisma-classification.db.test.ts`, no PostgreSQL) |
| CA06 | ✅ Medido no banco de desenvolvimento (a tabela acima) |
| CA07 | ✅ Pré-visualização das telas: barra das classes com legenda, "Ações por setor" e "FIIs por segmento" lado a lado, cada setor abre os ativos (`aria-expanded`), a nota das fontes; a 480 px em uma coluna, sem rolagem lateral |
| CA08 | ✅ Migração `20261109120000_classificacao_setorial` sem diferença para o esquema do Prisma, desfeita e refeita no banco de teste (a reversão mantém as linhas da auditoria) e aplicada no de desenvolvimento |

Total: **972 testes** passando, com o banco de teste, mais lint, tipos e formatação.
