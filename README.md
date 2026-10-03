# Simulador de Investimentos

Aplicação desktop para simulação de carteiras de investimento em ações e fundos imobiliários (FIIs) do mercado brasileiro. Projeto acadêmico, sem execução de ordens reais. A renda fixa está prevista para uma fase futura.

**Disciplina:** Modelagem de Dados
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação

## Integrantes

- Luís Gustavo Sampaio Coêlho
- Nicoly Paschoa

## Sobre

O usuário monta carteiras fictícias com ativos reais e acompanha a rentabilidade ao longo do tempo, usando cotações verdadeiras — sem dinheiro real envolvido. O objetivo é permitir testar hipóteses de investimento antes de aplicar de verdade.

O projeto também investiga se o sentimento extraído de notícias econômicas guarda relação com a variação de preço dos ativos.

## Funcionalidades

- Cadastro e autenticação de usuário
- Criação de carteiras de simulação
- Registro de compras, vendas, aportes e retiradas
- Cálculo de posição, preço médio e rentabilidade
- Comparação com benchmarks (CDI e IBOV)
- Coleta de notícias econômicas e análise de sentimento
- Projeção de cenários futuros

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Aplicação desktop | Electron + React + TypeScript |
| API | Node.js + Fastify + TypeScript |
| Banco de dados | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |

**Fontes de dados:** brapi.dev (cotações de ações e FIIs da B3), API SGS do Banco Central (CDI), feeds RSS de portais econômicos.

**Fase futura:** aplicação e resgate em renda fixa (CDB, LCI/LCA, Tesouro Direto), com IR e IOF — ver [Requisitos §9](requisições.md) e [DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md).

## Estrutura

```
app/         Aplicação desktop (Electron)
api/         API Node + Fastify
packages/    Tipos compartilhados
docs/        Requisitos e modelagem
```

## Aviso legal

Projeto acadêmico de caráter educacional. Não constitui recomendação de investimento nem consultoria financeira. Todas as operações são simuladas, sem movimentação de recursos reais. Projeções são cenários estatísticos e não garantem resultado futuro.
