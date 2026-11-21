# DA08 — Cache em dois níveis e offline somente leitura

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | FAS06, QA03, QA04, PA05, RF36, RF37, RNF14, RNF19 |
| Relacionadas | [DA01](DA01-cliente-servidor-monolito-modular.md), [DA09](DA09-lancamentos-imutaveis.md) |

## Contexto

O painel deve abrir em menos de 2 s (QA04) mesmo com posição sempre derivada do histórico (PA05), e o app deve funcionar sem conexão (QA03).

## Alternativas consideradas

1. **Sem cache** — sempre recalcular e sempre exigir conexão; não atende QA03 nem QA04.
2. **Edição offline com sincronização posterior** (RF37) — exige revalidar RB05/RB06 no servidor e tratar lançamentos rejeitados após o fato.
3. **Cache em dois níveis, offline somente leitura.**

## Decisão

Alternativa 3.

1. **Cache no servidor** (em memória): cotações recentes e resultados de cálculo por carteira. É invalidado quando entra uma nova transação na carteira ou uma nova cotação de um ativo dela.
2. **Cache local no cliente**: últimas carteiras, posições, séries de preço e notícias consultadas. Sincronização **incremental**: o cliente pede ao servidor apenas o que mudou desde a última sincronização (RNF19).
3. **Offline é somente leitura** no MVP. Sem conexão, as ações de escrita ficam desabilitadas e a interface indica "modo offline — dados de dd/mm hh:mm".

A alternativa 2 fica como evolução: uma fila local de comandos pendentes, reenviados e validados pelo servidor ao reconectar.

> **Atualização ([SPEC-032](../specs/SPEC-032.md), 16/11/2026):** o cache local guarda **o que foi aberto neste computador** (carteiras, caixa e extrato, posições, rentabilidade, comparação, ficha, gráfico, indicadores, proventos, logos e perfil), em arquivos **cifrados pelo cofre do SO**, no processo principal; sem cofre, só na memória. A sincronização incremental é **por resposta, com ETag**: o servidor manda a impressão digital do corpo de cada leitura, e o app pergunta "mudou?" com ela; se não mudou, a resposta é 304 sem corpo. O modo consulta abre com o servidor inalcançável (sem rede, tempo esgotado, 502, 503 ou 504), só para a conta de usuário e só se a sessão foi renovada há menos de 30 dias (a validade do token de renovação). A cópia é apagada no logout, na sessão recusada, na exclusão da conta e quando outra pessoa entra. O RF37 foi reescrito (requisitos 1.13): não há lançamento pendente; a fila continua como evolução.

## Consequências

- (+) Atende QA03 e QA04 sem abrir mão do servidor como fonte da verdade.
- (−) Dados locais contêm informação do usuário: precisam ser apagados no logout e na exclusão de conta (QA07).
- (−) Com cotações durante o pregão ([DA16](DA16-cotacoes-por-plano.md)), o cache de carteira é invalidado várias vezes ao dia; o cálculo continua dentro de QA04 para até 50 ativos, mas deve ser medido.
