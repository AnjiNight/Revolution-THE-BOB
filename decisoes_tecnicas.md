# Decisões Técnicas

**Projeto:** Simulador de Investimentos
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação
**Integrantes:** Luís Gustavo Sampaio Coêlho, Nicoly Araujo de Paschoa
**Versão:** 1.4 (08/10/2026 — autenticação e login com Google definidos na [SPEC-002](specs/SPEC-002.md) e na [DA24](adr/DA24-login-com-google.md), seção 4)

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
| Hash de senha | `argon2` (argon2id, parâmetros mínimos da OWASP) | RNF07 | ✅ Definida na [SPEC-002](specs/SPEC-002.md) |
| Tokens no cofre do SO | `safeStorage` do Electron | RNF08, [DA05](adr/DA05-autenticacao-propria.md) | ✅ Definida na SPEC-002. No Linux sem keyring o Electron usa o modo `basic_text` (senha fixa): o app trata isso como cofre indisponível e não grava o token em disco |
| Biometria (RF04) | `systemPreferences.promptTouchID` do Electron | RF04 | **Só funciona no macOS.** No Windows e no Linux exigiria módulos nativos. Sugestão: RF04 apenas no macOS, ou retirar do escopo |
| Cache local do cliente | SQLite (`better-sqlite3`) | [DA08](adr/DA08-cache-dois-niveis-offline-leitura.md), RF36 | Apagar no logout e na exclusão de conta |
| Validação de entrada | Esquemas JSON do Fastify ou `zod` | DA02 | — |
| Autenticação | `fast-jwt` (token de acesso HS256, 15 min) + token de renovação opaco, guardado só como hash, trocado a cada uso | DA05 | ✅ Definida na SPEC-002. Usamos o `fast-jwt` direto em vez do `@fastify/jwt`, para o domínio não depender do Fastify |
| Limite de tentativas | `@fastify/rate-limit` (10/min por IP nas rotas de `/api/auth`) | RNF10 | ✅ Definida na SPEC-002 |
| Login com Google | OAuth 2.0 com PKCE no processo principal do Electron (navegador do sistema + `127.0.0.1`); `jose` no servidor para verificar o ID token com as chaves públicas do Google | DA24, RF41 | ✅ Definida na SPEC-002. Exige um client ID "Aplicativo para computador" no Google Cloud |
| Fila e agendador de tarefas | `BullMQ` (sobre o Redis) ou `pg-boss` (sobre o PostgreSQL) | [DA07](adr/DA07-ingestao-assincrona.md), [DA14](adr/DA14-registro-execucoes-logs.md) | O `pg-boss` evita depender do Redis para as tarefas |
| Gráfico de preço com notícias | TradingView Lightweight Charts | Gráfico Notícias × Preço (Visão §19) | Permite marcadores no eixo do tempo |
| Gráficos de carteira | Recharts | RF17, RF18 | — |
| Internacionalização | `i18next` | RNF20, RF38 | — |
| Fonte da interface | Geist (`@fontsource-variable/geist`, licença OFL) | Legibilidade e identidade visual das telas (redesign do login, SPEC-002) | ✅ Definida. Empacotada no app: a CSP (`default-src 'self'`) bloqueia fontes externas e o app precisa funcionar sem internet |
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

---

## 6. Ferramentas de desenvolvimento (definidas na [SPEC-001](specs/SPEC-001.md))

| Tema | Escolha | Status | Motivo |
|---|---|---|---|
| Versão do Node.js | 22 LTS (`.nvmrc`) | Definida | Versão LTS compatível com todas as bibliotecas escolhidas |
| Organização do repositório | npm workspaces: `app/`, `api/`, `packages/shared/` | Definida | Sem ferramenta extra; evita incompatibilidades do pnpm com o empacotamento do Electron |
| Build do app | electron-vite 5 + Vite 7 | Definida | Separa processo principal, *preload* e interface |
| Linguagem | TypeScript 6.0, modo estrito, ESM | Definida | O TypeScript 7 ainda não é suportado pelo typescript-eslint |
| Lint e formatação | ESLint 10 + typescript-eslint + Prettier | Definida | Configuração única na raiz |
| Testes | Vitest 5, um projeto por pacote | Definida | Mesma ferramenta nos três pacotes |
| Banco local | Docker Compose com PostgreSQL 16 | Definida | Mesmo ambiente para os dois integrantes |
| ORM | Prisma 7 com adaptador `pg` | Definida | Já era a escolha da equipe; a versão 7 exige o adaptador |
| Migrações reversíveis | `down.sql` escrito à mão + `npm run db:rollback` | Definida | O Prisma não gera reversão (RNF17, OPEN-39) |
| Configuração do servidor | Variáveis de ambiente validadas com `zod` | Definida | O servidor não inicia com configuração inválida |
| Logs | `pino` (integrado ao Fastify), JSON, com campos sensíveis ocultos | Definida | DA14 |
| Textos da interface | `i18next` + `react-i18next`, português e inglês | Definida | RNF20 desde o início |
| Empacotamento | `electron-builder` (Windows, macOS, Linux) | Definida | RNF05; geração manual por sistema operacional |
| Integração contínua | GitHub Actions: formatação, lint, tipos, testes, build e ciclo de migração | Definida | Roda em todo Pull Request |
| Idioma do código | Identificadores e rotas em inglês; tabelas e colunas do banco em português (`snake_case`) | Definida | O banco segue a documentação de Modelagem de Dados |
| Comunicação app ↔ servidor | Feita pelo processo principal do Electron; a interface só acessa `window.api` | Definida | A interface não tem acesso à rede nem ao Node; dispensa CORS no servidor |

**Alertas de segurança conhecidos (08/10/2026):** o `npm audit` aponta vulnerabilidades em dependências das ferramentas `prisma` (CLI) e `electron-builder`, usadas só no desenvolvimento e no empacotamento; nenhuma está no código que roda no servidor ou no app. Reavaliar ao atualizar essas ferramentas.
