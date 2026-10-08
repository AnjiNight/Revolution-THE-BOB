# Decisões Técnicas

**Projeto:** Simulador de Investimentos
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação
**Integrantes:** Luís Gustavo Sampaio Coêlho, Nicoly Araujo de Paschoa
**Versão:** 1.1 (02/10/2026 — escopo inicial em ações e FIIs; fontes de renda fixa adiadas por [DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md))

---

## 1. Objetivo

O [Documento de Arquitetura](arquitetura.md) e os [ADRs](adr/README.md) são **independentes de tecnologia**: falam em "banco relacional", "cache em memória", "aplicação desktop". Este documento faz o mapeamento para as **tecnologias, bibliotecas, serviços e fontes de dados concretos**, com o motivo de cada escolha.

Cada item tem um status:

| Status | Significado |
|---|---|
| **Definida** | Escolhida pela equipe (README, RNF01–RNF03) |
| **Sugerida** | Proposta neste documento; precisa ser confirmada pela equipe |
| **Em aberto** | Ainda sem escolha |
| **Bloqueada** | Escolhida, mas depende de algo externo para ser usada |

---

## 2. Stack principal

| Camada | Tecnologia | Status | Por quê | Alternativas consideradas | Atenção |
|---|---|---|---|---|---|
| Aplicação desktop | **Electron + React + TypeScript** | Definida | Uma base de código para Windows, macOS e Linux ([DA03](adr/DA03-cliente-desktop-multiplataforma.md)); ecossistema web amplo; acesso a recursos do SO | Tauri (mais leve, mas parte nativa em Rust); app web (descartado em DA03) | Instaladores grandes; recursos do SO variam entre sistemas (seção 4) |
| API | **Node.js + Fastify + TypeScript** | Definida | Mesma linguagem do cliente, com tipos compartilhados entre cliente e servidor; Fastify é rápido e valida entrada por esquema | Express (mais simples, menos estrutura); NestJS (mais estrutura, curva maior) | O Fastify não impõe organização: as camadas de [DA02](adr/DA02-camadas-mvc.md) precisam ser montadas pela equipe |
| Banco de dados | **PostgreSQL** | Definida | Relacional ([DA04](adr/DA04-banco-relacional.md)); tipo `numeric` exato (RNF12); `jsonb` para metadados de notícias; índices únicos para séries temporais | MySQL; SQLite (sem servidor, inadequado para vários usuários) | — |
| ORM | **Prisma** | Definida | Esquema tipado, migrações versionadas, suporte a `Decimal` | TypeORM, Drizzle, Knex | O **Prisma Migrate não gera migrações de reversão** automaticamente. O RNF17 exige migrações reversíveis: escrever os scripts de reversão à mão ou ajustar o RNF17 |
| Cache | **Redis** | Definida | Cache do servidor ([DA08](adr/DA08-cache-dois-niveis-offline-leitura.md)); pode também servir de fila de tarefas | Cache em memória do próprio processo (perdido a cada reinício e não compartilhado com o processador de tarefas) | Planos gratuitos de Redis têm limite de memória e de conexões |

---

## 3. Fontes de dados

| Dado | Fonte | Usado em | Status | Limitações |
|---|---|---|---|---|
| Cotações de ações e FIIs durante o pregão (plano gratuito) | **brapi**, plano gratuito | [DA16](adr/DA16-cotacoes-por-plano.md) | Definida | Atraso de ~30 min; 15.000 requisições/mês; 1 ticker por chamada; 3 meses de histórico; confirmar a cobertura dos FIIs do catálogo |
| Cotações de ações e FIIs (plano assinante) | **brapi** Startup ou Pro, ou outro provedor pago | DA16 | Em aberto | Pago; atraso de 15 ou 5 min; quem paga? |
| Histórico diário de ações e FIIs | **Séries históricas da B3 (COTAHIST)** | [DA18](adr/DA18-historico-cotacoes-arquivos-b3.md) | Sugerida | Arquivos grandes, formato posicional; preços não ajustados |
| Proventos e eventos corporativos | — | [DA17](adr/DA17-carteira-ao-vivo-e-historica.md), [DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md) | Em aberto | Necessário para a carteira histórica e, principalmente, para os rendimentos mensais dos FIIs |
| Ibovespa (benchmark, RF16) | brapi para o recente; histórico a definir | RF16 | Em aberto | Verificar a disponibilidade do índice no plano gratuito |
| IFIX (benchmark de FIIs — evolução, [DA23](adr/DA23-classes-de-ativo-acoes-e-fiis.md)) | A definir | — | Adiada | Mesma pendência de fonte histórica do Ibovespa |
| CDI (diário, benchmark) | **API SGS do Banco Central** | RF10 | Definida | — |
| Calendário de pregão | Calendário publicado pela B3 | RB11 | Sugerida | Revisão manual anual |
| Notícias — fonte pai | **Investidor10** | [DA19](adr/DA19-fontes-de-noticias.md) | **Bloqueada** | Sem API ou feed público identificado; termos de uso restringem a uso pessoal e não comercial. Exige autorização ou troca de fonte |
| Notícias — fontes curadas | Feeds RSS de portais econômicos | DA19 | Em aberto | Lista a definir |
| Notícias — histórico para treino | GDELT, dados abertos da CVM ou arquivo da fonte pai | [DA20](adr/DA20-modelo-ia-noticias.md) | Em aberto | RSS não guarda histórico |

### 3.1 Fontes adiadas (fase de renda fixa — [DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md))

| Dado | Fonte | Usado em | Status | Limitações |
|---|---|---|---|---|
| Selic (diária), IPCA (mensal) | API SGS do Banco Central | RF10 original | Adiada | IPCA é mensal, não diário |
| Tesouro Direto | Tesouro Transparente (preços e taxas históricos) | RF23–RF25 | Adiada | Atualização diária |
| Feriados bancários (base 252) | Calendário de feriados nacionais da ANBIMA | RB14 | Adiada | Difere do calendário de pregão em alguns dias |

---

## 4. Bibliotecas e serviços sugeridos

Todos com status **Sugerida**.

| Necessidade | Sugestão | Motivo | Atenção |
|---|---|---|---|
| Aritmética decimal | `decimal.js` (já usado internamente pelo Prisma) | RNF12, RB13 | Nunca converter valores monetários para `number` |
| Hash de senha | `argon2` | RNF07 | — |
| Tokens no cofre do SO | `safeStorage` do Electron | RNF08, [DA05](adr/DA05-autenticacao-propria.md) | No Linux depende de um cofre instalado (ex.: GNOME Keyring, KWallet); sem ele a proteção é fraca. A biblioteca `keytar`, antes comum, não é mais mantida |
| Biometria (RF04) | `systemPreferences.promptTouchID` do Electron | RF04 | **Só funciona no macOS.** No Windows e no Linux exigiria módulos nativos. Sugestão: RF04 apenas no macOS, ou retirar do escopo |
| Cache local do cliente | SQLite (`better-sqlite3`) | [DA08](adr/DA08-cache-dois-niveis-offline-leitura.md), RF36 | Apagar no logout e na exclusão de conta |
| Validação de entrada | Esquemas JSON do Fastify ou `zod` | DA02 | — |
| Autenticação | `@fastify/jwt` + tokens de renovação guardados no banco | DA05 | Permitir revogar tokens de renovação |
| Limite de tentativas | `@fastify/rate-limit` | RNF10 | — |
| Fila e agendador de tarefas | `BullMQ` (sobre o Redis) ou `pg-boss` (sobre o PostgreSQL) | [DA07](adr/DA07-ingestao-assincrona.md), [DA14](adr/DA14-registro-execucoes-logs.md) | O `pg-boss` evita depender do Redis para as tarefas |
| Gráfico de preço com notícias | TradingView Lightweight Charts | Gráfico Notícias × Preço (Visão §19) | Permite marcadores no eixo do tempo |
| Gráficos de carteira | Recharts | RF17, RF18 | — |
| Internacionalização | `i18next` | RNF20, RF38 | — |
| Testes | Vitest | RNF16, QA10 | — |
| Empacotamento | `electron-builder` | RNF05 | Um instalador por sistema operacional |
| Logs estruturados | `pino` (já integrado ao Fastify) | DA14 | Nunca registrar senhas e tokens |

---

## 5. Em aberto

| Item | Opções | Critérios | Relacionado |
|---|---|---|---|
| Hospedagem (servidor, processador de tarefas, PostgreSQL com backup diário, Redis) | Provedores com camada gratuita | Processador de tarefas sempre ligado durante o pregão; **backup diário** (RNF02); servidor que não hiberne durante o pregão | RES03, RNF02, RNF21 |
| Serviço de e-mail (recuperação de senha) | Provedores com camada gratuita | Volume pequeno | RF03 |
| Implementação do modelo de IA | API de modelo de linguagem (custo por notícia) × modelo aberto em português ajustado localmente × combinação | Custo zero, qualidade em português financeiro, hardware disponível para treino | [DA20](adr/DA20-modelo-ia-noticias.md) |
| Provedor de cotações do assinante e quem paga | brapi Startup/Pro; chave gratuita na versão acadêmica | Custo, termos de redistribuição | [DA16](adr/DA16-cotacoes-por-plano.md) |
| Fonte pai de notícias | Investidor10 com autorização × fatos relevantes da CVM (dados abertos) | Licença de uso, histórico disponível | [DA19](adr/DA19-fontes-de-noticias.md) |
