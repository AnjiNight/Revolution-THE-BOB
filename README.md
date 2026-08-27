# Simulador de Investimentos

Aplicativo para simulação de carteiras de investimento em ações e renda fixa do mercado brasileiro. Projeto acadêmico, sem execução de ordens reais.

**Disciplina:** Modelagem de Dados
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação

## Integrantes

- Luís Gustavo Sampaio Coêlho
- Nicoly Araujo de Paschoa

## Sobre

O usuário monta carteiras fictícias com ativos reais e acompanha a rentabilidade ao longo do tempo, usando cotações e indexadores verdadeiros — sem dinheiro real envolvido. O objetivo é permitir testar hipóteses de investimento antes de aplicar de verdade.

O projeto também investiga se o sentimento extraído de notícias econômicas guarda relação com a variação de preço dos ativos.

## Funcionalidades

- Cadastro e autenticação de usuário
- Criação de carteiras de simulação
- Registro de compras, vendas, aportes e retiradas
- Cálculo de posição, preço médio e rentabilidade
- Comparação com benchmarks (CDI e IBOV)
- Aplicação e resgate em renda fixa, com IR e IOF
- Coleta de notícias econômicas e análise de sentimento
- Projeção de cenários futuros

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Aplicativo | React Native (Expo) |
| API | Node.js + Fastify + TypeScript |
| Banco de dados | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |

**Fontes de dados:** brapi.dev (cotações da B3), API SGS do Banco Central (CDI, Selic, IPCA), feeds RSS de portais econômicos.

## Estrutura

```
app/         Aplicativo React Native
api/         API Node + Fastify
packages/    Tipos compartilhados
docs/        Requisitos e modelagem
```

## Aviso legal

Projeto acadêmico de caráter educacional. Não constitui recomendação de investimento nem consultoria financeira. Todas as operações são simuladas, sem movimentação de recursos reais. Projeções são cenários estatísticos e não garantem resultado futuro.
