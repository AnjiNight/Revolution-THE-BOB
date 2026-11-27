# Especificação de Requisitos

**Projeto:** Simulador de Investimentos
**Disciplina:** Modelagem de Dados — Universidade Presbiteriana Mackenzie
**Integrantes:** Luís Gustavo Sampaio Coêlho, Nicoly Araujo de Paschoa
**Versão:** 1.16

| Versão | Alteração |
|---|---|
| 1.0 | Primeira versão |
| 1.1 | Custos de operação fora do escopo (RB20, RB21) |
| 1.2 | Escopo inicial restrito a **ações e fundos imobiliários (FIIs)**; renda fixa adiada para uma fase futura (seção 9, [DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md)) |
| 1.3 | RF10 (série do CDI) passa de *Must* para *Should*: desde a DA22 o CDI só é usado pelo benchmark (RF16, *Should*) |
| 1.4 | Rastreabilidade adiada da RB14 (seção 9.3) passa a usar o calendário de feriados bancários |
| 1.5 | Classes de ativo separadas como nas corretoras: Ação (inclui units) e FII; ETFs, BDRs e opções fora do escopo; RF07, RF18 e nova RB22 ([DA23](adr/DA23-classes-de-ativo-acoes-e-fiis.md)) |
| 1.6 | Ator "Administrador" renomeado para **Colaborador**; novos RF41 (entrar com Google) e RF42 (Área do colaborador) |
| 1.7 | Novo RF43 (confirmação de e-mail por código, no cadastro e na troca de e-mail) e nova RB23 (conta só liberada depois de confirmar o e-mail); ver [SPEC-039](specs/SPEC-039.md) |
| 1.8 | Carteiras ao vivo e histórica ([DA17](adr/DA17-carteira-ao-vivo-e-historica.md), [SPEC-012](specs/SPEC-012.md)): RF11 inclui a escolha do tipo; RB07 reescrita para os dois tipos (preço por plano na ao vivo, [DA16](adr/DA16-cotacoes-por-plano.md)); novas RB24 (tipo imutável), RB25 (ordem dos lançamentos na histórica) e RB26 (retirada não deixa o caixa negativo) |
| 1.9 | RB11 passa a valer só para compra e venda: aporte e retirada na carteira ao vivo podem ser feitos em qualquer dia ([SPEC-013](specs/SPEC-013.md)) |
| 1.10 | RB07: na carteira ao vivo, a cotação usada é sempre a do próprio dia; nova RB27 (compra e venda só em quantidade inteira) ([SPEC-014](specs/SPEC-014.md)) |
| 1.11 | Nova RB28: o estorno anula um lançamento, só é aceito se o livro continuar válido sem ele e, na carteira ao vivo, compra e venda só se estornam no mesmo dia ([SPEC-015](specs/SPEC-015.md)) |
| 1.12 | RF20 reescrito: com cenário = carteira ([SPEC-022](specs/SPEC-022.md)), "salvar e recuperar" já é a lista de carteiras (RF11); o requisito passa a ser criar uma carteira a partir de outra ([SPEC-023](specs/SPEC-023.md)) |
| 1.13 | RF37 reescrito: sem conexão, o app é só para consulta (RNF14, [DA08](adr/DA08-cache-dois-niveis-offline-leitura.md)); ao reconectar, atualiza os dados guardados trazendo só o que mudou, e não há lançamento pendente a sincronizar ([SPEC-032](specs/SPEC-032.md)) |
| 1.14 | Novo RF44: o colaborador vê o app como um usuário (Visão do usuário), com carteiras de teste da própria conta e sem acesso às carteiras de outras contas ([SPEC-045](specs/SPEC-045.md)) |
| 1.15 | Fontes de notícias do usuário ([SPEC-030](specs/SPEC-030.md), [DA19](adr/DA19-fontes-de-noticias.md)): novos RF45 (escolher as fontes e a prioridade de cada uma), RF46 (feeds próprios, até 10) e RF47 (tela Notícias com filtros); novas RB29 (a fonte pai está sempre ligada) e RB30 (as fontes dos usuários ficam fora dos números oficiais) |
| 1.16 | RF30 e RF31 reescritos com o método da [DA21](adr/DA21-cenarios-por-sentimento.md): cenários por ativo, na ficha, a partir dos pregões passados com sentimento semelhante, com a taxa-base e o número de ocorrências; RF30 passa a ser do usuário (sem exigir assinatura por enquanto). Nova RB31 (menos de 30 ocorrências: "dados insuficientes") ([SPEC-031](specs/SPEC-031.md)) |

---

## 1. Visão geral

Aplicação desktop que permite ao usuário montar carteiras de investimento fictícias com ativos reais do mercado brasileiro — ações e fundos imobiliários (FIIs) negociados na B3 — e acompanhar a rentabilidade dessas carteiras usando cotações verdadeiras, sem que exista dinheiro real envolvido.

O sistema também coleta notícias econômicas e avalia se o sentimento extraído delas guarda relação mensurável com a variação de preço dos ativos.

### 1.1 Escopo

**Dentro do escopo:** ações (incluindo units) e fundos imobiliários (FIIs) da B3, tratados como classes separadas ([DA23](adr/DA23-classes-de-ativo-acoes-e-fiis.md)), simulação de carteira, comparação com benchmarks, ingestão de cotações e do CDI, coleta e classificação de notícias, projeção de cenários, assinatura com pagamento simulado.

**Fora do escopo:** execução de ordens reais, integração com corretora, pagamento real, mercados internacionais, recomendação personalizada de investimento, custos de operação (corretagem, emolumentos da B3 e taxa de custódia), ETFs, BDRs, opções e demais derivativos.

**Adiado para fase futura:** renda fixa (CDB, LCI/LCA, Tesouro Direto). Os requisitos e regras correspondentes estão preservados na seção 9.

### 1.2 Atores

| Ator | Descrição |
|---|---|
| Visitante | Usuário não autenticado; acessa apenas cadastro e login |
| Usuário | Usuário autenticado com plano gratuito |
| Assinante | Usuário com assinatura ativa; acessa projeções e recursos premium |
| Colaborador | Pessoa da equipe: mantém o cadastro de ativos e monitora a ingestão. A conta é criada pela própria equipe e entra pela Área do colaborador ([SPEC-002](specs/SPEC-002.md)) |
| Sistema | Processos automatizados de ingestão de dados |

---

## 2. Requisitos funcionais

Descrevem o que o sistema faz. Cada requisito é uma capacidade verificável.

### 2.1 Autenticação e conta

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF01 | Permitir cadastro de usuário com e-mail e senha | Visitante | Must |
| RF02 | Autenticar usuário e manter sessão com renovação automática de token | Visitante | Must |
| RF03 | Permitir recuperação de senha por e-mail | Visitante | Should |
| RF04 | Permitir desbloqueio da aplicação por biometria do sistema operacional | Usuário | Could |
| RF05 | Permitir edição dos dados de perfil | Usuário | Should |
| RF06 | Permitir exportação e exclusão dos dados pessoais | Usuário | Must |
| RF41 | Permitir entrar com conta Google, só para usuários ([DA24](adr/DA24-login-com-google.md)) | Visitante | Should |
| RF42 | Oferecer login próprio para colaboradores (Área do colaborador); contas de colaborador são criadas só pela equipe ([SPEC-002](specs/SPEC-002.md)) | Colaborador | Must |
| RF43 | Confirmar o e-mail com um código enviado a ele: no cadastro com e-mail e senha (a conta só é liberada depois) e na troca de e-mail ([SPEC-039](specs/SPEC-039.md)) | Visitante | Should |
| RF44 | Permitir ao colaborador ver o app como um usuário (Visão do usuário), com carteiras de teste da própria conta; nunca as carteiras de outras contas ([SPEC-045](specs/SPEC-045.md)) | Colaborador | Could |

### 2.2 Ativos e dados de mercado

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF07 | Consultar ativos por ticker, nome, classe (Ação ou FII), setor (ações) ou segmento (FIIs) | Usuário | Must |
| RF08 | Exibir ficha do ativo com histórico de cotações | Usuário | Must |
| RF09 | Importar cotações diárias e históricas de fonte externa | Sistema | Must |
| RF10 | Importar a série diária do CDI, usada como benchmark | Sistema | Should |

### 2.3 Carteira e simulação

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF11 | Criar, renomear e excluir carteiras de simulação, escolhendo na criação o tipo: ao vivo ou histórica ([DA17](adr/DA17-carteira-ao-vivo-e-historica.md)) | Usuário | Must |
| RF12 | Registrar transações de compra e venda de ativos | Usuário | Must |
| RF13 | Registrar aportes e retiradas de caixa | Usuário | Must |
| RF14 | Calcular posição consolidada e preço médio por ativo | Sistema | Must |
| RF15 | Calcular rentabilidade da carteira em período selecionado | Sistema | Must |
| RF16 | Comparar rentabilidade da carteira com benchmarks (CDI, IBOV) | Sistema | Should |
| RF17 | Exibir evolução patrimonial em gráfico | Usuário | Must |
| RF18 | Exibir distribuição da carteira por classe (Ações e FIIs) e por setor (ações) ou segmento (FIIs) | Usuário | Should |
| RF19 | Comparar duas ou mais carteiras lado a lado | Usuário | Could |
| RF20 | Criar uma carteira a partir de outra, com o mesmo tipo e o mesmo início, copiando os aportes e retiradas ou todos os lançamentos (na histórica, até uma data), para montar e comparar cenários; cada carteira fica salva e é reaberta pela lista (RF11) ([SPEC-023](specs/SPEC-023.md)) | Usuário | Should |
| RF21 | Importar dados financeiros de arquivo externo | Usuário | Could |
| RF22 | Exportar relatório da carteira em PDF | Usuário | Could |

### 2.4 Renda fixa

Adiada para fase futura. RF23, RF24 e RF25 estão preservados na seção 9.

### 2.5 Notícias

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF26 | Coletar notícias de fontes econômicas | Sistema | Could |
| RF27 | Vincular notícias aos ativos mencionados | Sistema | Could |
| RF28 | Classificar sentimento das notícias | Sistema | Could |
| RF29 | Exibir notícias relacionadas na ficha do ativo | Usuário | Could |
| RF45 | Escolher quais fontes de notícias acompanhar e definir a prioridade (alta, média ou baixa) de cada uma | Usuário | Could |
| RF46 | Adicionar e remover feeds RSS ou Atom próprios, até 10 por usuário | Usuário | Could |
| RF47 | Consultar as notícias das suas fontes com filtros por ativo, setor, período, sentimento e fonte | Usuário | Could |

### 2.6 Projeção e assinatura

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF30 | Exibir, na ficha do ativo, cenários de queda, estabilidade e alta a partir dos pregões passados com sentimento semelhante, com a taxa-base e o número de ocorrências | Usuário | Could |
| RF31 | Calcular o sentimento de cada pregão do ativo a partir das notícias classificadas e as probabilidades condicionais dos cenários | Sistema | Could |
| RF32 | Gerenciar planos e assinaturas do usuário | Usuário | Should |
| RF33 | Bloquear recursos premium para usuários sem assinatura ativa | Sistema | Should |

### 2.7 Aplicação e notificações

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF35 | Enviar notificação de variação relevante em ativo da carteira | Sistema | Could |
| RF36 | Permitir consulta da carteira sem conexão, com dados em cache local | Usuário | Should |
| RF37 | Ao restabelecer a conexão, atualizar os dados guardados no computador, trazendo do servidor só o que mudou | Sistema | Should |
| RF38 | Permitir alternância de idioma entre português e inglês | Usuário | Could |

### 2.8 Administração

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF39 | Cadastrar e manter ativos disponíveis na plataforma | Colaborador | Should |
| RF40 | Exibir status e falhas dos jobs de ingestão | Colaborador | Could |

---

## 3. Requisitos não funcionais

Descrevem com que qualidade o sistema opera.

| ID | Requisito | Categoria |
|---|---|---|
| RNF01 | Aplicação desktop desenvolvida em Electron com React e TypeScript; API em Node.js com Fastify e TypeScript | Tecnologia |
| RNF02 | Persistência em PostgreSQL com rotina de backup diário | Tecnologia |
| RNF03 | Cache de cotações em Redis, na camada de API | Desempenho |
| RNF04 | Interface adaptável a diferentes resoluções e ao redimensionamento da janela | Usabilidade |
| RNF05 | Suporte a Windows 10 ou superior, macOS 12 ou superior e Linux | Compatibilidade |
| RNF06 | Tempo de resposta do painel inferior a 2 segundos com até 50 ativos | Desempenho |
| RNF07 | Senhas armazenadas com função de hash (argon2 ou bcrypt) | Segurança |
| RNF08 | Tokens de autenticação em armazenamento seguro do sistema operacional | Segurança |
| RNF09 | Comunicação exclusivamente por HTTPS | Segurança |
| RNF10 | Limitação de taxa nas rotas de autenticação | Segurança |
| RNF11 | Conformidade com a LGPD: consentimento registrado e direito de exclusão | Legal |
| RNF12 | Valores monetários em tipo decimal no banco e na aplicação, nunca ponto flutuante | Confiabilidade |
| RNF13 | Falha de fonte externa não interrompe a aplicação; degradação com dados em cache | Confiabilidade |
| RNF14 | Aplicação funcional em modo leitura sem conexão | Confiabilidade |
| RNF15 | Registro de auditoria das operações de transação | Auditoria |
| RNF16 | Cobertura de testes automatizados nos módulos de cálculo financeiro | Manutenibilidade |
| RNF17 | Migrations de banco versionadas e reversíveis | Manutenibilidade |
| RNF18 | Contraste e navegação conforme WCAG nível AA básico | Acessibilidade |
| RNF19 | Sincronização incremental para reduzir o volume de dados trafegados | Desempenho |
| RNF20 | Suporte a múltiplos idiomas na interface | Internacionalização |
| RNF21 | Disponibilidade alvo de 95% | Disponibilidade |

---

## 4. Regras de negócio

Restrições do domínio, independentes de tecnologia.

### 4.1 Acesso e propriedade

| ID | Regra |
|---|---|
| RB01 | O e-mail de cadastro é único e identifica o usuário no sistema |
| RB02 | Toda carteira pertence obrigatoriamente a um único usuário |
| RB03 | O usuário acessa apenas as próprias carteiras |
| RB04 | Dados do usuário são removidos em até 30 dias após pedido de exclusão |
| RB23 | Conta criada com e-mail e senha só é liberada depois de o e-mail ser confirmado; contas não confirmadas são apagadas 7 dias após o cadastro |

### 4.2 Transações (Simulação)

| ID | Regra |
|---|---|
| RB05 | Não é permitida compra sem saldo suficiente em caixa |
| RB06 | Não é permitida venda de quantidade superior à posição atual |
| RB07 | Na carteira ao vivo, a transação usa a última cotação disponível para o plano do usuário, que precisa ser do próprio dia, e guarda o horário e o nível dessa cotação; na carteira histórica, usa o fechamento do pregão da data escolhida |
| RB08 | Transação registrada é imutável; correção ocorre por lançamento de estorno |
| RB09 | A posição é sempre derivada do histórico de transações, nunca editada diretamente |
| RB10 | O preço médio é recalculado na compra e não se altera na venda |
| RB11 | Não há compra nem venda em dias sem pregão; na carteira histórica, nenhum lançamento (nem aporte ou retirada) tem data em dia sem pregão. Aporte e retirada na carteira ao vivo podem ser feitos em qualquer dia |
| RB12 | Não é permitido lançamento com data futura |
| RB13 | Valores monetários usam duas casas decimais com arredondamento meio para cima |
| RB20 | Custos de operação (corretagem, emolumentos da B3 e taxa de custódia) não são considerados no preço médio, no caixa nem na rentabilidade |
| RB21 | Ao registrar uma compra ou venda de ações ou de FIIs, o sistema exibe aviso de que os custos de operação não são considerados na simulação |
| RB24 | O tipo da carteira (ao vivo ou histórica) é escolhido na criação e não pode ser alterado |
| RB25 | Na carteira histórica, cada lançamento tem data igual ou posterior à do último lançamento da carteira e nunca anterior à data de início dela |
| RB26 | Não é permitida retirada maior que o saldo em caixa: o caixa nunca fica negativo |
| RB27 | Ações e cotas de FII são compradas e vendidas só em quantidade inteira, de 1 a 1.000.000 por operação |
| RB28 | O estorno anula um lançamento: as contas passam a ignorá-lo, e o original fica registrado como estornado. Só é aceito se, sem o original, o caixa nunca ficar negativo e nenhuma venda passar da posição. Na carteira ao vivo, compra e venda só podem ser estornadas no dia em que foram feitas. Cada lançamento se estorna uma vez só, e estorno não se estorna |

### 4.3 Renda fixa

Adiada para fase futura. RB14 a RB17 estão preservadas na seção 9.

### 4.4 Conformidade

| ID | Regra |
|---|---|
| RB18 | O sistema não emite recomendação de investimento — apenas cenários estatísticos |
| RB19 | Toda tela de projeção exibe aviso de caráter educacional |

### 4.5 Ativos

| ID | Regra |
|---|---|
| RB22 | Todo ativo pertence a exatamente uma classe — Ação (incluindo units) ou FII —, definida pelo colaborador no cadastro e não alterada depois; a classe nunca é deduzida do ticker |

### 4.6 Notícias

| ID | Regra |
|---|---|
| RB29 | A fonte pai de notícias está sempre ligada, com a maior prioridade, e não pode ser desativada, removida nem trocada pelo usuário |
| RB30 | As notícias das fontes adicionadas pelos usuários nunca entram no treino nem na avaliação do modelo de sentimento, nem nos números oficiais do app |
| RB31 | Cenário com menos de 30 ocorrências exibe "dados insuficientes" em vez das porcentagens |

---

## 5. Rastreabilidade

Ligação entre regra de negócio e a estrutura de dados que a implementa.

| Regra | Implementação no modelo |
|---|---|
| RB01 | Restrição de unicidade em `Usuario.email` |
| RB23 | `Usuario.email_confirmado_em` vazio bloqueia a sessão; limpeza diária das contas não confirmadas pelo processador de tarefas |
| RB02 | Chave estrangeira obrigatória `Carteira.usuario_id` |
| RB05, RB06 | Validação na camada de serviço, sobre saldo e posição calculados |
| RB07 | Ao vivo: `Transacao` guarda o preço, o horário e o nível da cotação usada; histórica: `Transacao.data` referencia `Cotacao` (fechamento) pela mesma data |
| RB24 | `Carteira.tipo` com domínio fechado (ao vivo, histórica), preenchido na criação e sem operação de alteração (gatilho no banco) |
| RB25, RB26 | Validação na camada de serviço, sobre a data do último lançamento e o caixa calculado |
| RB27 | `Transacao.quantidade` inteira, de 1 a 1.000.000 (restrição no banco) |
| RB28 | Tabela `Estorno` ligada a um só lançamento, único (um estorno por lançamento) e sem operação de alteração; a conferência do livro sem o original fica na camada de serviço |
| RB08 | Ausência de operação de atualização em `Transacao`; tipo de lançamento de estorno |
| RB09 | Inexistência de tabela `Posicao` persistida; cálculo derivado de `Transacao` |
| RB11 | Tabela `CalendarioPregao` com dias úteis e feriados da B3 |
| RB13 | Colunas monetárias em tipo `Decimal(15,2)` |
| RB22 | `Ativo.classe` com domínio fechado (Ação, FII), preenchido no cadastro e sem operação de alteração |
| RB29 | `FonteNoticia` do tipo pai é única e sempre ativa (restrições no banco); `PreferenciaFonte` nunca aponta para ela (gatilho) |
| RB30 | `FonteNoticia.tipo` = usuário fica fora da amostra rotulada, da avaliação e das contagens do colaborador (consultas do módulo Notícias) e dos cenários |
| RB31 | Cálculo dos cenários no servidor: a célula com menos de 30 ocorrências volta sem porcentagens (`insufficient`) |

---

## 6. Restrições do projeto

| Restrição | Descrição |
|---|---|
| Prazo | Um semestre letivo |
| Equipe | Dois integrantes |
| Regulatória | A recomendação de investimento é atividade regulada pela CVM; o sistema restringe-se a fins educacionais |
| Dados | Dependência de APIs externas gratuitas, com limite de requisições |
| Financeira | Infraestrutura em camada gratuita; sem orçamento para serviços pagos |

---

## 7. Premissas e riscos

| Item | Descrição | Mitigação |
|---|---|---|
| Premissa | As APIs de cotação e do CDI permanecem gratuitas e disponíveis | Cache local e persistência do histórico |
| Risco | A relação entre sentimento de notícias e preço pode não ser estatisticamente significativa | Requisitos de notícias classificados como Could; resultado negativo é conclusão válida |
| Risco | Escopo amplo para equipe de dois integrantes | Priorização MoSCoW; entrega mínima limitada aos requisitos Must |
| Risco | Divergência entre cálculo próprio e referência de mercado | Bateria de testes com casos de referência calculados manualmente (na fase de renda fixa, também com a calculadora do Tesouro Direto) |

---

## 8. Glossário

| Termo | Definição |
|---|---|
| Ativo | Instrumento financeiro passível de aplicação |
| Posição | Quantidade de um ativo detida em uma carteira |
| Preço médio | Custo médio ponderado de aquisição de um ativo |
| Benchmark | Índice de referência para comparação de rentabilidade |
| FII | Fundo de investimento imobiliário; suas cotas são negociadas na B3 como ações |
| Classe | Grupo ao qual o ativo pertence (Ação ou FII), como nas corretoras |
| Segmento | Classificação dos FIIs por tipo de imóvel ou ativo (ex.: logística, shoppings, papel); equivale ao setor das ações |
| Unit | Certificado que representa um conjunto de ações da mesma empresa; tratado como ação |
| Backfill | Carga retroativa de dados históricos |
| Base 252 | *(renda fixa — fase futura)* Convenção brasileira de contagem de dias úteis por ano |
| IOF | *(renda fixa — fase futura)* Imposto sobre Operações Financeiras, regressivo nos primeiros 30 dias |
| Carência | *(renda fixa — fase futura)* Período mínimo antes do qual não há resgate permitido |

---

## 9. Evolução futura — renda fixa (adiada)

A equipe decidiu, em 02/10/2026, concentrar a primeira fase em ações e FIIs ([DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md)). Os itens abaixo **não fazem parte do escopo atual**, mas ficam preservados com os mesmos IDs para quando a renda fixa for incluída. Nessa fase, precisam ser revistos (ver pontos em aberto de DA22).

### 9.1 Requisitos funcionais adiados

| ID | Requisito | Ator | Prioridade original |
|---|---|---|---|
| RF23 | Cadastrar aplicação em renda fixa com indexador e vencimento | Usuário | Must |
| RF24 | Calcular rendimento bruto e líquido considerando IR e IOF | Sistema | Must |
| RF25 | Registrar resgate no vencimento ou antecipado | Usuário | Must |
| RF34 | Enviar notificação de vencimento de aplicação em renda fixa | Sistema | Could |
| — | Importar Selic e IPCA (parte original de RF10) | Sistema | Must |

### 9.2 Regras de negócio adiadas

| ID | Regra |
|---|---|
| RB14 | A rentabilidade de renda fixa usa base de 252 dias úteis |
| RB15 | Resgate antes de 30 dias aplica IOF regressivo |
| RB16 | Resgate sofre incidência de IR conforme tabela regressiva por prazo |
| RB17 | Aplicação em período de carência não pode ser resgatada antecipadamente |

### 9.3 Rastreabilidade adiada

| Regra | Implementação no modelo |
|---|---|
| RB14 | `TaxaDiaria` indexada por data útil, com contagem sobre o calendário de feriados bancários (`FeriadoBancario`), e não sobre `CalendarioPregao`: os dois calendários diferem em alguns dias (ex.: 24/12 e 31/12 não têm pregão, mas são dias úteis bancários) |
