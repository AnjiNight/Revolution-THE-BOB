# Simulador de Investimentos

Aplicação desktop para simulação de carteiras de investimento em ações e fundos imobiliários (FIIs) do mercado brasileiro. Projeto acadêmico, sem execução de ordens reais. A renda fixa está prevista para uma fase futura.

**Disciplina:** Modelagem de Dados
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação

## Integrantes

- Luís Gustavo Sampaio Coêlho
- Nicoly Araujo de Paschoa

## Sobre

O usuário monta carteiras fictícias com ativos reais e acompanha a rentabilidade ao longo do tempo, usando cotações verdadeiras — sem dinheiro real envolvido. O objetivo é permitir testar hipóteses de investimento antes de aplicar de verdade.

O projeto também investiga se o sentimento extraído de notícias econômicas guarda relação com a variação de preço dos ativos.

## Funcionalidades

- Cadastro e autenticação de usuário
- Criação de carteiras de simulação
- Registro de compras, vendas, aportes e retiradas
- Cálculo de posição, preço médio e rentabilidade
- Comparação com benchmarks (CDI e IBOV)
- Coleta de notícias econômicas e análise de sentimento
- Projeção de cenários futuros

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Aplicação desktop | Electron + React + TypeScript |
| API | Node.js + Fastify + TypeScript |
| Banco de dados | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |

**Fontes de dados:** brapi.dev (cotações de ações e FIIs da B3), API SGS do Banco Central (CDI), feeds RSS de portais econômicos.

**Fase futura:** aplicação e resgate em renda fixa (CDB, LCI/LCA, Tesouro Direto), com IR e IOF — ver [Requisitos §9](requisições.md) e [DA22](adr/DA22-escopo-acoes-fiis-renda-fixa-adiada.md).

## Estrutura

Hoje o repositório contém apenas a documentação, na raiz:

| Documento | Conteúdo |
|---|---|
| [Visão de produto](Visão%20de%20produto.md) e [Personas](personas.md) | Visão, problema, público e perfis de usuário |
| [Requisitos](requisições.md) | Requisitos funcionais, não funcionais e regras de negócio |
| [Modelo de domínio](modelo_dominio.md) e [Casos de uso](modelo_casos_de_uso.md) | Modelo conceitual e diagrama de casos de uso |
| [Drivers arquiteturais](drivers_arquiteturais.md), [ADRs](adr/README.md), [Decisões técnicas](decisoes_tecnicas.md) e [Arquitetura](arquitetura.md) | Arquitetura e decisões |
| [Mapa de specs](specs/mapa_specs.md) | Ordem de desenvolvimento (Spec-Driven Development) |

Código (criado na [SPEC-001](specs/SPEC-001.md)):

```
app/              Aplicação desktop (Electron + React)
api/              Servidor e processador de tarefas (Fastify + Prisma)
packages/shared/  Tipos e contratos compartilhados
```

## Como rodar

Pré-requisitos: **Node.js 22** e **Docker** (para o PostgreSQL local).

```bash
npm install                     # instala os três pacotes
cp .env.example api/.env        # configuração do servidor
npm run db:up                   # sobe o PostgreSQL 16 (docker compose)
npm run db:migrate              # aplica as migrações

npm run dev:api                 # servidor em http://localhost:3333
npm run dev:worker              # processador de tarefas (outro terminal)
npm run dev:app                 # aplicação desktop (outro terminal)
```

Contas de **colaborador** (equipe) não são criadas pelo app ([SPEC-002](specs/SPEC-002.md)). Para criar uma, gerando uma senha forte que aparece uma única vez:

```bash
npm run colaborador:criar --workspace api -- --nome "Nome Sobrenome" --email pessoa@exemplo.com
```

O colaborador entra pela **Área do colaborador**, na tela de login.

### Login com Google (opcional)

O botão "Continuar com o Google" só aparece quando o app e o servidor têm o client ID ([DA24](adr/DA24-login-com-google.md)). O login abre o navegador do sistema: se a pessoa já estiver conectada ao Google lá, basta escolher a conta.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e configure a **tela de consentimento OAuth** (tipo externo; enquanto estiver em teste, adicione os e-mails de quem vai testar).
2. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo para computador**. Não é preciso cadastrar endereço de retorno: o app usa um endereço local temporário (`127.0.0.1`).
3. No `api/.env`, preencha `GOOGLE_CLIENT_ID` (o servidor confere o login com ele).
4. Copie `app/.env.example` para `app/.env` e preencha `MAIN_VITE_GOOGLE_CLIENT_ID` e `MAIN_VITE_GOOGLE_CLIENT_SECRET`. O `app/.env` não vai para o Git.
5. Reinicie o servidor e o app.

Para o login terminar, o servidor e o banco precisam estar rodando (seção anterior).

Testes contra o PostgreSQL real rodam quando `TEST_DATABASE_URL` aponta para um banco com as migrações aplicadas (atenção: apagam os dados de identidade desse banco). No GitHub Actions eles rodam sempre.

Verificações (as mesmas do GitHub Actions):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Migrações: toda pasta em `api/prisma/migrations/` tem um `down.sql` escrito à mão; `npm run db:rollback` desfaz a última migração aplicada.

## Aviso legal

Projeto acadêmico de caráter educacional. Não constitui recomendação de investimento nem consultoria financeira. Todas as operações são simuladas, sem movimentação de recursos reais. Projeções são cenários estatísticos e não garantem resultado futuro.
