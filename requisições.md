# Especificação de Requisitos

**Projeto:** Simulador de Investimentos
**Disciplina:** Modelagem de Dados — Universidade Presbiteriana Mackenzie
**Integrantes:** Luís Gustavo Sampaio Coêlho, Nicoly Paschoa
**Versão:** 1.0

---

## 1. Visão geral

Aplicativo mobile que permite ao usuário montar carteiras de investimento fictícias com ativos reais do mercado brasileiro — ações da B3 e renda fixa — e acompanhar a rentabilidade dessas carteiras usando cotações e indexadores verdadeiros, sem que exista dinheiro real envolvido.

O sistema também coleta notícias econômicas e avalia se o sentimento extraído delas guarda relação mensurável com a variação de preço dos ativos.

### 1.1 Escopo

**Dentro do escopo:** ações da B3, renda fixa (CDB, LCI/LCA, Tesouro Direto), simulação de carteira, comparação com benchmarks, ingestão de cotações e indexadores, coleta e classificação de notícias, projeção de cenários, assinatura com pagamento simulado.

**Fora do escopo:** execução de ordens reais, integração com corretora, pagamento real, mercados internacionais, recomendação personalizada de investimento.

### 1.2 Atores

| Ator | Descrição |
|---|---|
| Visitante | Usuário não autenticado; acessa apenas cadastro e login |
| Usuário | Usuário autenticado com plano gratuito |
| Assinante | Usuário com assinatura ativa; acessa projeções e recursos premium |
| Administrador | Mantém cadastro de ativos e monitora jobs de ingestão |
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
| RF04 | Permitir desbloqueio do aplicativo por biometria | Usuário | Could |
| RF05 | Permitir edição dos dados de perfil | Usuário | Should |
| RF06 | Permitir exportação e exclusão dos dados pessoais | Usuário | Must |

### 2.2 Ativos e dados de mercado

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF07 | Consultar ativos por ticker, nome ou setor | Usuário | Must |
| RF08 | Exibir ficha do ativo com histórico de cotações | Usuário | Must |
| RF09 | Importar cotações diárias e históricas de fonte externa | Sistema | Must |
| RF10 | Importar taxas de indexadores (CDI, Selic, IPCA) | Sistema | Must |

### 2.3 Carteira e simulação

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF11 | Criar, renomear e excluir carteiras de simulação | Usuário | Must |
| RF12 | Registrar transações de compra e venda de ativos | Usuário | Must |
| RF13 | Registrar aportes e retiradas de caixa | Usuário | Must |
| RF14 | Calcular posição consolidada e preço médio por ativo | Sistema | Must |
| RF15 | Calcular rentabilidade da carteira em período selecionado | Sistema | Must |
| RF16 | Comparar rentabilidade da carteira com benchmarks (CDI, IBOV) | Sistema | Should |
| RF17 | Exibir evolução patrimonial em gráfico | Usuário | Must |
| RF18 | Exibir distribuição da carteira por classe e setor | Usuário | Should |
| RF19 | Comparar duas ou mais carteiras lado a lado | Usuário | Could |
| RF20 | Salvar e recuperar simulações anteriores | Usuário | Should |
| RF21 | Importar dados financeiros de arquivo externo | Usuário | Could |
| RF22 | Exportar relatório da carteira em PDF | Usuário | Could |

### 2.4 Renda fixa

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF23 | Cadastrar aplicação em renda fixa com indexador e vencimento | Usuário | Must |
| RF24 | Calcular rendimento bruto e líquido considerando IR e IOF | Sistema | Must |
| RF25 | Registrar resgate no vencimento ou antecipado | Usuário | Must |

### 2.5 Notícias

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF26 | Coletar notícias de fontes econômicas | Sistema | Could |
| RF27 | Vincular notícias aos ativos mencionados | Sistema | Could |
| RF28 | Classificar sentimento das notícias | Sistema | Could |
| RF29 | Exibir notícias relacionadas na ficha do ativo | Usuário | Could |

### 2.6 Projeção e assinatura

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF30 | Gerar projeções de cenários futuros para a carteira | Assinante | Could |
| RF31 | Ajustar projeção considerando sentimento das notícias | Sistema | Could |
| RF32 | Gerenciar planos e assinaturas do usuário | Usuário | Should |
| RF33 | Bloquear recursos premium para usuários sem assinatura ativa | Sistema | Should |

### 2.7 Aplicativo e notificações

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF34 | Enviar notificação de vencimento de aplicação em renda fixa | Sistema | Could |
| RF35 | Enviar notificação de variação relevante em ativo da carteira | Sistema | Could |
| RF36 | Permitir consulta da carteira sem conexão, com dados em cache local | Usuário | Should |
| RF37 | Sincronizar dados pendentes ao restabelecer conexão | Sistema | Should |
| RF38 | Permitir alternância de idioma entre português e inglês | Usuário | Could |

### 2.8 Administração

| ID | Requisito | Ator | Prioridade |
|---|---|---|---|
| RF39 | Cadastrar e manter ativos disponíveis na plataforma | Administrador | Should |
| RF40 | Exibir status e falhas dos jobs de ingestão | Administrador | Could |

---

## 3. Requisitos não funcionais

Descrevem com que qualidade o sistema opera.

| ID | Requisito | Categoria |
|---|---|---|
| RNF01 | Aplicativo desenvolvido em React Native (Expo); API em Node.js com Fastify e TypeScript | Tecnologia |
| RNF02 | Persistência em PostgreSQL com rotina de backup diário | Tecnologia |
| RNF03 | Cache de cotações em Redis, na camada de API | Desempenho |
| RNF04 | Interface adaptável a diferentes tamanhos de tela e orientações | Usabilidade |
| RNF05 | Suporte a Android 8 ou superior e iOS 14 ou superior | Compatibilidade |
| RNF06 | Tempo de resposta do painel inferior a 2 segundos com até 50 ativos | Desempenho |
| RNF07 | Senhas armazenadas com função de hash (argon2 ou bcrypt) | Segurança |
| RNF08 | Tokens de autenticação em armazenamento seguro do sistema operacional | Segurança |
| RNF09 | Comunicação exclusivamente por HTTPS | Segurança |
| RNF10 | Limitação de taxa nas rotas de autenticação | Segurança |
| RNF11 | Conformidade com a LGPD: consentimento registrado e direito de exclusão | Legal |
| RNF12 | Valores monetários em tipo decimal no banco e na aplicação, nunca ponto flutuante | Confiabilidade |
| RNF13 | Falha de fonte externa não interrompe a aplicação; degradação com dados em cache | Confiabilidade |
| RNF14 | Aplicativo funcional em modo leitura sem conexão | Confiabilidade |
| RNF15 | Registro de auditoria das operações de transação | Auditoria |
| RNF16 | Cobertura de testes automatizados nos módulos de cálculo financeiro | Manutenibilidade |
| RNF17 | Migrations de banco versionadas e reversíveis | Manutenibilidade |
| RNF18 | Contraste e navegação conforme WCAG nível AA básico | Acessibilidade |
| RNF19 | Sincronização incremental para consumo controlado de dados móveis | Desempenho |
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

### 4.2 Transações

| ID | Regra |
|---|---|
| RB05 | Não é permitida compra sem saldo suficiente em caixa |
| RB06 | Não é permitida venda de quantidade superior à posição atual |
| RB07 | A transação utiliza a cotação da data do lançamento, não a data atual |
| RB08 | Transação registrada é imutável; correção ocorre por lançamento de estorno |
| RB09 | A posição é sempre derivada do histórico de transações, nunca editada diretamente |
| RB10 | O preço médio é recalculado na compra e não se altera na venda |
| RB11 | Não há movimentação em dias sem pregão |
| RB12 | Não é permitido lançamento com data futura |
| RB13 | Valores monetários usam duas casas decimais com arredondamento meio para cima |

### 4.3 Renda fixa

| ID | Regra |
|---|---|
| RB14 | A rentabilidade de renda fixa usa base de 252 dias úteis |
| RB15 | Resgate antes de 30 dias aplica IOF regressivo |
| RB16 | Resgate sofre incidência de IR conforme tabela regressiva por prazo |
| RB17 | Aplicação em período de carência não pode ser resgatada antecipadamente |

### 4.4 Assinatura

| ID | Regra |
|---|---|
| RB18 | Projeções são exclusivas de usuários com assinatura ativa |
| RB19 | O plano gratuito permite no máximo duas carteiras |
| RB20 | O cancelamento mantém o acesso até o fim do período pago |
| RB21 | Simulações já geradas permanecem acessíveis após o fim da assinatura |

### 4.5 Conformidade

| ID | Regra |
|---|---|
| RB22 | O sistema não emite recomendação de investimento — apenas cenários estatísticos |
| RB23 | Toda tela de projeção exibe aviso de caráter educacional |

---

## 5. Rastreabilidade

Ligação entre regra de negócio e a estrutura de dados que a implementa.

| Regra | Implementação no modelo |
|---|---|
| RB01 | Restrição de unicidade em `Usuario.email` |
| RB02 | Chave estrangeira obrigatória `Carteira.usuario_id` |
| RB05, RB06 | Validação na camada de serviço, sobre saldo e posição calculados |
| RB07 | `Transacao.data` referencia `Cotacao` pela mesma data |
| RB08 | Ausência de operação de atualização em `Transacao`; tipo de lançamento de estorno |
| RB09 | Inexistência de tabela `Posicao` persistida; cálculo derivado de `Transacao` |
| RB11 | Tabela `CalendarioPregao` com dias úteis e feriados da B3 |
| RB13 | Colunas monetárias em tipo `Decimal(15,2)` |
| RB14 | `TaxaDiaria` indexada por data útil, com contagem sobre `CalendarioPregao` |
| RB19 | Contagem de `Carteira` validada contra `Plano.limite_carteiras` |

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
| Premissa | As APIs de cotação e indexadores permanecem gratuitas e disponíveis | Cache local e persistência do histórico |
| Risco | A relação entre sentimento de notícias e preço pode não ser estatisticamente significativa | Requisitos de notícias classificados como Could; resultado negativo é conclusão válida |
| Risco | Escopo amplo para equipe de dois integrantes | Priorização MoSCoW; entrega mínima limitada aos requisitos Must |
| Risco | Divergência entre cálculo próprio e referência de mercado | Bateria de testes comparando com calculadora do Tesouro Direto |

---

## 8. Glossário

| Termo | Definição |
|---|---|
| Ativo | Instrumento financeiro passível de aplicação |
| Posição | Quantidade de um ativo detida em uma carteira |
| Preço médio | Custo médio ponderado de aquisição de um ativo |
| Benchmark | Índice de referência para comparação de rentabilidade |
| Base 252 | Convenção brasileira de contagem de dias úteis por ano |
| IOF | Imposto sobre Operações Financeiras, regressivo nos primeiros 30 dias |
| Carência | Período mínimo antes do qual não há resgate permitido |
| Backfill | Carga retroativa de dados históricos |
