# DA04 — Banco de dados relacional

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | FAS01, QA01, QA11, RB01, RB02, RB13, RNF12, RNF17 |
| Relacionadas | [DA09](DA09-lancamentos-imutaveis.md), [DA11](DA11-noticias-ia-modulo-isolado.md) |

## Contexto

O [Modelo de Domínio](../modelo_dominio.md) é fortemente relacional (usuário → carteira → transação → ativo → cotação). As regras exigem integridade (RB01, RB02), operações atômicas (uma compra debita caixa e cria transação ao mesmo tempo) e valores monetários exatos (RNF12, RB13). Rentabilidade e comparações são consultas de agregação por período.

## Alternativas consideradas

1. **NoSQL orientado a documentos** — flexível para notícias (texto semiestruturado), mas sem integridade referencial nativa, com transações entre documentos mais limitadas e agregações entre coleções mais trabalhosas.
2. **Relacional** — integridade, transações atômicas, tipo decimal exato, agregações e junções nativas.
3. **Híbrido** (relacional + documentos para notícias) — dois bancos para operar.

## Decisão

Alternativa 2: um **único banco relacional** para todos os módulos. Notícias ficam em tabelas próprias, com o texto e os metadados variáveis em colunas de texto ou de dados semiestruturados.

## Consequências

- (+) Restrições de unicidade, chaves estrangeiras e transações garantem as regras RB01, RB02 e a atomicidade das operações.
- (+) Séries temporais (cotações, taxas diárias) com volume pequeno (PRE02) são bem atendidas por índices únicos em (ativo, data) e (indexador, data).
- (−) Mudanças de esquema exigem migrações versionadas (RNF17).
- (−) Se a análise de notícias crescer muito, pode ser necessário um repositório específico para texto; o módulo isolado (DA11) permite essa troca.
- (−) Com cotações durante o pregão ([DA16](DA16-cotacoes-por-plano.md)) e histórico de anos ([DA18](DA18-historico-cotacoes-arquivos-b3.md)), o volume de séries temporais cresce; manter só as cotações intradiárias recentes e consolidar o histórico em fechamento diário.
