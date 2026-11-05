# Simulador de Investimentos

Aplicação desktop para simulação de carteiras de investimento em ações e fundos imobiliários (FIIs) do mercado brasileiro. Projeto acadêmico, sem execução de ordens reais. A renda fixa está prevista para uma fase futura.

**Disciplina:** Modelagem de Dados
**Universidade Presbiteriana Mackenzie** — Engenharia da Computação

## Integrantes

- Luís Gustavo Sampaio Coêlho
- Nicoly Paschoa

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
npm run mail:up                 # sobe o Mailpit, que recebe os e-mails (http://localhost:8025)
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

**Calendário de pregão** ([SPEC-005](specs/SPEC-005.md)): enquanto um ano não é publicado, o app recusa datas dele. Os **anos que já passaram** (de 2016 até o ano passado) o processador (`npm run dev:worker`) publica sozinho, a partir do arquivo anual da B3 ([SPEC-005 §10](specs/SPEC-005.md)). O **ano atual e os seguintes** são da equipe: na Área do colaborador, abra **Calendário**, clique em **Carregar sugestão**, confira com o calendário oficial da B3 e clique em **Publicar**. O ano seguinte deve ser publicado até 31 de dezembro (o Início do colaborador avisa desde 1º de dezembro).

**Catálogo de ativos** ([SPEC-006](specs/SPEC-006.md) e [SPEC-040](specs/SPEC-040.md)): o processador importa todo dia, às 08:30, as ações (com as units) e os FIIs negociados na B3 nos últimos 3 meses, com o logo de cada um; quem para de negociar é desativado sozinho, e volta sozinho se voltar a negociar. Na primeira vez, a importação baixa o arquivo anual do ano atual da B3 (uns 60 a 90 MB) para saber quem negociou. A classificação (setor ou segmento) vem sugerida e marcada **a revisar**: na Área do colaborador, abra **Ativos**, filtre por **Classificação: A revisar** e, em cada um, corrija o setor ou use **Confirmar classificação**. A importação nunca muda o que a equipe editou. O colaborador também cadastra à mão com **Novo ativo** (ticker, nome, classe Ação ou FII e setor ou segmento). A classe não muda depois do cadastro, e ativo nunca é apagado: é desativado. Cada mudança no catálogo (inclusive as do processador) e cada publicação do calendário ficam no registro de auditoria.

**Histórico de cotações** ([SPEC-008](specs/SPEC-008.md)): o processador (`npm run dev:worker`) carrega o fechamento diário dos ativos do catálogo a partir dos arquivos públicos da B3, desde 2016. Ativo novo ganha o histórico em até 15 minutos; os pregões que faltam são buscados todo dia às 08:00. Só entram os anos com calendário publicado: publique de 2016 até o ano atual (a tela **Ativos** do colaborador avisa quais faltam). Os arquivos anuais (uns 60 a 90 MB cada) ficam guardados em `api/.cache/b3`.

**Série do CDI** ([SPEC-007](specs/SPEC-007.md)): o processador carrega o CDI diário da API SGS do Banco Central (pública, sem token) desde 04/01/2016 e o atualiza às 09:00 e às 18:00; o CDI de um dia sai no dia útil seguinte. O Início do colaborador mostra até que dia a série está carregada e avisa se ela parar. O usuário vê o CDI na comparação com benchmarks (SPEC-020).

**Ficha do ativo** ([SPEC-010](specs/SPEC-010.md)): na tela **Ativos**, clique no ticker. A ficha mostra a última cotação (a do pregão ou o fechamento da B3, a mais recente), o último pregão da B3 e o gráfico dos fechamentos, de 1 mês até tudo desde 2016. Os preços estão como a B3 publica, sem ajuste por dividendos, desdobramentos ou grupamentos: saltos grandes de um pregão para o seguinte ficam marcados no gráfico.

**Indicadores e proventos** ([SPEC-041](specs/SPEC-041.md) e [SPEC-042](specs/SPEC-042.md)): a ficha do ativo mostra os indicadores fundamentalistas (P/L, P/VP, ROE, margens, dívida, dividend yield… e, nos FIIs, valor patrimonial, vacância, cotistas) com o histórico anual desde 2016, e a lista de proventos (dividendos, JCP, rendimentos, amortizações). Os dados vêm do **Investidor10**, que autorizou por escrito o uso **só neste projeto acadêmico**, com "Fonte: Investidor10" e **até a apresentação**. Por isso a coleta só roda com `INVESTIDOR10_ENABLED=true` no `api/.env` (no `.env.example` ela vem `false`). O processador visita a página de cada ativo devagar (uma consulta a cada 3 segundos): todos aos domingos às 03:00 e, nos outros dias, só os que nunca foram visitados; a primeira coleta leva cerca de uma hora. Depois da apresentação, desligue (`INVESTIDOR10_ENABLED=false`) e apague o que foi coletado:

```bash
npm run investidor10:apagar --workspace api
```

O gráfico da ficha passa a abrir **ajustado** por desdobramentos, grupamentos e bonificações, pelos eventos da página de cada empresa no site da B3 (domingo às 04:00), com a opção "Como a B3 publicou".

### Token da brapi (opcional)

As cotações do pregão e a lista de ativos ([SPEC-009](specs/SPEC-009.md) e [SPEC-040](specs/SPEC-040.md)) vêm da [brapi](https://brapi.dev). Desde a SPEC-040, o app usa a **lista** da brapi, que responde sem token e não desconta da cota: **o token é opcional**. Se você quiser usar um (para o caso de a brapi mudar a regra), **gere o seu**: a cota de 15 mil consultas por mês é por chave, então dois computadores com o mesmo token gastam a mesma cota.

1. Crie uma conta gratuita em [brapi.dev](https://brapi.dev) e gere um token no painel.
2. No `api/.env`, preencha `BRAPI_TOKEN` com o **seu** token. O `api/.env` não vai para o Git; nunca coloque o token em commits nem mensagens.

**Cotações do pregão:** com o processador ligado (`npm run dev:worker`), em dia de pregão, ele lê a lista da brapi (duas consultas: ações e FIIs) de 30 em 30 minutos, das 10h30 até meia hora depois do fechamento (horário de Brasília), e grava o preço de todos os ativos ativos. O preço, a variação do dia e o horário da coleta aparecem na lista **Ativos**, sempre com o aviso de atraso de até 45 minutos (30 do plano gratuito e até 15 em que a lista fica guardada na brapi; nunca "tempo real"). O fechamento do dia entra nos gráficos com o arquivo da B3 da manhã seguinte. Cotações do pregão ficam guardadas por 30 dias.

### Login com Google (opcional)

O botão "Continuar com o Google" só aparece quando o app e o servidor têm o client ID ([DA24](adr/DA24-login-com-google.md)). O login abre o navegador do sistema: se a pessoa já estiver conectada ao Google lá, basta escolher a conta.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e configure a **tela de consentimento OAuth** (tipo externo; enquanto estiver em teste, adicione os e-mails de quem vai testar).
2. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo para computador**. Não é preciso cadastrar endereço de retorno: o app usa um endereço local temporário (`127.0.0.1`).
3. No `api/.env`, preencha `GOOGLE_CLIENT_ID` (o servidor confere o login com ele).
4. Copie `app/.env.example` para `app/.env` e preencha `MAIN_VITE_GOOGLE_CLIENT_ID` e `MAIN_VITE_GOOGLE_CLIENT_SECRET`. O `app/.env` não vai para o Git.
5. Reinicie o servidor e o app.

Para o login terminar, o servidor e o banco precisam estar rodando (seção anterior).

### E-mail: confirmação de cadastro, recuperação de senha e exclusão de conta

O app manda códigos de 8 caracteres por e-mail, que a pessoa digita no próprio app:

- **Confirmação de e-mail** ([SPEC-039](specs/SPEC-039.md)): quem se cadastra com e-mail e senha só entra depois de digitar o código; a troca de e-mail no Meu perfil também pede o código do endereço novo. Contas nunca confirmadas são apagadas em 7 dias pelo processador (`npm run dev:worker`).
- **"Esqueci minha senha"** ([SPEC-004](specs/SPEC-004.md)).
- **Excluir minha conta** ([SPEC-034](specs/SPEC-034.md)), em Meu perfil → Seus dados: a conta e todos os dados são apagados na hora, depois do código. Na mesma seção, **"Baixar meus dados"** salva um arquivo JSON com tudo o que o app guarda sobre a pessoa (LGPD).

O servidor envia e-mail por SMTP. Sem `SMTP_HOST` no `api/.env`, o cadastro com senha, a troca de e-mail, a recuperação e a exclusão de conta ficam desligados (o login com Google e a exportação continuam); em produção, o SMTP é obrigatório.

No desenvolvimento, os e-mails vão para o **Mailpit**, que roda no Docker e não manda nada para a internet:

```bash
npm run mail:up                 # sobe o Mailpit (docker compose)
```

A caixa de entrada fica em http://localhost:8025. O `.env.example` já vem apontando para ele (`SMTP_HOST=localhost`, `SMTP_PORT=1025`). Em produção, basta trocar essas variáveis pelas do provedor de e-mail escolhido.

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
