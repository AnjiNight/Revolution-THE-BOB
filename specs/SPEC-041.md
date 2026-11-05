# SPEC-041 — Indicadores fundamentalistas de ações e FIIs

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pela Nicoly em 04/11/2026, como escrita, e implementada (ver §9). Fonte principal: Investidor10, com autorização por escrito (§4.1) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)), depois da SPEC-010 |
| Prioridade | *Should* (completa a RF08, "consultar ativo") |
| Depende de | [SPEC-006](SPEC-006.md) e [SPEC-040](SPEC-040.md) (catálogo), [SPEC-008](SPEC-008.md) (padrão de ingestão), [SPEC-010](SPEC-010.md) (ficha do ativo, onde os indicadores aparecem) |
| Requisitos | RF08; RNF04, RNF12, RNF13, RNF17, RNF18, RNF20 |
| Casos de uso | Buscar ativo → Consultar cotação (a ficha do ativo); P01 passos 1–2 |
| Drivers | OBJ02, FAS03, QA02, QA13, RES03, RES07 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA15](../adr/DA15-indicador-educacional.md), [DA23](../adr/DA23-classes-de-ativo-acoes-e-fiis.md) |

---

## 1. Objetivo

A ficha do ativo (SPEC-010) passa a mostrar os **indicadores fundamentalistas** do **Investidor10**, coletados pelo processador uma vez por semana:

- **Ações:** os indicadores de valuation (P/L, P/VP, EV/EBITDA…), eficiência (margens), rentabilidade (ROE, ROIC…), dividendos (dividend yield, payout), endividamento e crescimento, com o **histórico anual** (atual e os 5 anos anteriores).
- **FIIs:** dividend yield de 12 meses, P/VP, valor patrimonial por cota, patrimônio, número de cotistas, cotas emitidas, vacância, taxa de administração, tipo de fundo e segmento.

Todo número mostra **"Fonte: Investidor10"** e a data em que foi coletado, com a explicação do termo.

## 2. Valor

- **Usuário:** entende se um ativo está "caro" ou "barato" em relação ao lucro, ao patrimônio e aos dividendos, antes de simular (P01), com a explicação de cada indicador.
- **Projeto:** dezenas de indicadores prontos e com histórico, de uma fonte que autorizou o uso acadêmico, em vez de calcular cada um a partir dos balanços.
- **Custo zero** (RES03).

## 3. Escopo

### 3.1 Inclui

1. **Adaptador do Investidor10** (DA06): lê a página pública de cada ativo (`/acoes/{ticker}/` e `/fiis/{ticker}/`) e extrai a tabela de indicadores, o histórico anual e, nos FIIs, as informações do fundo.
2. **Tarefa semanal do processador**, devagar, com execução registrada.
3. **Seção "Indicadores"** na ficha do ativo: valores atuais, histórico anual (ações), data da coleta, fonte e explicação de cada termo.
4. **Interruptor da fonte** (`INVESTIDOR10_ENABLED`), para parar a coleta e esconder os dados quando a autorização acabar (§4.1).
5. A mesma visita à página guarda a **tabela de dividendos**, que a [SPEC-042](SPEC-042.md) usa.

### 3.2 Não inclui

- **Lista de proventos, eventos corporativos e ajuste do gráfico:** [SPEC-042](SPEC-042.md).
- **Gráfico dos indicadores**, filtros ("ações com P/L abaixo de 10") e comparação entre ativos: ficam para depois.
- Balanços completos, notícias, comunicados, carteiras recomendadas e qualquer conteúdo do Investidor10 que não sejam os indicadores e os dividendos.
- **Fonte permanente** depois da autorização (Dados Abertos da CVM ou brapi paga): Spec futura, atrás do mesmo adaptador (§4.3).

## 4. Decisões

### 4.1 Autorização do Investidor10 (04/11/2026)

A equipe do Investidor10 autorizou por escrito, por e-mail à Nicoly e ao Luís em 04/11/2026, o uso dos dados e indicadores **exclusivamente para fins educativos e de pesquisa**, com estas condições, que esta Spec segue:

| Condição | Como o app cumpre |
|---|---|
| Uso **só no projeto acadêmico atual** | Os dados aparecem só dentro do app; nenhuma rota pública, exportação ou repasse a terceiros |
| **Proibido** reproduzir, comercializar ou usar para fim lucrativo, cursos pagos ou plataformas externas | O projeto não tem fins lucrativos; os dados não saem do app (nem na exportação de dados da SPEC-034) |
| **"Fonte: Investidor10"** em toda tabela, gráfico ou dado | Todo número coletado mostra a fonte na tela |
| Válida **só durante o desenvolvimento e a apresentação** | `INVESTIDOR10_ENABLED=false` para a coleta e esconde os dados; o comando `npm run investidor10:apagar --workspace api` apaga o que foi coletado |

O e-mail original fica guardado pela equipe, fora do GitHub. Sem essa autorização, os termos de uso do Investidor10 proíbem baixar ou reproduzir o conteúdo (itens 8 e 9): **a coleta nunca roda sem o interruptor ligado**.

### 4.2 Conferido nas páginas do Investidor10 em 04/11/2026

| Página | O que tem |
|---|---|
| Ação (`/acoes/petr4/`) | Tabela de indicadores (`#table-indicators`) com uns 35 indicadores em 6 grupos: **Valuation** (P/L 4,55, P/VP 1,26, PSR, EV/EBITDA 3,54, EV/EBIT, P/EBITDA, P/EBIT, P/Ativo, P/Ativo circulante líquido, P/Capital de giro, LPA 10,35, VPA 37,31), **Eficiência** (margens bruta 50,60%, EBITDA, EBIT e líquida, giro dos ativos), **Rentabilidade** (ROE 27,73%, ROA, ROIC), **Dividendos** (dividend yield 7,14%, payout), **Endividamento** (liquidez corrente, dívida líquida/EBITDA, /EBIT e /patrimônio, dívida bruta/patrimônio, patrimônio/ativos, passivos/ativos) e **Crescimento** (CAGR de receitas e de lucros em 5 anos) |
| Histórico (`#table-indicators-history`) | Cada indicador em "Atual" e nos 5 anos anteriores (2021–2025) |
| FII (`/fiis/mxrf11/`) | Cartões (DY 12 meses 14,17%, P/VP 0,90, liquidez diária) e informações do fundo: razão social, CNPJ, público-alvo, mandato, segmento ("Híbrido"), tipo ("Fundo de papel"), prazo, gestão, taxa de administração ("0,90% a.a."), vacância, cotistas (1.570.590), cotas emitidas, valor patrimonial por cota (R$ 9,35, igual ao Informe Mensal da CVM) e valor patrimonial |
| Formato | Os números vêm como texto em português ("4,55", "50,60%", "R$ 5,30 Bilhões", "-" quando não há valor). Os dados estão no HTML da página; não há API pública |
| Dividendos | A mesma página tem a tabela completa (PETR4: 142 desde 2000; MXRF11: 126 desde 06/2016): usada pela SPEC-042 |

### 4.3 Aprovadas junto com a Spec (Nicoly, 04/11/2026)

| Tema | Proposta | Motivo |
|---|---|---|
| **Fonte** | **Investidor10**, só com `INVESTIDOR10_ENABLED=true` (padrão `false` no `.env.example`, ligado por quem tem a autorização). Endereço em `INVESTIDOR10_BASE_URL` (os testes apontam para um servidor falso) | §4.1; desligado por padrão, ninguém coleta sem saber da autorização |
| **Depois da autorização** | A fonte permanente fica para uma Spec futura, atrás do mesmo adaptador: **Dados Abertos da CVM** (licença aberta; conferido em 04/11/2026 que a DFP, a ITR e o Informe Mensal de FII trazem lucro, patrimônio, ações, valor patrimonial por cota etc.) ou a **brapi** paga | Trocar de fonte é trocar o adaptador (DA06) |
| **Quais ativos** | Os ativos **ativos** do catálogo, ações em `/acoes/{ticker}/` e FIIs em `/fiis/{ticker}/` (units em `/acoes/`). Página que não existe (404) vira "sem página no Investidor10", sem erro da execução | O catálogo da SPEC-040 tem uns 700 ativos |
| **Ritmo** | **Uma página a cada 3 segundos**, uma de cada vez, com um `User-Agent` que identifica o projeto. Coleta completa **uma vez por semana** (domingo às 03:00; uns 35 minutos) e, ao ligar o processador, só os ativos que nunca foram coletados | Não sobrecarregar o site de quem autorizou; os indicadores mudam pouco de uma semana para outra |
| **Indicadores guardados** | Todos os da tabela, pelo nome que o Investidor10 usa, num cadastro fixo no código (código, grupo, nome em português e inglês, unidade: múltiplo, %, reais ou texto, e a explicação). Indicador novo que aparecer na página é ignorado e registrado como aviso; indicador que sumir fica sem valor | Lista fechada: a tela sabe explicar cada um; mudança no site aparece no registro |
| **Histórico** | O valor atual e os anos do histórico (ações), guardados por ano. Cada coleta substitui a anterior do mesmo ativo | É o que a página mostra; o valor de um ano fechado quase não muda |
| Leitura dos números | "4,55" → 4.55; "50,60%" → 50.60 (%); "R$ 5,30 Bilhões" → 5300000000; "-" → sem valor. Tudo em decimal, pelo texto (RNF12). Número que não dá para ler vira erro com o ativo, e o resto da página segue | Os textos do site em português |
| **Mudança no site** | Se a página não tiver a tabela de indicadores (o site mudou), **nada daquele ativo é gravado** e a execução registra o erro; com mais da metade dos ativos assim, a execução para e termina como `falha` | Dado errado é pior que dado velho; não adianta visitar 700 páginas que mudaram |
| Falhas | As 3 novas tentativas da SPEC-008 por página; `429` ou `403` param a coleta (`parcial`) até a semana seguinte. A ficha continua com a última coleta, com a data (RNF13) | Respeitar o site; falha não apaga nada |
| **Texto na tela** | Seção "Indicadores", por grupo, com o valor, a explicação do termo (ao focar ou passar o mouse, também pelo teclado), "Fonte: Investidor10 · coletado em 02/11/2026" e o aviso fixo: "Indicadores do Investidor10, usados com autorização para este projeto acadêmico. Não são recomendação de compra ou venda." Ações: botão "Histórico" com a tabela dos anos | DA15; condição de atribuição (§4.1) |
| Interruptor desligado | A seção não aparece; a rota responde `source_disabled` | A autorização acabou (§4.1) |
| Onde fica | Módulo **Dados de Mercado**: adaptador em `infrastructure`; a leitura do HTML e dos números em `domain`, com páginas de exemplo nos testes. Leitor de HTML: dependência nova (`node-html-parser`, sem navegador) | Mesma separação das outras fontes |

## 5. Comportamento esperado

### 5.1 Tarefa do processador

| Tarefa | Quando | O que faz |
|---|---|---|
| `investidor10` | Domingo às 03:00; ao iniciar, só os nunca coletados. Nunca com o interruptor desligado | Visita a página de cada ativo ativo, uma a cada 3 segundos; grava os indicadores, o histórico, as informações do FII e a tabela de dividendos (SPEC-042) |

Situações: `sucesso`, `parcial` (algum ativo com erro, ou parada por `429`/`403`), `falha` (nenhum ativo lido, ou o site mudou para mais da metade).

### 5.2 Rotas

| Rota | Quem | Resposta |
|---|---|---|
| `GET /api/assets/:id/fundamentals` (nova) | Qualquer pessoa conectada | `{ source: 'investidor10', collectedAt, groups: [{ code, indicators: [{ code, value, unit }] }], history: [{ year, values }], fund: {...} \| null }`; valores em decimal (texto) ou `null`. Sem coleta: `collectedAt: null`. Interruptor desligado: 404 `source_disabled` |
| `GET /api/collaborator/assets` | Colaborador | A resposta ganha `fundamentalsCollection`: última coleta (horário e situação), ativos coletados, ativos sem página e se o interruptor está ligado |

Nenhuma rota devolve os indicadores em massa (§4.1).

### 5.3 Telas

| Situação | Tela |
|---|---|
| Ficha do ativo | Seção **"Indicadores"** abaixo do último pregão, por grupo (ações) ou com as informações do fundo (FIIs); fonte, data da coleta e aviso |
| Ação com histórico | "Histórico": tabela dos indicadores por ano (Atual, 2025, 2024…) |
| Sem coleta ainda / sem página | "Os indicadores deste ativo ainda não foram coletados" / "Este ativo não tem página no Investidor10" |
| Indicador sem valor | "—" |
| Tela do colaborador | Junto do contador: "Indicadores (Investidor10): última coleta em 02/11/2026 · 689 de 709 ativos"; avisos em âmbar para coleta com falha e para o interruptor desligado |
| Janela estreita (480px) | Os grupos em uma coluna; o histórico com rolagem horizontal só dentro da tabela |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `indicador_ativo` (nova) | `ativo_id`, `indicador`, `periodo` (`atual` ou o ano), `valor`, `coletado_em` | Chave (`ativo_id`, `indicador`, `periodo`); `indicador` em lista fechada (o cadastro do §4.3); `valor` decimal ou vazio |
| `informacao_fii` (nova) | `ativo_id`, `tipo_fundo`, `segmento`, `mandato`, `taxa_administracao` (texto), `vacancia`, `cotistas`, `cotas_emitidas`, `valor_patrimonial_cota`, `valor_patrimonial`, `coletado_em` | Chave `ativo_id`; números não negativos |
| `coleta_investidor10` (nova) | `ativo_id`, `situacao` (`ok`, `sem_pagina`, `erro`), `coletado_em` | Chave `ativo_id`: qual foi a última visita de cada ativo |
| `tarefa_ingestao` (muda) | Novo valor `investidor10` | — |

Nenhuma tabela guarda dado pessoal (DA13). A migração tem `down.sql` (RNF17), que apaga tudo o que foi coletado. Configuração nova: `INVESTIDOR10_ENABLED`, `INVESTIDOR10_BASE_URL`.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O leitor extrai os indicadores, o histórico e as informações do FII de páginas de exemplo (ação, unit, FII de papel e de tijolo); lê "4,55", "50,60%", "R$ 5,30 Bilhões" e "-" em decimal |
| CA02 | Página sem a tabela (site mudou) não grava nada do ativo e vira erro; mais da metade assim encerra como `falha` |
| CA03 | Uma página a cada 3 segundos, nunca duas ao mesmo tempo; `429`/`403` param a coleta; 404 vira "sem página" |
| CA04 | Interruptor desligado: nenhuma visita ao site, a ficha não mostra a seção e a rota responde `source_disabled`; o comando de apagar remove tudo o que foi coletado |
| CA05 | Rodar de novo substitui a coleta anterior do ativo, sem duplicar; a ficha mostra a data da coleta |
| CA06 | Ficha com os indicadores por grupo, a explicação de cada um, o histórico das ações, "Fonte: Investidor10", a data e o aviso; português e inglês, teclado e 480px (RNF04, RNF18, RNF20) |
| CA07 | Nenhum dado do Investidor10 sai do app: nenhuma rota em massa e nada na exportação de dados pessoais |
| CA08 | Tabelas com as restrições do §6; migração desfeita e refeita (RNF17) |
| CA09 | Testes automatizados do leitor e da tarefa, sem internet (páginas de exemplo montadas nos testes) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | ✅ Propostas do §4.3 aprovadas como escritas (Nicoly, 04/11/2026) |
| OPEN-28 | Parte de dados resolvida: Investidor10 autorizado para dados e indicadores neste projeto (§4.1). A parte de **notícias** (fonte pai da DA19, SPEC-027) não está coberta pelo texto da autorização: confirmar com eles antes da SPEC-027 |
| — | Fonte permanente depois da apresentação (CVM ou brapi paga): Spec futura |
| — | Data em que a autorização termina: a equipe desliga o interruptor depois da apresentação |

## 9. Verificação (05/11/2026)

**Ajustes da implementação** (o que a implementação mostrou que era diferente do §4):

| Tema | Ajuste |
|---|---|
| Histórico | O histórico vem de uma consulta à parte (`/api/historico-indicadores/{id}/10`), com **10 anos** (2016 em diante), não 5. Cada ação tem duas consultas (página e histórico); a coleta completa leva cerca de 1 hora |
| Página que não existe | O site responde **410** (além de 404): os dois viram "sem página" |
| Indicadores dos FIIs | Os números do FII (DY 12 meses, P/VP, valor patrimonial por cota, vacância, cotistas…) ficam em `indicador_ativo` com códigos `fii_*`; `informacao_fii` guarda só os textos (tipo, segmento, mandato, taxa de administração…) |
| Lista fechada | O cadastro dos 40 indicadores fica no código (pacote compartilhado); o banco confere só o formato do código |
| Situação da coleta | No **Início do colaborador** (rota `GET /api/collaborator/investidor10`), junto da série do CDI, em vez da tela Ativos |
| Formatos achados na coleta real | "Rend. Trib." vira rendimento; "Bonificação" na tabela de dividendos é pulada (é evento, vem da B3, SPEC-042); pagamento "Provisionado" fica sem data; "R$ -" é sem valor |
| Leitor de HTML | `node-html-parser` 9.0.5 (versão fixada, de 16 dias antes) |

| Critério | Resultado |
|---|---|
| CA01 | ✅ Leitor (`investidor10-page.test.ts`, com páginas montadas à mão na estrutura do site): ação, FII, números em português ("4,55", "50,60%", "R$ 5,30 Bilhões", "R$ 22,26 M", "1.570.590", "-", "R$ -"), histórico em decimal. Conferido antes nas páginas reais de PETR4, ITUB4, TAEE11, MXRF11 e HGLG11 |
| CA02 | ✅ Página sem a tabela não grava nada; com mais da metade assim (a partir de 10 visitas), a coleta para como `falha` |
| CA03 | ✅ Uma consulta a cada 3 s, uma por vez; 403/429 param a coleta; 404/410 viram "sem página"; rede e 5xx com as 3 novas tentativas (`investidor10-collection.test.ts`) |
| CA04 | ✅ Interruptor desligado: nenhuma visita, as rotas respondem `source_disabled` e a ficha não mostra as seções; `npm run investidor10:apagar` apaga tudo (PostgreSQL) |
| CA05 | ✅ Coletar de novo substitui o que o ativo tinha, numa transação (PostgreSQL) |
| CA06 | ✅ Rotas (`fundamentals-routes.test.ts`); ficha com os indicadores por grupo, a explicação de cada um, o histórico anual (tabela com rolagem própria), "Fonte: Investidor10", a data e o aviso, em português e inglês. ⏳ Conferir na tela do Electron |
| CA07 | ✅ Nenhuma rota em massa; nada na exportação de dados pessoais |
| CA08 | ✅ Migração `20261104140000_indicadores_proventos` sem diferença para o esquema, desfeita e refeita; o banco recusa período e código fora do formato |
| CA09 | ✅ Nenhum teste acessa a internet |
| **De verdade** | ✅ Primeira coleta (04 e 05/11/2026): **687 ativos com dados, 23 sem página no Investidor10**, 113.539 valores de indicadores. PETR4: P/L 4,55, LPA 10,35 (2025: 8,5446, igual ao balanço da CVM), histórico desde 2016; MXRF11: valor patrimonial de R$ 9,35 por cota, igual ao Informe Mensal da CVM |

Total: **753 testes** passando (com o banco real), lint, tipos e formatação.
