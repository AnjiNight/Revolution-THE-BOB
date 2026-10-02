# DA20 — Modelo de IA para análise de notícias, aperfeiçoado com janela histórica

| Campo | Valor |
|---|---|
| Status | Aceita, com pontos em aberto |
| Data | 01/10/2026 |
| Drivers | OBJ03, FAS04, FAS11, PA04, QA09, RES03 |
| Complementa | [DA11](DA11-noticias-ia-modulo-isolado.md) |
| Relacionadas | [DA18](DA18-historico-cotacoes-arquivos-b3.md), [DA19](DA19-fontes-de-noticias.md), [DA21](DA21-cenarios-por-sentimento.md) |

## Contexto

A equipe decidiu usar um **modelo de inteligência artificial** para analisar e gerenciar as notícias. O modelo será **aperfeiçoado** com dados históricos, dentro de um limite de tempo (foi citado **6 anos**, valor ainda não definido).

## Alternativas consideradas

1. **Regras e dicionário de palavras** — simples e barato, mas fraco com ironia, contexto e linguagem de mercado.
2. **API de modelo de linguagem**, sem treino próprio — boa qualidade imediata, mas com custo por notícia (RES03) e sem aperfeiçoamento com dados próprios.
3. **Modelo aberto em português, ajustado com dados próprios** (ex.: modelos da família BERT treinados em português) — gratuito para usar, mas exige treino e hardware.
4. **Combinação**: um modelo de linguagem rotula uma amostra e um modelo aberto aprende com ela.

A implementação será escolhida em [Decisões Técnicas](../decisoes_tecnicas.md). Esta decisão define **como o modelo se encaixa na arquitetura**, qualquer que seja ele.

## Decisão

**Responsabilidades do modelo**, sobre cada notícia nova:

1. identificar os ativos citados (vínculo notícia–ativo, RF27);
2. classificar o sentimento (RF28);
3. *(proposta)* detectar notícias duplicadas entre fontes diferentes e estimar a relevância para cada ativo.

**Encaixe na arquitetura:**

- Continua atrás da interface do classificador (DA11) e roda **apenas no processador de tarefas**.
- O **aperfeiçoamento (treino)** é feito **fora do servidor de produção**, em máquina da equipe. O resultado é uma nova **versão do modelo**, publicada no servidor.
- Cada classificação registra a **versão do modelo** que a produziu, para que resultados antigos possam ser explicados e comparados (Visão §15).
- Uma versão nova só é publicada se superar a anterior na avaliação.

**Dados de treino:**

- Apenas notícias da **fonte pai e das fontes curadas** (DA19).
- Dentro de uma **janela histórica de N anos** (a equipe citou 6).
- *(Proposta)* **Rótulos automáticos** a partir do comportamento do preço depois da notícia: retorno do ativo em 1 e 5 pregões, descontada a variação do Ibovespa. Isso evita rotular milhares de notícias à mão. Uma amostra pequena rotulada manualmente serve para conferir a qualidade.
- **Avaliação com separação no tempo**: treina com o período mais antigo e testa com o mais recente. Os dados nunca são embaralhados, para o modelo não "ver o futuro".

## Consequências

- (+) Melhoria contínua e mensurável, com histórico de versões.
- (+) O servidor gratuito não precisa treinar nada, só usar a versão publicada.
- (−) **Obter anos de notícias é o maior risco**: feeds RSS só trazem notícias recentes. É preciso uma fonte com arquivo histórico (ex.: GDELT, dados abertos da CVM, ou o arquivo da fonte pai, se autorizado).
- (−) Uma janela longa pode incluir períodos atípicos do mercado, que distorcem o aprendizado.
- (−) Mesmo usar o modelo pode ser pesado para um servidor gratuito; isso precisa ser medido.

## Pontos em aberto

1. Tamanho da janela (6 anos?) e tipo: **móvel** (sempre os últimos N anos) ou **fixa** (a partir de uma data).
2. Qual modelo e onde ele roda.
3. Com que frequência o modelo é reaperfeiçoado (ex.: mensal).
4. Métrica mínima para publicar uma versão nova (ex.: F1 em período de teste).
5. Fonte do histórico de notícias.

## Impacto nos outros documentos

- **Requisitos:** RF27 e RF28 passam a citar o modelo; novo RNF de qualidade mínima do classificador.
- **Modelo de domínio:** NOTICIA guarda `publicada_em` com data **e hora**, a versão do modelo e o sentimento; nova entidade VERSAO_MODELO.
