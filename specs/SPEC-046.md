# SPEC-046 — Último fechamento na lista de ativos

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 21/11/2026, a pedido da Nicoly ("está sem o valor" na lista de Ativos; "Sim, escreva a mudança"); aprovada por ela no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9) |
| Fase | 2 — Dados de mercado ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should |
| Depende de | [SPEC-008](SPEC-008.md) (fechamentos da B3), [SPEC-009](SPEC-009.md) e [SPEC-040](SPEC-040.md) (cotação do pregão e a lista), [SPEC-010](SPEC-010.md) (a ficha já usa "a mais recente") |
| Muda | O servidor (a lista e o catálogo trazem o último fechamento de cada ativo), o pacote `shared` (campo `lastClose` no ativo), o app (a coluna "Último preço" da busca do usuário e do catálogo do colaborador) e a SPEC-009 (§ da lista) |
| Requisitos | RF07 (consultar ativos e cotações); RNF04, RNF12, RNF18, RNF20 |
| ADRs | [DA16](../adr/DA16-cotacoes-por-plano.md) (cotação do nível gratuito, nunca "tempo real"), [DA18](../adr/DA18-historico-cotacoes-arquivos-b3.md) (histórico pelos arquivos da B3) |

---

## 1. Objetivo

Na lista de **Ativos** (a busca do usuário e o catálogo do colaborador), a coluna **Último preço** mostra o **último fechamento da B3** quando não há cotação do pregão mais nova. Hoje ela só mostra a cotação do pregão (brapi), e fica "Sem cotação ainda" nos fins de semana, antes da primeira coleta do dia, numa instalação nova ou quando a coleta para, mesmo com anos de fechamentos no banco.

## 2. Valor

- **Usuário:** vê um preço em todos os ativos com histórico, com a data dele, e não uma coluna vazia.
- **Colaborador:** confere no catálogo, de relance, até quando vai o histórico de cada ativo.
- **Coerência:** a lista passa a seguir a regra que a ficha já usa ([SPEC-010](SPEC-010.md)): "a do pregão ou o fechamento da B3, a mais recente".

## 3. Escopo

### 3.1 Inclui

1. O **último fechamento** de cada ativo (dia, preço e a variação sobre o fechamento anterior) nas respostas da busca e do catálogo.
2. A coluna **Último preço** escolhe o mais recente entre a cotação do pregão e o fechamento, com o rótulo de onde veio.
3. Textos em português e inglês.

### 3.2 Não inclui

- **O preço usado na compra e na venda** e o valor das posições: seguem as regras das SPECs 014, 016 e 019 (RB07).
- **Ordenar ou filtrar pelo preço.**
- **O ajuste por proventos e eventos** (SPEC-042): o fechamento aparece como a B3 publicou, como na lista do pregão.
- **Mudar a coleta do pregão** (horários, cota, retenção de 30 dias).

## 4. Decisões

### 4.1 Aprovadas pela Nicoly em 21/11/2026 (as recomendações)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Qual preço mostrar** | **O mais recente** entre a cotação do pregão e o último fechamento. Empate de dia (o fechamento de hoje já entrou e há cotação de hoje): o **fechamento**, que é o valor final do pregão | É a regra da ficha (SPEC-010). A cotação do pregão de 3 dias atrás é mais velha que o fechamento de ontem, e mostrá-la confundiria |
| 2 | **Como aparece** | A cotação do pregão continua como hoje ("Cotação das 14:30 (atraso de até 45 min)"). O fechamento aparece com **"Fechamento de 20/11/2026 (B3)"** embaixo do preço e a variação sobre o fechamento anterior. Sem nenhum dos dois: "Sem cotação ainda", como hoje | Quem lê sabe de quando é o preço e de onde veio; nunca parece tempo real (DA16) |
| 3 | **Formato na API** | Um campo novo no ativo, **`lastClose`** (`{ date, price, change }` ou `null`), ao lado do `quote`, que não muda. O app escolhe qual mostrar pela regra da decisão 1 | O `quote` continua sendo só a cotação do nível gratuito (DA16), e as telas e os testes que já o usam não mudam. A ficha poderá usar o mesmo campo depois |
| 4 | **Custo da consulta** | Uma consulta só para todos os ativos, como a da cotação do pregão (`latestQuotes`): os dois últimos fechamentos de cada ativo, pela chave primária (`ativo_id`, `data`) do `cotacao_diaria`, que já é um índice (uma leitura curta por ativo, `LATERAL ... LIMIT 2`). Sem tabela nova | A busca devolve até 50 ativos por vez e o catálogo até 100, mas lê o catálogo inteiro (hoje, uns 700 ativos) para filtrar e ordenar, como já faz com as cotações; duas linhas por ativo pelo índice ficam em dezenas de milissegundos, e a resposta já tem ETag (SPEC-032). Uma tabela de "último preço" teria de ser mantida a cada carga |

### 4.2 Aprovadas junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Variação** | Do último fechamento sobre o fechamento anterior guardado, com 2 casas, como a do pregão. Sem fechamento anterior: sem variação | A mesma leitura da cotação do pregão |
| **Ativo desativado (catálogo do colaborador)** | Mostra o último fechamento que tiver, como os outros | O colaborador vê até quando o ativo negociou |
| **Modo sem conexão (SPEC-032)** | Nada muda: a resposta da lista, com o `lastClose`, já vai para a cópia local | — |
| **Aviso da lista** | O texto abaixo da busca passa a dizer que o preço é a cotação do pregão (brapi, com atraso) ou o último fechamento da B3, o mais recente | Explica as duas origens de uma vez |
| **Rótulos** | "Fechamento de {data} (B3)" / "Close on {date} (B3)"; a data no formato do idioma | RNF20 |

### 4.3 Exemplos

| Situação | Último preço |
|---|---|
| Sábado, instalação nova, fechamentos até sexta (20/11) | "R$ 37,12 · +0,85% · Fechamento de 20/11/2026 (B3)" |
| Segunda, 14:30, cotação coletada às 14:30; fechamento mais recente, de sexta | "R$ 37,40 · +0,75% · Cotação das 14:30 (atraso de até 45 min)" |
| Terça, 09:00, fechamento de segunda já carregado; última cotação do pregão de segunda, 18:30 | O fechamento de segunda (empate de dia: vale o fechamento) |
| Ativo recém-cadastrado, sem histórico nem cotação | "Sem cotação ainda" |
| Calendário de 2026 não publicado | O último fechamento é de 30/12/2025: "Fechamento de 30/12/2025 (B3)". O preço aparece, e a data mostra que o histórico parou |

## 5. Comportamento esperado

### 5.1 API

| Rota | Mudança |
|---|---|
| `GET /api/assets` (busca) e a lista do catálogo do colaborador | Cada ativo ganha `lastClose`: `{ date: "AAAA-MM-DD", price: "37.12", change: "0.85" \| null }` ou `null`. Preço e variação em texto decimal (RNF12) |
| `GET /api/assets/:id` | Ganha o mesmo `lastClose` (a ficha continua usando o `lastSession` da SPEC-010 nesta Spec) |

### 5.2 Telas

| Situação | Tela |
|---|---|
| Lista com cotação do pregão mais nova | Como hoje |
| Lista com fechamento mais novo, ou sem cotação | O preço do fechamento, a variação e "Fechamento de {data} (B3)" |
| 480 px | O mesmo texto na linha estreita, sem passar da largura |

Em português e inglês, pelo teclado e com contraste; a direção da variação também em texto, não só em cor (RNF04, RNF18, RNF20).

## 6. Modelo de dados

Nenhuma mudança: a leitura usa a chave primária do `cotacao_diaria`.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A busca e o catálogo trazem `lastClose` de cada ativo com histórico (o último fechamento, o dia e a variação sobre o anterior) e `null` sem histórico, com uma consulta só para todos os ativos; o fechamento provisório da brapi não conta |
| CA02 | A coluna mostra o mais recente entre a cotação do pregão e o fechamento; no empate de dia, o fechamento; sem os dois, "Sem cotação ainda" |
| CA03 | O fechamento aparece com "Fechamento de {data} (B3)" e a variação; a cotação do pregão continua com o horário e o atraso |
| CA04 | Os testes do servidor cobrem a escolha dos dois últimos fechamentos, o ativo sem histórico e o sem fechamento anterior; os do app cobrem a regra da decisão 1 |
| CA05 | Roteiro E2E com a lista mostrando os dois casos; em inglês e a 480 px |
| CA06 | A SPEC-009 e o mapa atualizados |

## 8. Pontos em aberto

| Tema | Situação |
|---|---|
| A ficha | Pode passar a usar o `lastClose` no lugar do `lastSession`; fica para depois, sem pressa |
| Carteiras | O valor das posições segue as SPECs 014, 016 e 019 |

## 9. Implementação (21/11/2026)

| Parte | O que mudou |
|---|---|
| `shared` | Tipo `AssetClose` (`date`, `price`, `change`), campo `lastClose` no `Asset` e a função `latestPrice(quote, lastClose)` com a regra da decisão 1 (o dia da cotação em Brasília; no empate, o fechamento), com testes |
| Servidor | `AssetPriceReader.lastCloses()` no `prisma-quote-repository`: uma consulta `CROSS JOIN LATERAL` com os dois últimos fechamentos `b3_cotahist` de cada ativo; a variação sai do `percentChange` (2 casas). A busca e o catálogo leem todos de uma vez, como o `latestQuotes`; a ficha usa os dois últimos pregões que já lia (`lastSession`). Testes de rota (busca, catálogo e ficha) e de banco (`prisma-quote.db.test.ts`) |
| App | `QuoteText` recebe o `lastClose` e mostra o preço escolhido por `latestPrice`; o fechamento com "Fechamento de {data} (B3)". O aviso abaixo da busca fala das duas origens. `AssetSearch` e `AssetCatalog` passam o campo |
| Validação | Roteiro `tests/e2e/last-close.e2e.ts` (PETR4 com o fechamento, VALE3 com a cotação do pregão; inglês; 375 px sem rolagem de lado); o mock ganhou o `lastClose` e o VALE3. Os 1.219 testes (com o banco `simulador_test`) e os 25 roteiros E2E passaram |
