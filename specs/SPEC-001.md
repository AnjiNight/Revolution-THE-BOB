# SPEC-001 — Esqueleto executável cliente–servidor–processador

| Campo | Conteúdo |
|---|---|
| Status | Em implementação — iniciada em 08/10/2026 a pedido do Luís; revisar com a equipe no Pull Request |
| Fase | 0 — Fundação ([mapa de specs](mapa_specs.md)) |
| Prioridade | Técnica (habilita os requisitos *Must*) |
| Depende de | — |
| Requisitos | RNF01, RNF02, RNF04, RNF05, RNF09, RNF17, RNF20, RNF21 |
| Drivers | OBJ04, RES01–RES03, RES06, RES09, QA14, PA01 |
| ADRs | [DA01](../adr/DA01-cliente-servidor-monolito-modular.md), [DA02](../adr/DA02-camadas-mvc.md), [DA03](../adr/DA03-cliente-desktop-multiplataforma.md), [DA04](../adr/DA04-banco-relacional.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA14](../adr/DA14-registro-execucoes-logs.md) |

---

## 1. Objetivo

Criar a estrutura executável sobre a qual todas as outras Specs serão construídas:

- uma **aplicação desktop** (Electron + React + TypeScript) que mostra se o servidor está acessível;
- um **servidor** (Node.js + Fastify + TypeScript) organizado como monólito modular em camadas, com logs estruturados;
- um **processador de tarefas** que é o **mesmo código** do servidor, iniciado em outro modo;
- um **banco PostgreSQL** com migrações versionadas e **reversíveis**;
- ferramentas comuns de qualidade: lint, formatação, verificação de tipos, testes e integração contínua.

Esta Spec **não** entrega nenhuma funcionalidade de negócio.

## 2. Valor

- **Equipe:** base comum, com padrões definidos antes da primeira funcionalidade.
- **Projeto:** valida cedo a portabilidade (RNF05), o canal cifrado (RNF09) e as migrações reversíveis (RNF17).

## 3. Escopo

### 3.1 Inclui

1. Repositório organizado como **monorepo com npm workspaces**:

   ```
   app/        Aplicação desktop (Electron + React)
   api/        Servidor e processador de tarefas (Fastify)
   packages/
     shared/   Tipos e contratos compartilhados entre app e api
   specs/ adr/ *.md   Documentação (já existente)
   ```

2. **Servidor (`api/`)**
   - Configuração lida de variáveis de ambiente e **validada na inicialização**. Configuração inválida impede o processo de iniciar, com mensagem clara.
   - Dois modos de execução do mesmo código: `server` (atende requisições) e `worker` (processador de tarefas).
   - Rota `GET /api/health`, que informa a situação do servidor e do banco.
   - Logs estruturados em JSON, sem senhas, tokens nem cabeçalhos de autorização.
   - Tratamento de erros que **nunca** devolve detalhes técnicos ao cliente (arquitetura §10).
   - Cabeçalhos de segurança HTTP.
   - Encerramento gracioso ao receber sinal de término.
   - Organização em camadas (DA02): `modules/<módulo>/{controllers,application,domain,infrastructure}`.

3. **Processador de tarefas (modo `worker`)**
   - Inicia, verifica o banco e registra um *heartbeat* periódico no log.
   - Roda como processo separado: se ele parar, o servidor continua atendendo (arquitetura §5).
   - A biblioteca de agendamento de tarefas será escolhida na primeira tarefa real (SPEC-008).

4. **Banco de dados**
   - PostgreSQL 16, acessado pelo Prisma.
   - Migração inicial vazia (*baseline*).
   - **Convenção de reversão (resolve a OPEN-39):** toda pasta de migração tem, além do `migration.sql` gerado pelo Prisma, um `down.sql` escrito à mão. O comando `db:rollback` desfaz a última migração aplicada. Um teste verifica que toda migração tem `down.sql`.
   - `docker-compose.yml` com PostgreSQL para o ambiente local.

5. **Aplicação desktop (`app/`)**
   - Processo principal, *preload* e interface separados, com isolamento de contexto ligado e sem acesso direto do código da interface ao Node.
   - Tela inicial que consulta `GET /api/health` e mostra: "Servidor conectado", "Servidor com problemas no banco" ou "Servidor indisponível".
   - Endereço do servidor configurável. **Só aceita HTTPS**; HTTP é aceito apenas para `localhost` em desenvolvimento (RNF09).
   - Todos os textos vêm de arquivos de idioma (português e inglês) desde o início (RNF20); nenhum texto fixo nas telas.
   - Layout que se adapta ao tamanho da janela (RNF04).
   - Configuração de empacotamento para Windows, macOS e Linux (RNF05).

6. **Qualidade**
   - TypeScript em modo estrito nos três pacotes.
   - ESLint e Prettier com configuração única.
   - Testes com Vitest.
   - GitHub Actions executando lint, verificação de tipos, testes, build e o ciclo de migração (aplicar → reverter → aplicar) em todo Pull Request.

### 3.2 Não inclui

- Qualquer entidade de negócio, autenticação ou tela além da tela inicial (a partir da SPEC-002).
- Cache em memória no servidor e cache local offline (SPEC-009, SPEC-032).
- Agendamento real de tarefas (SPEC-008).
- Hospedagem (OPEN-02): tudo roda localmente nesta Spec.
- Instaladores publicados: o empacotamento fica configurado, mas a geração por sistema operacional é manual.

## 4. Decisões técnicas tomadas nesta Spec

| Tema | Decisão | Motivo |
|---|---|---|
| Monorepo | npm workspaces | Sem ferramenta extra; evita incompatibilidades conhecidas do pnpm com o empacotamento do Electron |
| Build do app | electron-vite | Separa processo principal, *preload* e interface com o Vite, já configurado para Electron |
| Versões | Node.js 22 LTS; TypeScript 6.0; Electron 44; Vite 7; React 19; Fastify 5; Prisma 7; Vitest 5; ESLint 10 | Versões estáveis e compatíveis entre si em 08/10/2026 |
| Módulos JavaScript | ESM em todos os pacotes | Padrão atual do Node e do Vite |
| Idioma do código | Identificadores e rotas em inglês; **tabelas e colunas do banco em português**, em `snake_case`, iguais ao modelo de dados | O código segue o padrão das bibliotecas; o banco segue a documentação de Modelagem de Dados |
| Migrações reversíveis | `down.sql` manual + comando `db:rollback` | O Prisma não gera reversão (OPEN-39) |
| Banco local | Docker Compose com PostgreSQL 16 | Mesmo ambiente para os dois integrantes |
| HTTPS | Em produção, o servidor fica atrás de um proxy com TLS; o app recusa HTTP fora de `localhost` | RNF09 sem exigir certificado no desenvolvimento |

## 5. Comportamento esperado

### 5.1 `GET /api/health`

| Situação | Código HTTP | Corpo |
|---|---|---|
| Servidor e banco funcionando | 200 | `{ "status": "ok", "version": "<versão>", "database": "ok", "timestamp": "<ISO 8601>" }` |
| Banco inacessível | 503 | `{ "status": "degraded", "version": "<versão>", "database": "unavailable", "timestamp": "<ISO 8601>" }` |

O corpo nunca contém mensagem de erro, *stack trace* ou endereço do banco.

### 5.2 Tela inicial do app

| Resposta do servidor | Mensagem exibida |
|---|---|
| 200 com `status: ok` | Servidor conectado (com a versão do servidor) |
| 503 com `status: degraded` | Servidor com problemas no banco de dados |
| Sem resposta, erro de rede ou tempo esgotado | Servidor indisponível |
| Endereço configurado inválido ou HTTP fora de `localhost` | Endereço do servidor inválido |

A tela tem um botão "Tentar novamente".

## 6. Critérios de aceitação

| ID | Critério | Como verificar |
|---|---|---|
| CA01 | `npm install` na raiz instala os três pacotes | Comando sem erros |
| CA02 | `npm run lint`, `npm run typecheck` e `npm test` passam na raiz | Comandos sem erros |
| CA03 | `npm run build` gera o servidor e o app | Comando sem erros |
| CA04 | Com o banco no ar, `GET /api/health` responde 200 com `database: ok` | Teste automatizado + manual |
| CA05 | Com o banco fora do ar, `GET /api/health` responde 503 com `database: unavailable`, sem detalhes do erro | Teste automatizado |
| CA06 | Um erro inesperado em qualquer rota devolve 500 com mensagem genérica, e o detalhe vai só para o log | Teste automatizado |
| CA07 | Os logs são JSON e ocultam `authorization`, `password` e `token` | Teste automatizado |
| CA08 | O servidor não inicia com configuração inválida (ex.: `DATABASE_URL` ausente) e explica o motivo | Teste automatizado |
| CA09 | O mesmo código inicia em modo `worker` e registra *heartbeat* sem abrir porta HTTP | Manual |
| CA10 | `db:migrate` aplica as migrações; `db:rollback` desfaz a última; aplicar de novo funciona | CI (ciclo de migração) |
| CA11 | Toda pasta de migração tem `down.sql` | Teste automatizado |
| CA12 | O app recusa endereço HTTP fora de `localhost` | Teste automatizado |
| CA13 | Português e inglês têm exatamente as mesmas chaves de texto | Teste automatizado |
| CA14 | O app abre, mostra o estado do servidor e se adapta ao redimensionar a janela | Manual, nos três sistemas operacionais quando possível |
| CA15 | O GitHub Actions executa CA02, CA03, CA10 e CA11 em todo Pull Request | Execução do workflow |

## 7. Pontos em aberto

| ID | Situação nesta Spec |
|---|---|
| OPEN-02 | Hospedagem continua em aberto; não bloqueia, pois tudo roda localmente |
| OPEN-39 | **Resolvida** pela convenção de `down.sql` (seção 4) |
| OPEN-40 | Retenção de backups e logs continua em aberto |

## 8. Verificação (08/10/2026)

| Critério | Resultado |
|---|---|
| CA01–CA03 | ✅ `npm ci`, `format:check`, `lint`, `typecheck`, `test` (48 testes) e `build` passam a partir de uma instalação limpa |
| CA04, CA05 | ✅ Testes automatizados e servidor compilado contra PostgreSQL 16 real: 200 com o banco no ar; 503 sem detalhes com o banco parado |
| CA06, CA07, CA08, CA11, CA12, CA13 | ✅ Testes automatizados |
| CA09 | ✅ Modo `worker` registrou *heartbeat* com o banco no ar e encerrou ao receber sinal |
| CA10 | ✅ Migração aplicada → desfeita → aplicada de novo no PostgreSQL 16 real |
| CA14 | ✅ No Linux (Electron real, sem tela, via Xvfb): os quatro estados da tela, português e inglês, sem rolagem horizontal em 500 px de largura, interface sem acesso ao Node. ⏳ Falta conferir no Windows e no macOS |
| CA15 | ✅ Primeira execução no GitHub (08/10/2026) passou nos dois jobs: verificação e ciclo de migração |
