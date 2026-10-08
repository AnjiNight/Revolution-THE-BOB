# DA18 — Histórico de cotações a partir dos arquivos da B3

| Campo | Valor |
|---|---|
| Status | Proposta — **fontes do Tesouro Direto e de Selic/IPCA adiadas por [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md)** (02/10/2026) |
| Data | 01/10/2026 |
| Drivers | QA04, QA08, RES03, RES07, PRE03 |
| Relacionadas | [DA06](DA06-adaptadores-fontes-externas.md), [DA07](DA07-ingestao-assincrona.md), [DA17](DA17-carteira-ao-vivo-e-historica.md), [DA20](DA20-modelo-ia-noticias.md) |

## Contexto

O plano gratuito da brapi oferece apenas **3 meses** de histórico. A carteira histórica ([DA17](DA17-carteira-ao-vivo-e-historica.md)) e o aperfeiçoamento do modelo de IA ([DA20](DA20-modelo-ia-noticias.md)) precisam de **anos** de cotações.

## Alternativas consideradas

1. **Plano pago da brapi** — mais histórico, mas tem custo (RES03).
2. **Fontes não oficiais** (bibliotecas que leem sites de cotações) — sem garantia de disponibilidade e com termos de uso incertos.
3. **Arquivos de séries históricas da B3 (COTAHIST)** — públicos, gratuitos, com o fechamento diário de todos os papéis por muitos anos.

## Decisão

Alternativa 3 para o **histórico diário**, combinada com a brapi para as **cotações do dia** ([DA16](DA16-cotacoes-por-plano.md)). As duas fontes ficam atrás de adaptadores (DA06).

Para os outros dados históricos:

| Dado | Fonte |
|---|---|
| CDI e Selic (diários), IPCA (mensal) | API SGS do Banco Central |
| Preços e taxas do Tesouro Direto | Arquivos históricos do Tesouro Transparente |

Quando as duas fontes têm o fechamento do mesmo dia, **prevalece o arquivo oficial da B3**.

## Consequências

- (+) Anos de histórico sem custo.
- (−) Arquivos grandes, em formato de texto posicional; exigem um importador próprio.
- (−) Os preços **não são ajustados** por proventos e eventos corporativos; é preciso uma fonte adicional para esses eventos.
- (−) O mesmo dado vem de duas fontes, o que exige a regra de precedência acima.

## Pontos em aberto

1. Fonte de proventos (dividendos, JCP) e de eventos (desdobramentos, grupamentos, bonificações).
2. Tamanho da janela histórica carregada; alinhar com a janela de treino da IA (DA20).
3. Fonte da série histórica do Ibovespa para o benchmark (RF16).
