# SPEC-049 — Demonstração no Render e instalador para o professor

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 26/11/2026, a pedido do Luís ("tem como fazer um release com o exe no GitHub só pra mostrar pro professor?", depois "pode ser no Render"), com as escolhas dele do §4.1; aprovada por ele no mesmo dia, como escrita ("Aprovo, implemente"); em implementação (§9) |
| Fase | Fora das fases do mapa: implantação de demonstração ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should (proposta): a apresentação depende dela |
| Depende de | [SPEC-001](SPEC-001.md) (esqueleto, `GET /api/health`), [SPEC-039](SPEC-039.md) (confirmação de e-mail), [SPEC-041](SPEC-041.md) (autorização do Investidor10) |
| Muda | Um arquivo novo `render.yaml` (Blueprint do Render), o `README.md` (seção "Demonstração no Render") e o mapa. **Nenhuma mudança no código do servidor nem do app** |
| Requisitos | RNF05 (instalador para Windows), RNF09 (só HTTPS), RNF11 (LGPD) |
| ADRs | [DA12](../adr/DA12-autorizacao-planos-no-servidor.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA24](../adr/DA24-login-com-google.md) |

---

## 1. Objetivo

O professor recebe um **instalador do Windows** (`.exe`), publicado numa **release do GitHub**, e usa o app de verdade: cria a conta, confirma o e-mail, monta carteiras e abre a ficha dos ativos. Para isso, o servidor e o banco ficam **no Render**, com HTTPS, e os dados de mercado são **copiados do banco local** do Luís.

## 2. Valor

- **Professor:** instala e usa o app sem montar Docker, banco nem servidor.
- **Equipe:** a mesma versão da apresentação fica disponível para conferir depois, até o banco gratuito expirar.

## 3. Escopo

### 3.1 Inclui

1. **`render.yaml`**: um serviço web gratuito (o servidor) e um PostgreSQL gratuito, com as variáveis de ambiente.
2. **Cópia dos dados de mercado** do banco local para o do Render, **sem nenhum dado pessoal**.
3. **Instalador** gerado com o endereço do Render e **sem as credenciais do Google**.
4. **Release no GitHub** com o instalador e o passo a passo para o professor.
5. **README**: seção "Demonstração no Render", com o que fazer e os limites.

### 3.2 Não inclui

- **O processador no Render**: o plano gratuito não roda processos em segundo plano. Os dados ficam parados na data da cópia (§4.2).
- **Login com Google** na demonstração: o botão não aparece (§4.2).
- **Domínio próprio**, assinatura de código do instalador e o plano pago.
- **macOS e Linux**: só o instalador do Windows.

## 4. Decisões

### 4.1 Escolhidas pelo Luís em 26/11/2026

| # | Tema | Escolha | Motivo |
|---|---|---|---|
| 1 | **Onde fica o servidor** | **Render**, plano gratuito | Sem custo; dá HTTPS no endereço `*.onrender.com`, que o app instalado exige (RNF09) |
| 2 | **E-mail** | **Gmail com senha de app** (SMTP `smtp.gmail.com`, porta 465) | Em produção, o servidor só sobe com SMTP (SPEC-039): o cadastro manda o código de confirmação. Gratuito, com uns 500 e-mails por dia |
| 3 | **Dados** | **Copiar do banco local** do Luís | O processador não roda de graça no Render; o banco local já tem o catálogo e o histórico (237 MB, 713 ativos, cerca de 1 milhão de cotações) |
| 4 | **Prazo** | A apresentação é nas próximas semanas | O PostgreSQL gratuito do Render é apagado 30 dias depois de criado, mais 14 de carência |

### 4.2 Recomendações para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Quem cria as contas** | O **Luís** cria a conta no Render (ligada ao GitHub), aplica o Blueprint e preenche os segredos no painel do Render: `SMTP_USER`, `SMTP_PASSWORD` (a senha de app) e `EMAIL_FROM`. O Claude **não vê nem repete** esses valores | As credenciais são dele (CLAUDE.md, "Segredos") |
| **Serviço web** | Plano `free`, região `oregon`, Node 22. Build: `npm ci --workspace packages/shared --workspace api --include-workspace-root` e a compilação do compartilhado e do servidor (sem instalar o Electron). Start: `npm run db:migrate --workspace api && npm run start --workspace api` (as migrações rodam a cada início). Health check em `/api/health` | O plano gratuito não tem comando de pré-deploy; `migrate deploy` não refaz o que já foi aplicado |
| **Variáveis** | `NODE_ENV=production`, `HOST=0.0.0.0` (o Render manda o `PORT`), `DATABASE_URL` do banco do Blueprint, `JWT_SECRET` gerado pelo Render, `INVESTIDOR10_ENABLED=true`, os 3 do SMTP preenchidos à mão, sem `GOOGLE_CLIENT_ID` e sem `BRAPI_TOKEN` | Os dados vêm da cópia: o servidor não consulta a brapi (a cota é por pessoa) |
| **Investidor10** | Indicadores, proventos e notícias aparecem com "Fonte: Investidor10", **só nesta demonstração** e só depois do login. O banco é apagado depois da apresentação | É o que a autorização permite (SPEC-041, SPEC-027): uso acadêmico, neste projeto, até a apresentação |
| **O que é copiado** | Só as tabelas de mercado: catálogo e setores, calendário de pregão, histórico e cotações do pregão, logos, índices (CDI, Ibovespa, IFIX), indicadores, proventos, eventos e classificação da B3, e as notícias, fontes, vínculos e o sentimento | Nada de contas, carteiras, consentimentos, auditoria, execuções nem preferências (DA13): o banco do Render começa sem nenhuma pessoa |
| **Como copiar** | Pelo contêiner do Docker, que já tem o `pg_dump` e o `psql`: `pg_dump --data-only` das tabelas do item anterior, do banco `simulador`, enviado com `psql` ao endereço externo do banco do Render, depois que o servidor do Render tiver aplicado as migrações. Sem script novo no projeto | Uma cópia só, feita pelo Luís com o endereço que ele copia do painel |
| **Notícias** | Antes da cópia, o processador roda **no PC do Luís** por cerca de 30 minutos, para buscar as notícias novas do Investidor10 e das fontes curadas (o banco local tem 0 notícias). Ele usa o cache da B3 que já está baixado, sem o download grande | Sem isso, a tela Notícias e a ficha mostrariam "Nenhuma notícia" |
| **Instalador** | `npm run dist --workspace app` com `MAIN_VITE_API_URL=https://<serviço>.onrender.com` e **sem** `MAIN_VITE_GOOGLE_CLIENT_ID` nem `MAIN_VITE_GOOGLE_CLIENT_SECRET`, num `app/.env` temporário. O `app/.env` original volta no fim | O instalador embute o `app/.env`: uma release pública espalharia as credenciais do Google |
| **Release** | No GitHub, marcada como **pré-lançamento**, com o `.exe` e o texto: o Windows pode avisar que o editor é desconhecido ("Mais informações" → "Executar assim mesmo"), e o primeiro acesso depois de um tempo parado leva até 1 minuto ("Tentar novamente") | O instalador não é assinado, e o serviço gratuito dorme depois de 15 minutos sem uso |
| **Fim** | Depois da apresentação, o Luís apaga o serviço e o banco no Render e transforma a release em rascunho ou a apaga | O banco gratuito some sozinho em 44 dias; a autorização do Investidor10 vale até a apresentação |

### 4.3 Limites que a demonstração tem

| Limite | Efeito |
|---|---|
| O serviço dorme depois de **15 minutos** sem uso | O primeiro acesso mostra "Servidor indisponível" por até 1 minuto; depois funciona |
| **750 horas** de serviço gratuito por mês | Sobra: o serviço só conta horas quando está acordado |
| Banco de **1 GB**, apagado em **30 + 14 dias** | Os dados (237 MB) cabem; a demonstração tem data para acabar |
| Sem processador | Cotações, notícias e índices parados na data da cópia; a lista de tarefas do colaborador mostra o processador parado |

## 5. Comportamento esperado

| Passo | Quem | O que acontece |
|---|---|---|
| 1 | Claude | Escreve o `render.yaml` e a seção do README, e roda as checagens do projeto |
| 2 | Luís | Cria a conta no Render, aplica o Blueprint pelo GitHub e preenche os 3 segredos do SMTP |
| 3 | Render | Compila, aplica as migrações e responde em `https://<serviço>.onrender.com/api/health` |
| 4 | Luís e Claude | O processador roda no PC por uns 30 minutos; depois os dados de mercado são copiados para o Render |
| 5 | Claude | Gera o instalador com o endereço do Render, sem as credenciais do Google |
| 6 | Luís | Cria a release (pré-lançamento) no GitHub e anexa o `.exe` |

## 6. Modelo de dados

Nenhuma mudança. O banco do Render recebe as mesmas migrações do projeto.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | `https://<serviço>.onrender.com/api/health` responde com o banco ligado |
| CA02 | O banco do Render tem os ativos, o histórico, os índices e as notícias, e **nenhuma** linha em `usuario`, `carteira`, `consentimento`, `registro_auditoria` e `preferencia_fonte` antes de o professor se cadastrar |
| CA03 | O instalador, num Windows sem o projeto, abre o app com "Servidor conectado"; o cadastro manda o código por e-mail e o login funciona |
| CA04 | O instalador não contém as credenciais do Google (o botão "Continuar com o Google" não aparece) |
| CA05 | A release no GitHub é um pré-lançamento com o `.exe` e as instruções do §4.2 |
| CA06 | O README tem a seção "Demonstração no Render", com os passos, os limites e o que apagar no fim |

## 8. Pontos em aberto

| Tema | Situação |
|---|---|
| Junção com a branch da Nicoly | A demonstração usa esta branch (com a SPEC-030); a SPEC-025 e as 046 a 048 só entram se a branch dela for juntada antes |
| Plano pago | Se a demonstração precisar durar mais de 44 dias, o banco pago custa a partir de uns US$ 6 por mês |
