
# Modelo de Dados — Simulador de Investimentos
Modelo conceitual (MER) das entidades do aplicativo: carteiras de usuários, ativos (ações e fundos imobiliários), cotações, notícias e simulações.

> **Escopo atual (02/10/2026):** ações e FIIs. A renda fixa foi adiada para uma fase futura ([DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md)). Os elementos marcados com *(fase de renda fixa)* continuam no diagrama, mas não fazem parte da primeira fase.

## Diagrama

<img width="3387" height="2301" alt="image" src="https://github.com/user-attachments/assets/915e0ed7-edbb-4613-815d-74aa8b6bb1d4" />


## Entidades

### USUARIO
Pessoa cadastrada no aplicativo.

| Atributo | Tipo | Descrição |
|---|---|---|
| nome | string | Nome do usuário |
| email | string | E-mail de login, único e sempre em minúsculas (RB01) |
| senha_hash | string | Hash argon2id da senha; a senha nunca é guardada (RNF07); vazio em conta só com Google — SPEC-002 |
| perfil | enum | `usuario` ou `colaborador` (DA12); colaborador só é criado pela equipe; "assinante" vem da assinatura — SPEC-002 |
| google_sub | string | Identificador da conta Google ligada, se houver ([DA24](adr/DA24-login-com-google.md)); conta só com Google não tem `senha_hash` |

### CONSENTIMENTO
Aceite dos termos de uso e da política de privacidade (RNF11) — [SPEC-002](specs/SPEC-002.md).

| Atributo | Tipo | Descrição |
|---|---|---|
| tipo | enum | Hoje só `termos_uso_privacidade` |
| versao | string | Versão dos termos aceita |
| aceito_em | datetime | Momento do aceite |

### TOKEN_RENOVACAO
Sessão de login do usuário (RF02, DA05) — [SPEC-002](specs/SPEC-002.md). Só o hash do token é guardado.

| Atributo | Tipo | Descrição |
|---|---|---|
| token_hash | string | Hash SHA-256 do token de renovação (único) |
| familia | uuid | Agrupa as trocas de um mesmo login; reuso de token revoga a família inteira |
| expira_em | datetime | Validade (30 dias) |
| revogado_em | datetime | Preenchido na troca, no logout ou ao detectar reuso |

### CARTEIRA
Conjunto de posições de um usuário. Um usuário pode ter várias carteiras.

| Atributo | Tipo | Descrição |
|---|---|---|
| nome | string | Identificação da carteira, única para cada usuário — [SPEC-012](specs/SPEC-012.md) |
| tipo | enum | `ao_vivo` ou `historica`, escolhido na criação e imutável (RB24, [DA17](adr/DA17-carteira-ao-vivo-e-historica.md)) |
| inicio_em | date | Ao vivo: o dia da criação; histórica: o dia de pregão escolhido, desde 04/01/2016 |
| criada_em | date | Data de criação |

Não há saldo guardado na carteira: o caixa vem só dos aportes e retiradas (livro-razão, [DA09](adr/DA09-lancamentos-imutaveis.md); OPEN-11 decidida na SPEC-012).

### LANCAMENTO_CAIXA
Aporte ou retirada de dinheiro fictício numa carteira ([SPEC-013](specs/SPEC-013.md)). O saldo em caixa é a conta desses lançamentos (livro-razão, [DA09](adr/DA09-lancamentos-imutaveis.md)); nenhum é alterado nem apagado (RB08).

| Atributo | Tipo | Descrição |
|---|---|---|
| tipo | enum | `aporte` ou `retirada` |
| valor | decimal(15,2) | De R$ 0,01 a R$ 10.000.000,00 (RB13) |
| data | date | Ao vivo: o dia do registro em Brasília; histórica: o dia de pregão escolhido (RB11, RB25) |
| registrado_em | datetime | Quando o servidor registrou |

### TRANSACAO
Operação de compra ou venda registrada em uma carteira sobre um ativo ([SPEC-014](specs/SPEC-014.md)). Nunca é alterada nem apagada (RB08); a posição e o preço médio são calculados a partir delas (RB09, RB10).

| Atributo | Tipo | Descrição |
|---|---|---|
| tipo | enum | `compra` ou `venda` |
| quantidade | inteiro | De 1 a 1.000.000 (RB27) |
| preco_unitario | decimal(15,2) | Preço por unidade: a cotação usada, arredondada a 2 casas (RB13) |
| valor_total | decimal(15,2) | Quantidade × preço unitário |
| data | date | Ao vivo: o dia do registro e da cotação em Brasília (RB07, RB11) |
| registrado_em | datetime | Quando o servidor registrou |
| cotacao_em | datetime | Horário da cotação usada (DA16) |
| nivel_cotacao | enum | `gratuito` ou `assinante` (DA16) |
| fonte_cotacao | enum | Fonte da cotação (`brapi`) |

### SIMULACAO
Projeção gerada a partir de uma carteira.

| Atributo | Tipo | Descrição |
|---|---|---|
| gerada_em | date | Data em que a simulação foi criada |
| horizonte | string | Prazo projetado |

### ATIVO
Papel negociável na B3 — ação ou cota de fundo imobiliário (FII). Títulos de renda fixa entram na fase de renda fixa.

| Atributo | Tipo | Descrição |
|---|---|---|
| ticker | string | Código de negociação |
| nome | string | Nome do ativo |
| classe | enum | **Ação** (inclui units) ou **FII** — lista fechada, definida no cadastro e imutável (RB22, [DA23](adr/DA23-classes-de-ativo-acoes-e-fiis.md)); renda fixa na fase futura |
| vencimento | date | *(fase de renda fixa)* Data de vencimento |

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
Índice de referência. No escopo atual, apenas o **CDI**, usado como benchmark. Na fase de renda fixa, também IPCA e SELIC, aos quais um título pode estar atrelado.

| Atributo | Tipo | Descrição |
|---|---|---|
| sigla | string | Sigla do indexador |

### TAXA_DIARIA
Série histórica de valores do indexador.

| Atributo | Tipo | Descrição |
|---|---|---|
| data | date | Data de referência |
| valor | decimal | Valor da taxa no dia |

### INDICE_BOLSA
Índice da B3 usado como referência (benchmark) da carteira ([SPEC-020](specs/SPEC-020.md)): **Ibovespa** e **IFIX**. Fica separado do INDEXADOR, que guarda taxas do Banco Central; o índice é uma pontuação.

| Atributo | Tipo | Descrição |
|---|---|---|
| sigla | string | Sigla da B3 (IBOV, IFIX) |
| nome | string | Nome do índice |

### FECHAMENTO_INDICE
Série histórica do índice: o fechamento de cada pregão, como a B3 publica.

| Atributo | Tipo | Descrição |
|---|---|---|
| data | date | Pregão |
| valor | decimal | Pontos no fechamento |

## Relacionamentos

| Origem | Cardinalidade | Destino | Nome |
|---|---|---|---|
| USUARIO | 1 : N | CARTEIRA | possui |
| USUARIO | 1 : N | CONSENTIMENTO | aceita |
| USUARIO | 1 : N | TOKEN_RENOVACAO | mantém sessão |
| CARTEIRA | 1 : N | LANCAMENTO_CAIXA | registra |
| CARTEIRA | 1 : N | TRANSACAO | registra |
| CARTEIRA | 1 : N | SIMULACAO | origina |
| ATIVO | 1 : N | TRANSACAO | movimenta |
| ATIVO | 1 : N | COTACAO | possui |
| ATIVO | N : 1 | INDEXADOR | indexado_por *(fase de renda fixa)* |
| ATIVO | 1 : N | NOTICIA_ATIVO | mencionado_em |
| NOTICIA | 1 : N | NOTICIA_ATIVO | cita |
| INDEXADOR | 1 : N | TAXA_DIARIA | registra |
| INDICE_BOLSA | 1 : N | FECHAMENTO_INDICE | registra |

O par ATIVO → NOTICIA_ATIVO ← NOTICIA representa o N:N entre ativos e notícias.

## Observações para a fase lógica

- O modelo conceitual acima não traz chaves; na passagem para o lógico cada entidade recebe uma PK própria (`id`) e as FKs correspondentes aos relacionamentos.
- `NOTICIA_ATIVO` pode ter chave primária composta (`ativo_id`, `noticia_id`).
- `COTACAO`, `TAXA_DIARIA` e `FECHAMENTO_INDICE` são séries temporais: a combinação (ativo/indexador/índice + data) tende a ser única, o que justifica um índice único nesses pares.
- *(Fase de renda fixa)* `vencimento` só se aplica a ativos de renda fixa, então aceita nulo — alternativa é especializar `ATIVO` em subtipos por `classe`.
- Ações são classificadas por **setor** e FIIs por **segmento** ([DA23](adr/DA23-classes-de-ativo-acoes-e-fiis.md)); as duas classificações entram junto com SETOR, prevista na arquitetura §9.
- `sentimento` está como string; se os valores forem fechados (positivo/neutro/negativo), vale usar um enum ou uma tabela de domínio.
