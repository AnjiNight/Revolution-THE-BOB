# Drivers Arquiteturais

**Projeto:** Simulador de Investimentos
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação
**Integrantes:** Luís Gustavo Sampaio Coêlho, Nicoly Araujo de Paschoa
**Versão:** 1.1 (01/10/2026 — PRE01 revogada; rastreabilidade das decisões DA16–DA21)

---

## 1. Introdução

Drivers arquiteturais são os requisitos, objetivos e restrições que **moldam a arquitetura** do sistema. Nem todo requisito é um driver: um requisito só se torna driver quando, se fosse diferente, a estrutura do sistema também seria diferente.

Este documento seleciona, a partir de [Visão de produto](Visão%20de%20produto.md), [Especificação de Requisitos](requisições.md), [Personas](personas.md) e [Modelo de Domínio](modelo_dominio.md), aquilo que orienta as decisões registradas nos [ADRs](adr/README.md) e consolidadas no [Documento de Arquitetura](arquitetura.md).

Os drivers estão organizados em cinco grupos:

1. Objetivos de negócio
2. Funcionalidades arquiteturalmente significativas
3. Atributos de qualidade (com cenários)
4. Restrições
5. Premissas e preocupações arquiteturais

---

## 2. Objetivos de negócio

| ID | Objetivo | Origem |
|---|---|---|
| OBJ01 | Permitir que o usuário aprenda e experimente investimentos **sem arriscar dinheiro real**, usando ativos e cotações verdadeiros | Visão §10–14, P01 |
| OBJ02 | **Centralizar** cotações, indexadores, notícias e simulações em uma única aplicação | Visão §2, P02 |
| OBJ03 | Investigar se o **sentimento de notícias** guarda relação mensurável com a variação de preço dos ativos | README, Requisitos §1 |
| OBJ04 | Entregar um MVP funcional em **um semestre**, com **dois integrantes** e **custo zero** de infraestrutura | Requisitos §6 |
| OBJ05 | Servir de base para a evolução prevista: IA conversacional, carteira real, perfil do investidor, fontes personalizadas | Visão §25–26 |
| OBJ06 | Sustentar um modelo com plano gratuito e assinatura (pagamento simulado) | RF32, RF33 |
| OBJ07 | Manter caráter **educacional**: nunca emitir recomendação de investimento | RB18, RB19, restrição regulatória (CVM) |

---

## 3. Funcionalidades arquiteturalmente significativas

Funcionalidades que, pela sua natureza, exigem decisões estruturais — não apenas mais código.

| ID | Funcionalidade | Requisitos | Por que afeta a arquitetura |
|---|---|---|---|
| FAS01 | Registrar transações e derivar posição, preço médio e rentabilidade | RF12–RF15, RB05–RB10, RB13 | Exige lançamentos imutáveis, posição sempre **calculada** (nunca editada) e aritmética decimal exata |
| FAS02 | Renda fixa com IR, IOF, carência e base 252 | RF23–RF25, RB14–RB17 | Depende de calendário de pregão e de séries diárias de indexadores; regras fiscais precisam estar isoladas e testáveis |
| FAS03 | Ingestão de cotações e indexadores | RF09, RF10 | Depende de fontes externas instáveis e com limite de requisições; precisa rodar de forma agendada, independente do uso do app |
| FAS04 | Coleta, vínculo a ativos e classificação de sentimento de notícias | RF26–RF29, Visão §6 | Processamento pesado e incerto (pesquisa); não pode comprometer o núcleo do sistema se falhar |
| FAS05 | Gráfico Notícias × Preço do ativo | Visão §19, §24 | Cruza duas bases diferentes (séries de preço e eventos de notícia) no mesmo eixo temporal |
| FAS06 | Consulta sem conexão e sincronização | RF36, RF37, RNF14, RNF19 | Obriga o cliente a ter armazenamento local e estratégia de sincronização com o servidor |
| FAS07 | Autenticação e sessão persistente | RF01–RF04, RNF07–RNF10 | Define onde a identidade vive, como tokens são renovados e onde são guardados no dispositivo |
| FAS08 | Restrição de recursos por plano | RF30, RF32, RF33 | O bloqueio precisa ser garantido no servidor, não apenas escondido na interface |
| FAS09 | Exportação e exclusão de dados pessoais | RF06, RB04, RNF11 | Todos os dados do usuário precisam ser localizáveis e removíveis de forma consistente |
| FAS10 | Administração de ativos e monitoramento da ingestão | RF39, RF40, P03 | Requer registro das execuções de cada tarefa e perfis de acesso distintos |
| FAS11 | Projeção de cenários (ajustada por sentimento) | RF30, RF31, Visão §5 | Módulo analítico que consome dados de vários outros módulos; resultado sempre apresentado como cenário, nunca como previsão |

---

## 4. Atributos de qualidade

### 4.1 Árvore de utilidade

Cada cenário recebe duas notas (A = alta, M = média, B = baixa):

- **Importância** para o negócio/usuário
- **Risco/dificuldade** técnica para atingi-lo

Os cenários marcados **(A, A)** e **(A, M)** são os que mais orientam a arquitetura.

| Atributo | Refinamento | Cenário | Prioridade (Imp., Risco) |
|---|---|---|---|
| Confiabilidade | Exatidão dos cálculos | QA01 | (A, M) |
| Disponibilidade | Falha de fonte externa | QA02 | (A, A) |
| Disponibilidade | Operação sem conexão | QA03 | (M, A) |
| Desempenho | Carregamento do painel | QA04 | (A, M) |
| Segurança | Isolamento dos dados entre usuários | QA05 | (A, M) |
| Segurança | Proteção de credenciais | QA06 | (A, M) |
| Privacidade | Exclusão de dados (LGPD) | QA07 | (A, B) |
| Modificabilidade | Troca de fonte de dados | QA08 | (A, M) |
| Modificabilidade | Inclusão de novas capacidades (IA, carteira real) | QA09 | (M, M) |
| Testabilidade | Regras financeiras | QA10 | (A, B) |
| Auditabilidade | Rastreio das transações | QA11 | (M, B) |
| Observabilidade | Falhas na ingestão | QA12 | (M, M) |
| Usabilidade | Usuário iniciante | QA13 | (A, B) |
| Portabilidade | Sistemas operacionais | QA14 | (M, B) |
| Internacionalização | Troca de idioma | QA15 | (B, B) |

### 4.2 Cenários de qualidade

Formato: **Fonte → Estímulo → Artefato → Ambiente → Resposta → Medida**.

#### QA01 — Exatidão dos cálculos financeiros
| Parte | Descrição |
|---|---|
| Fonte | Usuário |
| Estímulo | Registra uma sequência de compras, vendas e um resgate de renda fixa com 20 dias de aplicação |
| Artefato | Módulo de cálculo financeiro |
| Ambiente | Operação normal |
| Resposta | Sistema calcula posição, preço médio, rendimento bruto, IOF e IR |
| Medida | Resultados idênticos, centavo a centavo, a uma calculadora de referência (ex.: Tesouro Direto); nenhum erro de arredondamento por ponto flutuante |

#### QA02 — Falha de fonte externa de dados
| Parte | Descrição |
|---|---|
| Fonte | Provedor externo de cotações |
| Estímulo | Fica indisponível ou retorna erro/limite de requisições excedido |
| Artefato | Processo de ingestão e telas que exibem preços |
| Ambiente | Operação normal, horário de atualização diária |
| Resposta | A aplicação continua funcionando com o último dado válido, indica a data da última atualização e agenda nova tentativa |
| Medida | 0 telas quebradas; usuário nunca vê erro técnico; nova tentativa automática em até 1 h |

#### QA03 — Operação sem conexão
| Parte | Descrição |
|---|---|
| Fonte | Usuário |
| Estímulo | Abre a aplicação sem internet |
| Artefato | Aplicação cliente |
| Ambiente | Usuário já autenticado anteriormente, sem conexão |
| Resposta | Exibe carteiras, posições e gráficos com os últimos dados sincronizados, sinalizando o modo offline |
| Medida | Painel disponível em até 3 s; ao reconectar, sincronização incremental sem intervenção do usuário |

#### QA04 — Desempenho do painel
| Parte | Descrição |
|---|---|
| Fonte | Usuário |
| Estímulo | Abre o painel de uma carteira |
| Artefato | Sistema completo |
| Ambiente | Carteira com até 50 ativos e 2 anos de histórico, conexão comum |
| Resposta | Exibe posição, rentabilidade e evolução patrimonial |
| Medida | Menos de 2 s (RNF06) |

#### QA05 — Isolamento de dados entre usuários
| Parte | Descrição |
|---|---|
| Fonte | Usuário autenticado mal-intencionado |
| Estímulo | Altera o identificador de uma carteira na requisição para acessar a carteira de outra pessoa |
| Artefato | Servidor de aplicação |
| Ambiente | Operação normal |
| Resposta | Requisição negada e tentativa registrada |
| Medida | 100% das requisições a recursos de terceiros negadas (RB03) |

#### QA06 — Proteção de credenciais
| Parte | Descrição |
|---|---|
| Fonte | Atacante |
| Estímulo | Tenta descobrir senhas por força bruta, ou obtém acesso ao banco de dados ou ao disco do usuário |
| Artefato | Módulo de identidade, banco de dados, armazenamento local do cliente |
| Ambiente | Operação normal |
| Resposta | Limita tentativas; senhas nunca armazenadas em texto claro; tokens guardados no cofre do sistema operacional |
| Medida | Senhas irrecuperáveis a partir do banco; tentativas bloqueadas após limite (RNF07, RNF08, RNF10) |

#### QA07 — Exclusão de dados (LGPD)
| Parte | Descrição |
|---|---|
| Fonte | Usuário |
| Estímulo | Solicita exclusão da conta |
| Artefato | Todos os módulos que guardam dados pessoais |
| Ambiente | Operação normal |
| Resposta | Remove ou anonimiza todos os dados pessoais, incluindo cópias locais e logs |
| Medida | Concluído em até 30 dias (RB04), com registro do pedido |

#### QA08 — Troca de fonte de dados
| Parte | Descrição |
|---|---|
| Fonte | Equipe de desenvolvimento |
| Estímulo | O provedor de cotações passa a cobrar ou é descontinuado |
| Artefato | Módulo de ingestão |
| Ambiente | Tempo de desenvolvimento |
| Resposta | Novo provedor é integrado sem alterar regras de negócio, telas ou modelo de dados |
| Medida | Alteração restrita a um único componente adaptador; até 2 dias de trabalho |

#### QA09 — Inclusão de novas capacidades
| Parte | Descrição |
|---|---|
| Fonte | Equipe de desenvolvimento |
| Estímulo | Adicionar assistente de IA ou carteira real (Visão §9, §20) |
| Artefato | Sistema |
| Ambiente | Tempo de desenvolvimento, após o MVP |
| Resposta | Nova capacidade entra como novo módulo que consome os existentes |
| Medida | Nenhuma alteração nas regras de cálculo ou no modelo de transações já existentes |

#### QA10 — Testabilidade das regras financeiras
| Parte | Descrição |
|---|---|
| Fonte | Equipe de desenvolvimento |
| Estímulo | Alteração em uma regra de IR ou de preço médio |
| Artefato | Módulo de cálculo financeiro |
| Ambiente | Tempo de desenvolvimento |
| Resposta | Regras verificadas por testes automatizados sem banco de dados, rede ou interface |
| Medida | Suíte do módulo executa em menos de 10 s; cobertura das regras RB05–RB17 (RNF16) |

#### QA11 — Rastreio das transações
| Parte | Descrição |
|---|---|
| Fonte | Usuário ou administrador |
| Estímulo | Questiona um saldo ou posição |
| Artefato | Carteiras e auditoria |
| Ambiente | Operação normal |
| Resposta | Histórico completo de lançamentos e estornos permite reconstruir a posição em qualquer data |
| Medida | 100% das posições reproduzíveis a partir do histórico (RB08, RB09, RNF15) |

#### QA12 — Visibilidade das falhas de ingestão
| Parte | Descrição |
|---|---|
| Fonte | Processo automático de ingestão |
| Estímulo | Falha parcial (alguns ativos não atualizados) |
| Artefato | Módulo de administração |
| Ambiente | Execução agendada |
| Resposta | Registra horário, fonte, ativos afetados, registros processados e erro; permite reexecução |
| Medida | Administrador identifica a falha sem acessar o banco diretamente (P03) |

#### QA13 — Usabilidade para iniciante
| Parte | Descrição |
|---|---|
| Fonte | Usuário iniciante (P01) |
| Estímulo | Cria a primeira carteira simulada |
| Artefato | Aplicação cliente |
| Ambiente | Primeiro uso |
| Resposta | Conclui a tarefa com linguagem acessível e explicações dos termos |
| Medida | Tarefa concluída em até 5 min sem ajuda externa |

#### QA14 — Portabilidade
| Parte | Descrição |
|---|---|
| Fonte | Usuário |
| Estímulo | Instala a aplicação |
| Artefato | Aplicação cliente |
| Ambiente | Windows 10+, macOS 12+ ou Linux |
| Resposta | Aplicação funciona com o mesmo comportamento |
| Medida | Uma única base de código para os três sistemas (RNF05) |

#### QA15 — Troca de idioma
| Parte | Descrição |
|---|---|
| Fonte | Usuário |
| Estímulo | Troca o idioma para inglês |
| Artefato | Aplicação cliente |
| Ambiente | Operação normal |
| Resposta | Textos da interface mudam; valores e datas seguem o formato do idioma |
| Medida | Nenhum texto fixo no código das telas (RNF20) |

---

## 5. Restrições

Decisões que já chegam tomadas e não estão abertas a negociação.

| ID | Tipo | Restrição | Origem |
|---|---|---|---|
| RES01 | Negócio | Prazo de um semestre letivo | Requisitos §6 |
| RES02 | Negócio | Equipe de dois integrantes | Requisitos §6 |
| RES03 | Negócio | Custo zero: apenas serviços em camada gratuita | Requisitos §6 |
| RES04 | Regulatória | Recomendação de investimento é atividade regulada pela CVM; o sistema só apresenta cenários educativos | RB18, RB19 |
| RES05 | Legal | Conformidade com a LGPD: consentimento e direito de exclusão | RNF11 |
| RES06 | Técnica | Aplicação **desktop** multiplataforma (Windows, macOS, Linux) | README, RNF05 |
| RES07 | Técnica | Dados de mercado vêm de APIs públicas gratuitas, com limite de requisições | Requisitos §6 |
| RES08 | Domínio | Sem execução de ordens reais, sem integração com corretora, sem pagamento real, apenas mercado brasileiro | Requisitos §1.1 |
| RES09 | Técnica | Tecnologias já definidas pela equipe (RNF01–RNF03). O documento de arquitetura é independente de tecnologia; o mapeamento para as tecnologias está no [README](README.md) | RNF01–RNF03 |

---

## 6. Premissas

| ID | Premissa | Impacto se for falsa |
|---|---|---|
| PRE01 | ~~Cotações **diárias** (fechamento) são suficientes; não há necessidade de tempo real~~ **Revogada em 01/10/2026** por [DA16](adr/DA16-cotacoes-por-plano.md): ações são exibidas durante o pregão, com atraso conforme o plano (~30 min no gratuito); renda fixa continua diária. Tempo real verdadeiro (streaming) segue fora do escopo | Seria necessária arquitetura de streaming, fora do escopo |
| PRE02 | Volume pequeno de usuários (contexto acadêmico: dezenas, não milhares) | Um único servidor deixaria de ser suficiente |
| PRE03 | As APIs de cotações e indexadores continuam gratuitas e disponíveis | Troca de provedor (mitigada por QA08) |
| PRE04 | Notícias em português, obtidas de feeds públicos ou de fontes com autorização de uso (fonte pai, curadas e do usuário — [DA19](adr/DA19-fontes-de-noticias.md)) | Classificação de sentimento precisaria de outros modelos/idiomas |
| PRE05 | Todos os horários seguem o fuso de Brasília e o calendário da B3 | Cálculos de dias úteis e pregão ficariam incorretos |
| PRE06 | Uso predominante com conexão; o modo offline é de **consulta** | Edição offline exigiria resolução de conflitos |

---

## 7. Preocupações arquiteturais

Questões que a arquitetura precisa responder, mesmo sem estarem escritas como requisitos.

| ID | Preocupação |
|---|---|
| PA01 | Onde fica a "fonte da verdade": no cliente ou no servidor? |
| PA02 | Como garantir que regras como RB05 (saldo) e RB06 (posição) não sejam burladas por um cliente alterado? |
| PA03 | Como evitar que cada usuário consuma o limite das APIs externas? |
| PA04 | Como impedir que o módulo experimental de notícias/IA derrube ou atrase o núcleo de simulação? |
| PA05 | Como calcular posição e rentabilidade rapidamente se a posição é sempre derivada do histórico (RB09)? |
| PA06 | Como manter dados pessoais localizáveis para exportação e exclusão (LGPD)? |
| PA07 | Como preparar o sistema para a evolução da Visão de produto sem inflar o MVP? |

---

## 8. Pontos de alinhamento entre documentos

Durante a análise foram encontradas divergências entre os documentos do projeto. Elas não impedem a arquitetura, mas precisam de decisão da equipe:

| # | Divergência | Encaminhamento adotado na arquitetura |
|---|---|---|
| 1 | A **Visão de produto** coloca no MVP a *carteira real* + notícias + gráfico Notícias × Ativo, com a carteira virtual como "prioridade seguinte". Os **Requisitos** colocam a simulação como *Must* e notícias como *Could* | A arquitetura segue os Requisitos (simulação no núcleo) e deixa notícias e carteira real como módulos plugáveis |
| 2 | **RNF14** fala em modo offline de *leitura*, mas **RF37** fala em *sincronizar dados pendentes* (o que implica escrita offline) | No MVP, offline é somente leitura; fila de lançamentos pendentes fica como evolução (ver [Arquitetura](arquitetura.md), DA08) |
| 3 | A Visão fala em *IA conversacional* e *probabilidades de alta/queda*; os Requisitos só tratam de *classificação de sentimento* e *projeção* | IA entra como módulo isolado atrás de uma interface, fora do caminho crítico |
| 4 | O modelo de domínio ainda não tem entidades citadas nas regras: `CalendarioPregao`, lançamento de caixa (aporte/retirada), estorno, assinatura/plano, fonte de notícia, execução de ingestão | Listadas na visão de dados do documento de arquitetura como entidades a incluir |

Decisões tomadas pela equipe em 01/10/2026, registradas como ADRs:

| Tema | Decisão | ADR |
|---|---|---|
| Cotações | Exibidas durante o pregão: ~30 min de atraso no plano gratuito; provedor pago no plano assinante | [DA16](adr/DA16-cotacoes-por-plano.md) |
| Carteiras no passado | Permitidas, em um tipo próprio de carteira (histórica), separado da carteira ao vivo | [DA17](adr/DA17-carteira-ao-vivo-e-historica.md) |
| Fontes de notícias | Fonte pai fixa (Investidor10, pendente de autorização), fontes curadas e fontes do usuário com prioridade | [DA19](adr/DA19-fontes-de-noticias.md) |
| IA | Modelo para analisar e gerenciar notícias, aperfeiçoado com janela histórica (6 anos, a definir) | [DA20](adr/DA20-modelo-ia-noticias.md) |

---

## 9. Rastreabilidade: drivers → decisões

Resumo de quais decisões ([ADRs](adr/README.md)) respondem a quais drivers.

| Driver | Decisões que respondem |
|---|---|
| OBJ04, RES01–RES03 | DA01 (monólito modular), DA02 (camadas) |
| OBJ05, QA09 | DA01, DA06 (adaptadores), DA11 (IA isolada) |
| FAS01, QA01, QA11 | DA04 (relacional), DA09 (lançamentos imutáveis), DA10 (núcleo de cálculo puro) |
| FAS03, QA02, QA08, PA03 | DA06 (adaptadores), DA07 (ingestão assíncrona centralizada) |
| FAS06, QA03, PA01 | DA01 (servidor como fonte da verdade), DA08 (cache local somente leitura) |
| QA04, PA05 | DA08 (cache em dois níveis) |
| FAS07, QA05, QA06, PA02 | DA05 (autenticação própria), DA12 (autorização no servidor) |
| FAS08, OBJ06 | DA12 |
| FAS09, QA07, PA06 | DA02, DA04, DA13 (dados pessoais concentrados) |
| FAS04, OBJ03, PA04 | DA07, DA11 |
| QA10 | DA10 |
| QA12, FAS10 | DA07, DA14 (registro de execuções) |
| QA14, RES06 | DA03 (cliente desktop multiplataforma) |
| OBJ07, RES04 | DA15 (aviso educacional nas projeções), DA21 |
| FAS03, QA02, PA03, OBJ06 | DA16 (cotações por plano) |
| OBJ01, FAS01 | DA17 (carteira ao vivo e histórica) |
| QA04, RES03, RES07 | DA18 (histórico pelos arquivos da B3) |
| OBJ02, FAS04, QA08 | DA19 (fontes de notícias) |
| OBJ03, FAS04, FAS11 | DA20 (modelo de IA), DA21 (cenários por sentimento) |
