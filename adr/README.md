# Registros de Decisão Arquitetural (ADRs)

**Projeto:** Simulador de Investimentos
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação
**Integrantes:** Luís Gustavo Sampaio Coêlho, Nicoly Araujo de Paschoa

Um **ADR** registra **uma** decisão arquitetural: o contexto em que foi tomada, as alternativas consideradas, a decisão e as consequências. Os ADRs não são reescritos quando a decisão muda: uma nova decisão gera um novo ADR, e o antigo passa a indicar que foi alterado ou substituído. Assim fica o histórico de **por que** o sistema é como é.

Os identificadores **DAxx** são os mesmos usados nos [Drivers Arquiteturais](../drivers_arquiteturais.md) e no [Documento de Arquitetura](../arquitetura.md).

## Status possíveis

| Status | Significado |
|---|---|
| Proposta | Em discussão; ainda não aprovada pela equipe |
| Aceita | Aprovada e em vigor |
| Aceita, com pontos em aberto | Aprovada, mas com detalhes que a equipe ainda precisa definir (listados no ADR) |
| Substituída | Deixou de valer; o ADR indica qual o substituiu |
| Rejeitada | Discutida e descartada; mantida para registro |

## Índice

| ID | Decisão | Status | Data |
|---|---|---|---|
| [DA01](DA01-cliente-servidor-monolito-modular.md) | Cliente-servidor com monólito modular | Aceita | 24/09/2026 |
| [DA02](DA02-camadas-mvc.md) | Camadas e padrão MVC | Aceita | 24/09/2026 |
| [DA03](DA03-cliente-desktop-multiplataforma.md) | Cliente desktop multiplataforma | Aceita | 24/09/2026 |
| [DA04](DA04-banco-relacional.md) | Banco de dados relacional | Aceita | 24/09/2026 |
| [DA05](DA05-autenticacao-propria.md) | Autenticação própria, login externo como evolução | Aceita | 24/09/2026 |
| [DA06](DA06-adaptadores-fontes-externas.md) | Fontes externas atrás de adaptadores | Aceita | 24/09/2026 |
| [DA07](DA07-ingestao-assincrona.md) | Ingestão assíncrona, agendada e centralizada | Aceita (alterada por DA16, DA18 e DA22) | 24/09/2026 |
| [DA08](DA08-cache-dois-niveis-offline-leitura.md) | Cache em dois níveis e offline somente leitura | Aceita | 24/09/2026 |
| [DA09](DA09-lancamentos-imutaveis.md) | Lançamentos imutáveis e posição derivada | Aceita | 24/09/2026 |
| [DA10](DA10-nucleo-calculo-puro.md) | Núcleo de cálculo financeiro puro | Aceita (alterada por DA22) | 24/09/2026 |
| [DA11](DA11-noticias-ia-modulo-isolado.md) | Notícias e IA como módulo isolado | Aceita (complementada por DA19 e DA20) | 24/09/2026 |
| [DA12](DA12-autorizacao-planos-no-servidor.md) | Autorização e planos garantidos no servidor | Aceita | 24/09/2026 |
| [DA13](DA13-dados-pessoais-concentrados.md) | Dados pessoais concentrados | Aceita | 24/09/2026 |
| [DA14](DA14-registro-execucoes-logs.md) | Registro de execuções e logs estruturados | Aceita | 24/09/2026 |
| [DA15](DA15-carater-educacional.md) | Caráter educacional garantido pela arquitetura | Aceita | 24/09/2026 |
| [DA16](DA16-cotacoes-por-plano.md) | Atualização de cotações conforme o plano | Aceita, com pontos em aberto (alterada por DA22) | 01/10/2026 |
| [DA17](DA17-carteira-ao-vivo-e-historica.md) | Carteira ao vivo e carteira histórica | Aceita, com pontos em aberto (alterada por DA22) | 01/10/2026 |
| [DA18](DA18-historico-cotacoes-arquivos-b3.md) | Histórico de cotações a partir dos arquivos da B3 | Proposta (alterada por DA22) | 01/10/2026 |
| [DA19](DA19-fontes-de-noticias.md) | Fontes de notícias: fonte pai, curadas e do usuário | Aceita, com ponto em aberto crítico | 01/10/2026 |
| [DA20](DA20-modelo-ia-noticias.md) | Modelo de IA para notícias, aperfeiçoado com janela histórica | Aceita, com pontos em aberto | 01/10/2026 |
| [DA21](DA21-cenarios-por-sentimento.md) | Cenários por probabilidade condicional ao sentimento | Proposta | 01/10/2026 |
| [DA22](DA22-escopo-acoes-fiis-renda-fixa-adiada.md) | Escopo inicial: ações e FIIs; renda fixa adiada | Aceita, com pontos em aberto | 02/10/2026 |

## Modelo para novos ADRs

Copie o bloco abaixo para um arquivo `DAxx-titulo-curto.md`:

```markdown
# DAxx — Título da decisão

| Campo | Valor |
|---|---|
| Status | Proposta |
| Data | dd/mm/aaaa |
| Drivers | OBJ.., FAS.., QA.., RES.., PA.. |
| Substitui / Altera | — |
| Relacionadas | — |

## Contexto
O problema e as forças envolvidas (requisitos, restrições, riscos).

## Alternativas consideradas
1. Alternativa — vantagens e desvantagens.
2. ...

## Decisão
O que foi escolhido e as regras que decorrem da escolha.

## Consequências
- (+) ganhos
- (−) custos e riscos

## Pontos em aberto
O que ainda precisa ser definido.

## Impacto nos outros documentos
Requisitos, modelo de domínio e demais documentos que precisam mudar.
```
