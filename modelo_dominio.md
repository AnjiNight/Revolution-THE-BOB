
# Modelo de Dados — Simulador de Investimentos
Modelo conceitual (MER) das entidades do aplicativo: carteiras de usuários, ativos de renda variável e renda fixa, cotações, notícias e simulações.

## Diagrama

<img width="3387" height="2301" alt="image" src="https://github.com/user-attachments/assets/915e0ed7-edbb-4613-815d-74aa8b6bb1d4" />


## Entidades

### USUARIO
Pessoa cadastrada no aplicativo.

| Atributo | Tipo | Descrição |
|---|---|---|
| nome | string | Nome do usuário |
| email | string | E-mail de login |

### CARTEIRA
Conjunto de posições de um usuário. Um usuário pode ter várias carteiras.

| Atributo | Tipo | Descrição |
|---|---|---|
| nome | string | Identificação da carteira |
| saldo_inicial | decimal | Valor aportado no início |
| criada_em | date | Data de criação |

### TRANSACAO
Operação de compra ou venda registrada em uma carteira sobre um ativo.

| Atributo | Tipo | Descrição |
|---|---|---|
| tipo | string | Compra ou venda |
| quantidade | decimal | Quantidade negociada |
| preco_unitario | decimal | Preço por unidade |
| data | date | Data da operação |

### SIMULACAO
Projeção gerada a partir de uma carteira.

| Atributo | Tipo | Descrição |
|---|---|---|
| gerada_em | date | Data em que a simulação foi criada |
| horizonte | string | Prazo projetado |

### ATIVO
Papel negociável — ação da B3 ou título de renda fixa.

| Atributo | Tipo | Descrição |
|---|---|---|
| ticker | string | Código de negociação |
| nome | string | Nome do ativo |
| classe | string | Renda variável, renda fixa etc. |
| vencimento | date | Data de vencimento (renda fixa) |

### COTACAO
Preço histórico diário de um ativo.

| Atributo | Tipo | Descrição |
|---|---|---|
| data | date | Data do pregão |
| fechamento | decimal | Preço de fechamento |

### NOTICIA
Matéria de jornal usada na análise de sentimento.

| Atributo | Tipo | Descrição |
|---|---|---|
| titulo | string | Título da matéria |
| fonte | string | Veículo de origem |
| publicada_em | date | Data de publicação |
| sentimento | string | Classificação do texto |

### NOTICIA_ATIVO
Entidade associativa que resolve o N:N entre notícias e ativos citados.

### INDEXADOR
Índice de referência ao qual um ativo pode estar atrelado (CDI, IPCA, SELIC).

| Atributo | Tipo | Descrição |
|---|---|---|
| sigla | string | Sigla do indexador |

### TAXA_DIARIA
Série histórica de valores do indexador.

| Atributo | Tipo | Descrição |
|---|---|---|
| data | date | Data de referência |
| valor | decimal | Valor da taxa no dia |

## Relacionamentos

| Origem | Cardinalidade | Destino | Nome |
|---|---|---|---|
| USUARIO | 1 : N | CARTEIRA | possui |
| CARTEIRA | 1 : N | TRANSACAO | registra |
| CARTEIRA | 1 : N | SIMULACAO | origina |
| ATIVO | 1 : N | TRANSACAO | movimenta |
| ATIVO | 1 : N | COTACAO | possui |
| ATIVO | N : 1 | INDEXADOR | indexado_por |
| ATIVO | 1 : N | NOTICIA_ATIVO | mencionado_em |
| NOTICIA | 1 : N | NOTICIA_ATIVO | cita |
| INDEXADOR | 1 : N | TAXA_DIARIA | registra |

O par ATIVO → NOTICIA_ATIVO ← NOTICIA representa o N:N entre ativos e notícias.

## Observações para a fase lógica

- O modelo conceitual acima não traz chaves; na passagem para o lógico cada entidade recebe uma PK própria (`id`) e as FKs correspondentes aos relacionamentos.
- `NOTICIA_ATIVO` pode ter chave primária composta (`ativo_id`, `noticia_id`).
- `COTACAO` e `TAXA_DIARIA` são séries temporais: a combinação (ativo/indexador + data) tende a ser única, o que justifica um índice único nesses pares.
- `vencimento` só se aplica a ativos de renda fixa, então aceita nulo — alternativa é especializar `ATIVO` em subtipos por `classe`.
- `sentimento` está como string; se os valores forem fechados (positivo/neutro/negativo), vale usar um enum ou uma tabela de domínio.
