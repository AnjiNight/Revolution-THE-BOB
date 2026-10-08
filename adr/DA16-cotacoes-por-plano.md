# DA16 — Atualização de cotações conforme o plano

| Campo | Valor |
|---|---|
| Status | Aceita, com pontos em aberto — **trechos de renda fixa adiados por [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md)**; FIIs seguem as mesmas regras das ações (02/10/2026) |
| Data | 01/10/2026 |
| Drivers | OBJ06, FAS03, FAS08, QA02, QA04, PA03, RES03, RES07 |
| Substitui | Premissa PRE01 ("cotações diárias de fechamento são suficientes") |
| Altera | [DA07](DA07-ingestao-assincrona.md) (frequência da ingestão de cotações) |
| Relacionadas | [DA06](DA06-adaptadores-fontes-externas.md), [DA12](DA12-autorizacao-planos-no-servidor.md), [DA17](DA17-carteira-ao-vivo-e-historica.md) |

## Contexto

A equipe decidiu exibir as cotações das ações **durante o pregão**, e não apenas o fechamento: no plano gratuito com o atraso do provedor gratuito; nos planos pagos, com um provedor pago, mais próximo do tempo real.

Limites conhecidos dos provedores (consultados em 01/10/2026):

| Plano da brapi | Atraso | Requisições/mês | Tickers por chamada | Histórico |
|---|---|---|---|---|
| Gratuito | ~30 min | 15.000 | 1 | 3 meses |
| Startup (pago) | ~15 min | 150.000 | 10 | — |
| Pro (pago) | ~5 min | 500.000 | 20 | — |

Tempo real **verdadeiro** de dados da B3 é licenciado e tem custo muito acima do orçamento do projeto. Mesmo os planos pagos da brapi entregam **quase tempo real** (5 a 15 min).

A renda fixa não tem cotação durante o dia:

- **CDB, LCI e LCA** não têm preço de mercado público: o valor é a taxa contratada aplicada ao indexador, e muda **uma vez por dia útil**;
- **CDI e Selic** são diários; **IPCA** é mensal (API SGS do Banco Central);
- **Tesouro Direto** tem preços publicados algumas vezes ao dia, sem API oficial estável em tempo real; o dado confiável é o arquivo diário do Tesouro Transparente.

## Alternativas consideradas

1. **Apenas fechamento diário** (PRE01 original) — simples, mas não atende à decisão da equipe.
2. **Mesmo atraso para todos** (provedor gratuito, ~30 min).
3. **Frequência diferenciada por plano**: gratuito com ~30 min; assinante com provedor pago.
4. **Tempo real licenciado da B3** — custo incompatível com RES03.

## Decisão

Alternativa 3.

| | Usuário (gratuito) | Assinante |
|---|---|---|
| Ações | Atualização a cada ~30 min | Atualização mais frequente via provedor pago (5–15 min, conforme o plano contratado) |
| Renda fixa | Atualização diária | Atualização diária |
| Texto na interface | "Cotação das hh:mm (atraso de até 30 min)" | "Cotação das hh:mm" |

Regras:

- A interface **nunca** usa a expressão "tempo real"; sempre mostra o horário da cotação.
- A coleta é **centralizada**: uma coleta por nível de atualização, nunca por usuário (PA03). A tarefa de cotações durante o pregão roda apenas em horário de pregão e apenas para ativos do catálogo.
- Toda cotação guarda **data, hora, fonte e nível** (gratuito ou assinante).
- O servidor entrega a cada usuário apenas cotações compatíveis com o plano dele (DA12).
- Na carteira ao vivo ([DA17](DA17-carteira-ao-vivo-e-historica.md)), a compra usa a **última cotação disponível para o plano do usuário**; o lançamento registra o preço, o horário da cotação e o nível.
- O cliente consulta o servidor periodicamente enquanto a tela está aberta, no mesmo intervalo do nível do usuário. Não há envio ativo (push) no MVP.

**Capacidade do plano gratuito (estimativa):** 15.000 requisições ÷ ~21 pregões ≈ 700 por dia; com 1 ticker por chamada e ~14 atualizações por pregão, comporta **cerca de 40 a 50 ativos**, sem margem para outras chamadas. O catálogo de ativos (RF39) precisa ser curado.

## Consequências

- (+) Atende à decisão sem custo para o plano gratuito.
- (+) Trocar ou adicionar provedor continua sendo trocar um adaptador (DA06).
- (−) Dois usuários comprando o mesmo ativo no mesmo instante podem obter **preços diferentes** conforme o plano. Isso precisa virar regra de negócio explícita.
- (−) A ingestão deixa de ser só diária: o cache das carteiras (DA08) é invalidado várias vezes ao dia e o registro de execuções (DA14) cresce mais rápido.
- (−) O provedor do plano assinante tem **custo real recorrente**, enquanto o pagamento da assinatura é **simulado** (RF32) e o orçamento é zero (RES03).

## Pontos em aberto

1. **Quem paga o provedor do plano assinante?** Sugestão para a entrega acadêmica: implementar o adaptador do provedor pago e configurá-lo com a chave gratuita. Isso demonstra a arquitetura sem custo, e o plano só é contratado se houver orçamento.
2. Verificar se os termos da brapi permitem **redistribuir** as cotações para usuários de outro aplicativo.
3. **Compra com a bolsa fechada:** usa o último fechamento ou vira uma ordem executada na abertura do próximo pregão?
4. Tratamento dos leilões de abertura e fechamento e dos horários especiais de pregão.

## Impacto nos outros documentos

- **Drivers:** PRE01 revogada.
- **Requisitos:** RF09 passa a incluir cotações durante o pregão; RF33 inclui "cotações com menor atraso" entre os recursos premium; nova regra de negócio sobre preço por plano; RB07 reescrita (ver DA17).
- **Modelo de domínio:** COTACAO passa a ter data e hora, fonte e nível.
