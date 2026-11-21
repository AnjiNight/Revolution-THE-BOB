# DA14 — Registro de execuções e logs estruturados

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | QA12, FAS10, RF40, P03 |
| Relacionadas | [DA07](DA07-ingestao-assincrona.md) |

## Contexto

O colaborador (P03) precisa ver falhas de ingestão sem acessar o banco (QA12, RF40).

## Alternativas consideradas

1. **Apenas logs em texto** em arquivo — o colaborador teria de ler arquivos no servidor.
2. **Ferramenta externa de observabilidade** — painéis prontos, mas com custo ou limites incompatíveis com RES03.
3. **Registro de execuções no banco + logs estruturados.**

## Decisão

Alternativa 3. Cada execução de tarefa grava: tarefa, fonte, início, fim, situação, registros processados, ativos afetados e mensagem de erro. Esses registros ficam no banco e alimentam o painel administrativo, que também permite **reexecutar** uma tarefa. Logs da aplicação são estruturados (campos, não só texto) e nunca contêm senhas ou tokens.

## Consequências

- (+) Atende P03 sem ferramenta paga.
- (−) Com tarefas a cada ~30 min durante o pregão ([DA16](DA16-cotacoes-por-plano.md)), a tabela de execuções cresce rápido; definir tempo de retenção.
