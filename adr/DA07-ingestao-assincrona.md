# DA07 — Ingestão assíncrona, agendada e centralizada

| Campo | Valor |
|---|---|
| Status | Aceita — **frequência das cotações alterada por [DA16](DA16-cotacoes-por-plano.md)** e **histórico por [DA18](DA18-historico-cotacoes-arquivos-b3.md)** (01/10/2026); **tarefas de Selic, IPCA, Tesouro Direto e feriados bancários adiadas por [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md)** (02/10/2026) |
| Data | 24/09/2026 |
| Drivers | FAS03, FAS04, QA02, QA04, PA03, PA04 |
| Relacionadas | [DA06](DA06-adaptadores-fontes-externas.md), [DA14](DA14-registro-execucoes-logs.md) |

## Contexto

Buscar dados externos a cada tela aberta seria lento (QA04), multiplicaria as chamadas às APIs (PA03) e tornaria o app dependente delas (QA02). A coleta de notícias e a classificação de sentimento são lentas e incertas (FAS04).

## Alternativas consideradas

1. **Busca sob demanda** a cada tela aberta — dado sempre fresco, mas lento, caro em requisições e dependente das APIs.
2. **Ingestão assíncrona e agendada**, em processo separado do atendimento de requisições.

## Decisão

Alternativa 2. Um **processador de tarefas** separado do atendimento de requisições executa, de forma agendada:

| Tarefa | Frequência |
|---|---|
| Cotações durante o pregão (por nível de plano) | A cada ~30 min (gratuito) ou menor (assinante) — [DA16](DA16-cotacoes-por-plano.md) |
| Fechamento do dia | Após o fechamento do pregão |
| Carga retroativa (backfill) de ativo novo | Sob demanda, quando o ativo é cadastrado — a partir dos arquivos da B3 ([DA18](DA18-historico-cotacoes-arquivos-b3.md)) |
| Taxas de indexadores | Diária (CDI, Selic); mensal (IPCA) |
| Preços e taxas do Tesouro Direto | Diária |
| Calendário de pregão | Anual, com revisão manual |
| Coleta de notícias | Algumas vezes ao dia, por fonte ([DA19](DA19-fontes-de-noticias.md)) |
| Classificação das notícias | Logo após cada coleta ([DA20](DA20-modelo-ia-noticias.md)) |

> A versão de 24/09/2026 previa apenas "cotações do dia, após o fechamento do pregão". A linha de cotações durante o pregão foi incluída em 01/10/2026 por DA16.

Regras da ingestão:

- **Idempotente**: executar duas vezes não duplica dados (índices únicos em ativo + data/hora).
- **Tentativas com espera crescente** quando a fonte falha.
- **Falha parcial não interrompe o todo**: ativos com erro são registrados e o restante segue.
- Cada execução é registrada (DA14).

## Consequências

- (+) Telas leem apenas o banco/cache, portanto são rápidas e independentes das APIs.
- (+) Uma única coleta atende todos os usuários.
- (−) O dado exibido é o da última execução; a tela precisa mostrar data e hora da atualização.
