# SPEC-048 — Ibovespa e dólar do dia (Yahoo Finance)

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 21/11/2026, a pedido da Nicoly ("pode implementar apenas a yahoo"); aprovada por ela no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9) |
| Fase | 5 — Acompanhamento da carteira ([mapa de specs](mapa_specs.md)) |
| Prioridade | Could (proposta) |
| Depende de | [SPEC-005](SPEC-005.md) (calendário de pregão), [SPEC-009](SPEC-009.md) (padrão da coleta do pregão), [SPEC-011](SPEC-011.md) (tarefas), [SPEC-020](SPEC-020.md) (Ibovespa diário da B3) |
| Muda | O processador (tarefa nova), o banco (tabela `cotacao_mercado`), o servidor (rota do painel), o app (painel "Mercado hoje" no Início do usuário e na tela Tarefas do colaborador) e o mapa |
| Requisitos | RF07; RNF04, RNF12, RNF13, RNF17, RNF18, RNF20 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA16](../adr/DA16-cotacoes-por-plano.md) (cotação com atraso, nunca "tempo real") |
| Fonte | Yahoo Finance (`query1.finance.yahoo.com/v8/finance/chart`). Uso autorizado para este projeto, conforme informado pela equipe em 21/11/2026 |

---

## 1. Objetivo

O Início do usuário ganha o painel **Mercado hoje**, com o **Ibovespa** e o **dólar (US$ em R$)** do dia: o valor, a variação sobre o fechamento anterior e o horário, sempre com o aviso de atraso. Os dados vêm da Yahoo Finance, coletados pelo processador.

## 2. Valor

- **Usuário:** vê como o mercado está hoje antes de abrir a carteira. Hoje o Ibovespa só aparece com o fechamento da B3 do dia anterior (SPEC-020), e o dólar não aparece em lugar nenhum.
- **Colaborador:** acompanha a coleta na tela Tarefas, como as outras.

## 3. Escopo

### 3.1 Inclui

1. **Tarefa "Mercado do dia (Yahoo)"** no processador: Ibovespa (`^BVSP`) e dólar (`BRL=X`).
2. **Tabela** com a última leitura de cada um, guardada por 30 dias, como as cotações do pregão.
3. **Painel Mercado hoje** no Início do usuário (também na Visão do usuário do colaborador, SPEC-045).
4. A tarefa na tela **Tarefas** do colaborador (SPEC-011), com "Executar agora".

### 3.2 Não inclui

- **Cotação das ações pela Yahoo:** a brapi já traz todas numa consulta só; pela Yahoo seria uma consulta por ativo (uns 700 a cada coleta), e a consulta de vários de uma vez pede autenticação (testado em 21/11/2026: 401).
- **IFIX:** a Yahoo não tem (testado: "No data found").
- **Histórico pela Yahoo:** o histórico continua dos arquivos da B3 (SPEC-008), e o ajuste por eventos, da SPEC-042.
- **Usar o dólar ou o Ibovespa do dia nas contas** (rentabilidade e comparação com benchmarks): continuam com os fechamentos (SPECs 019 e 020).

## 4. Decisões

### 4.1 Recomendações para aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que coletar** | **`^BVSP`** (Ibovespa, pontos) e **`BRL=X`** (dólar em reais), pela rota de gráfico (`/v8/finance/chart/{símbolo}?range=1d&interval=5m`): o último valor (`regularMarketPrice`), o fechamento anterior (`chartPreviousClose`) e o horário (`regularMarketTime`) | É o que a Yahoo acrescenta ao que o app já tem; duas consultas por coleta |
| 2 | **Quando coletar** | **Ibovespa:** a cada **15 minutos**, em dia de pregão (SPEC-005), das 10:00 até 30 minutos depois do fechamento. **Dólar:** a cada **30 minutos**, de segunda a sexta, das 09:00 às 18:30 (Brasília). Fora disso, nada; o painel mostra a última leitura | Frequências diferentes para mercados diferentes, sem consulta desnecessária |
| 3 | **Atraso e "tempo real"** | O painel diz sempre o horário da leitura e "atraso de até 20 min"; nunca "tempo real". Leitura de um dia anterior: "Último valor: 19/11, 18:11" | A Yahoo publica a B3 com atraso (DA16) |
| 4 | **Falha da Yahoo** | Fica a última leitura válida, com "Pode estar desatualizado: a última leitura é de 19/11, 18:11" quando a coleta falhar ou passar de 2 horas sem leitura no horário do mercado; a execução fica registrada como falha na tela Tarefas | O app continua funcionando quando a fonte cai |
| 5 | **Onde fica** | No **Início do usuário**, abaixo das boas-vindas: dois cartões (Ibovespa e Dólar), com valor, variação (com sinal e ícone, não só cor) e horário, e "Fonte: Yahoo Finance" | É onde o usuário chega; não precisa de tela nova |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Variação** | Do último valor sobre o fechamento anterior da própria Yahoo, com 2 casas | Mesma conta da cotação do pregão |
| **Guardar** | `cotacao_mercado`: símbolo, valor, fechamento anterior, horário da leitura, coletada em. Uma linha por leitura; o processador apaga as de mais de 30 dias (junto da limpeza das cotações do pregão) | Igual à SPEC-009 |
| **Rota** | `GET /api/market/today` (qualquer pessoa conectada): `ibovespa` e `dollar`, cada um com `value`, `previousClose`, `change`, `at`, `stale` (desatualizado) ou `null` sem leitura | — |
| **Formato** | Ibovespa em pontos sem casas ("166.376 pts"); dólar com 4 casas ("R$ 5,9074") | Como o mercado mostra |
| **Pedido à Yahoo** | Com um `User-Agent` próprio do app, tempo-limite de 15 s e, em erro, nova tentativa só na próxima coleta | Respeita a fonte |
| **Modo sem conexão (SPEC-032)** | A rota entra na cópia local, como as outras leituras | — |

### 4.3 Exemplos

| Situação | Painel |
|---|---|
| Segunda, 14:20 | "Ibovespa 166.376 pts −0,69% · 14:20 (atraso de até 20 min)"; "Dólar R$ 5,9074 +0,04% · 14:00" |
| Sábado | O último valor de sexta, com a data e a hora; sem o aviso de desatualizado (o mercado está fechado) |
| A Yahoo fora do ar desde 11:00, agora 14:00 | O valor das 10:45, com "Pode estar desatualizado"; a tela Tarefas mostra a falha |
| Instalação nova, antes da primeira coleta | "Ainda sem leitura do mercado de hoje" |

## 5. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A tarefa coleta `^BVSP` e `BRL=X` nas frequências e horários da decisão 2, registra cada execução (SPEC-011) e aparece na tela Tarefas com "Executar agora" |
| CA02 | `GET /api/market/today` devolve o último valor, o fechamento anterior, a variação, o horário e `stale`; 401 sem sessão |
| CA03 | O painel Mercado hoje mostra os dois, com o horário, o atraso e "Fonte: Yahoo Finance"; nunca "tempo real"; a variação com sinal e ícone |
| CA04 | Com a Yahoo fora do ar, o painel mantém a última leitura com o aviso de desatualizado, e o resto do app funciona |
| CA05 | Leituras com mais de 30 dias são apagadas |
| CA06 | Testes do adaptador (resposta real gravada, erro e símbolo sem dados), da tarefa (horários e calendário), da rota e E2E do painel; em português e inglês e a 480 px |
| CA07 | Migração com `down.sql` e `npm run db:check` sem diferença; mapa atualizado; e a coleta real testada (valor e horário conferidos com a Yahoo) |

## 9. Implementação (21/11/2026)

| Parte | O que mudou |
|---|---|
| Fonte | `YahooChartSource` (`market-data/infrastructure/yahoo-chart-source.ts`): `^BVSP` e `BRL=X` pela rota de gráfico, com `User-Agent` próprio e tempo-limite de 15 s; lê só o resumo (`regularMarketPrice`, `chartPreviousClose`, `regularMarketTime`) e arredonda para 6 casas. 404 é "sem dados"; rede fora e 5xx, "fora do ar" |
| Horários | `domain/market-hours.ts`: o Ibovespa a cada 15 minutos das 10:00 até 30 minutos depois do fechamento (o mesmo fechamento da SPEC-009), o dólar a cada 30 minutos das 09:00 às 18:30. O processador confere a cada 5 minutos; quem chegou na vez é coletado, e uma coleta que falhou só tenta de novo na vez seguinte |
| Calendário | Em ano sem calendário publicado, o Ibovespa usa os dias úteis (o painel não para à espera da publicação); com o calendário, os feriados ficam de fora. Ajuste sobre a decisão 2, que só falava do calendário |
| Tarefa | `mercado_yahoo` ("Mercado do dia (Yahoo)") na tela Tarefas, com "Executar agora" (os dois, a qualquer hora); cada execução grava os dois resultados (sucesso, parcial ou falha, com o erro de cada um) |
| Banco | Migração `20261121150000_mercado_hoje`: valor `mercado_yahoo` em `tarefa_ingestao`, tipo `simbolo_mercado` e tabela `cotacao_mercado` (chave símbolo + horário da leitura; valores positivos). A mesma leitura de novo só renova `coletada_em`. Limpeza diária das leituras de mais de 30 dias |
| Desatualizado | No horário do mercado (passados 10 minutos da primeira coleta), quando a última coleta que deu certo tem mais que o intervalo + 10 minutos (uma coleta falhou ou o processador parou) ou a leitura tem mais de 2 horas. Com o mercado fechado, nunca |
| Servidor | `GET /api/market/today` para qualquer pessoa conectada (401 sem sessão) |
| App | Painel "Mercado hoje" no Início do usuário (e na Visão do usuário), abaixo das boas-vindas: dois cartões com o valor ("166.376 pts", "R$ 5,9074"), a variação com sinal e seta, o horário com "atraso de até 20 min" (ou "Último valor: 19/11, 18:20"), o aviso de desatualizado e "Fonte: Yahoo Finance (valores com atraso)". A leitura entra na cópia local (SPEC-032). Em pt-BR e inglês |
| Validação | 1.251 testes (com o banco `simulador_test`; 20 novos, com as respostas reais gravadas da Yahoo) e 32 roteiros E2E (4 novos em `tests/e2e/market-today.e2e.ts`, a 480 px e em inglês). Coleta real em 21/11/2026 (sábado): Ibovespa 166.376,44 pts (−0,69%, leitura de 19/11 às 18:20; 20/11 foi feriado) e dólar R$ 5,9074 (+0,04%, 21/11 às 07:58), iguais ao que a Yahoo mostra |
