# SPEC-002 — Cadastro, autenticação e sessão

| Campo | Conteúdo |
|---|---|
| Status | Em implementação — iniciada em 08/10/2026 a pedido do Luís; revisada com as decisões de colaborador e login com Google; revisar com a equipe no Pull Request |
| Fase | 1 — Conta e acesso ([mapa de specs](mapa_specs.md)) |
| Prioridade | Must |
| Depende de | [SPEC-001](SPEC-001.md) |
| Requisitos | RF01, RF02, RF41, RF42; RB01, RB03 (base); RNF07, RNF08, RNF09, RNF10, RNF11 (consentimento), RNF20 |
| Casos de uso | Cadastrar conta (inclui Gerenciar perfil e consentimento); Autenticar-se |
| Drivers | FAS07, QA05, QA06, QA13, RES05 |
| ADRs | [DA05](../adr/DA05-autenticacao-propria.md), [DA12](../adr/DA12-autorizacao-planos-no-servidor.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA24](../adr/DA24-login-com-google.md) |

---

## 1. Objetivo

Existem dois tipos de conta, como num sistema de escola:

- **Usuário** (o "aluno"): cria a própria conta com nome, e-mail e senha, ou entra com o Google, aceitando os termos de uso e a política de privacidade.
- **Colaborador** (o "funcionário"): **não cria a própria conta**. A equipe cria o acesso antes, e ele entra por uma tela própria, a **Área do colaborador**.

Depois de entrar, a sessão se renova sozinha enquanto a pessoa usa o app. O servidor passa a saber **quem** faz cada requisição e **qual o tipo de conta** dessa pessoa.

## 2. Valor

- **Usuário:** acesso pessoal e seguro, com o Google como opção; não precisa entrar de novo toda vez que abre o app.
- **Equipe:** acesso de colaborador controlado; ninguém vira colaborador sozinho.
- **Sistema:** identidade e tipo de conta, pré-requisitos de tudo que é pessoal (carteiras, RB03) ou da equipe (DA12).

## 3. Escopo

### 3.1 Inclui

1. **Cadastro de usuário** (RF01) com nome, e-mail, senha e aceite obrigatório dos termos. O aceite fica registrado com versão e data (RNF11). Após o cadastro, o usuário já entra.
2. **Login de usuário** com e-mail e senha.
3. **Entrar com Google** (RF41, [DA24](../adr/DA24-login-com-google.md)), só para usuários. No primeiro acesso, pede o aceite dos termos antes de criar a conta. Se já existir conta de usuário com o mesmo e-mail, liga o Google a ela.
4. **Área do colaborador** (RF42): tela de login própria, sem cadastro e sem Google.
5. **Criação de colaborador pela equipe**: comando no servidor que cria a conta e **gera uma senha forte**, mostrada uma única vez (resolve a OPEN-03).
6. **Cada porta aceita só o seu tipo de conta:** o login de usuário recusa colaborador, e a Área do colaborador recusa usuário.
7. **Sessão** (RF02): token de acesso de curta duração + token de renovação, renovados automaticamente pelo app.
8. **Logout**, que invalida a sessão no servidor e no dispositivo.
9. **`GET /api/me`** e **proteção de rotas** no servidor.
10. **Telas no app:** Entrar (com "Entrar com Google" e o link "Área do colaborador"), Criar conta, Área do colaborador e Início (diferente para usuário e colaborador). O aviso de situação do servidor da SPEC-001 continua visível.

### 3.2 Não inclui

- Recuperação de senha por e-mail (RF03, SPEC-004).
- Edição de perfil, troca de senha e consulta de consentimentos (RF05, SPEC-003).
- Desbloqueio por biometria (RF04, SPEC-036).
- Exportação e exclusão de dados (RF06, SPEC-034).
- As ferramentas do colaborador (cadastro de ativos, monitoramento): SPEC-005, SPEC-006 e SPEC-011. Por enquanto a Área do colaborador só autentica e mostra a tela inicial.
- Confirmação do e-mail por link: não está nos requisitos.

## 4. Decisões tomadas nesta Spec

| Tema | Decisão | Motivo |
|---|---|---|
| **Tipos de conta (OPEN-03)** | `usuario` e `colaborador`. O nome "administrador" dos documentos anteriores passa a ser **colaborador** | Proposta da equipe (Nicoly): modelo de "sistema de escola" |
| **Como nasce um colaborador** | Só pela equipe: `npm run colaborador:criar -- --nome "…" --email …`. A senha é **gerada pelo sistema** (144 bits) e mostrada uma vez, para ser entregue por um canal seguro. Não há cadastro nem promoção pelo app | Ninguém consegue virar colaborador sozinho, nem com um cliente alterado (PA02). Senha gerada evita senha fraca |
| **Porta de entrada** | Login de usuário e Área do colaborador separados. **Quem decide o tipo é o servidor**, nunca a tela. Senha errada dá sempre "E-mail ou senha incorretos"; só com a senha certa a porta errada é informada | A tela separada é clareza para quem usa; a segurança está no servidor |
| **Google** | Só para usuários, conforme a [DA24](../adr/DA24-login-com-google.md): navegador do sistema + PKCE + endereço local; o servidor verifica o ID token e só aceita e-mail verificado. Colaborador nunca entra pelo Google (garantido também no banco) | Recomendação do Google para apps desktop; o app nunca vê a senha do Google |
| Senha de usuário | De 8 a 128 caracteres, sem regras de composição; guardada com **argon2id** (RNF07) | Recomendação atual: senhas longas valem mais que regras de símbolos |
| E-mail | Gravado sem espaços e em minúsculas; único (RB01), também por restrição no banco | `Ana@X.com` e `ana@x.com` são a mesma pessoa |
| Token de acesso | JWT assinado, **15 minutos**, com o identificador e o tipo de conta | Curta duração limita o estrago se vazar |
| Token de renovação | Aleatório, **30 dias**, guardado no banco **só como hash**; trocado a cada uso; reuso derruba a sessão inteira | Detecta roubo de token sem guardar o token |
| Sessão do colaborador | Igual à do usuário | Não foi pedido tratamento diferente; pode mudar depois |
| Onde o app guarda a sessão | Token de acesso só na memória; token de renovação **criptografado pelo cofre do SO** (RNF08). Sem cofre (Linux sem keyring, backend `basic_text`), a sessão vale só com o app aberto | Nunca gravar token em arquivo comum |
| Limite de tentativas (RNF10) | 10 requisições por minuto, por IP, em cada rota de `/api/auth` | Dificulta descobrir senhas por tentativa e erro |
| Versão dos termos | `1`, registrada em cada aceite. Colaborador não registra aceite: o vínculo dele é com a equipe | Permite pedir novo aceite quando os termos mudarem |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Entrada | Sucesso | Erros |
|---|---|---|---|
| `POST /api/auth/register` | `name`, `email`, `password`, `acceptedTerms: true` | 201 com `user`, `accessToken`, `refreshToken` (sempre conta de usuário) | 400 `validation_error`; 409 `email_in_use`; 429 |
| `POST /api/auth/login` | `email`, `password` | 200 com a sessão | 401 `invalid_credentials`; 403 `wrong_account_type` (colaborador); 429 |
| `POST /api/auth/collaborator/login` | `email`, `password` | 200 com a sessão | 401 `invalid_credentials`; 403 `wrong_account_type` (usuário); 429 |
| `POST /api/auth/google` | `idToken`, `acceptedTerms?` | 200 com a sessão | 400 `terms_required` (primeiro acesso sem aceite); 401 `google_token_invalid`; 403 `google_email_not_verified` ou `wrong_account_type`; 503 `google_login_unavailable`; 429 |
| `POST /api/auth/refresh` | `refreshToken` | 200 com novo par de tokens | 401 `invalid_refresh_token`; 429 |
| `POST /api/auth/logout` | `refreshToken` | 204 (também quando o token já não vale) | 429 |
| `GET /api/me` | `Authorization: Bearer <accessToken>` | 200 com `user` | 401 `unauthorized` |

`user` = `{ id, name, email, role }`, com `role` igual a `user` ou `collaborator`. Nenhuma resposta contém senha, hash ou dado do Google além do e-mail e do nome.

### 5.2 Regras de validação

| Campo | Regra | Código de erro |
|---|---|---|
| `name` | Obrigatório; 2 a 100 caracteres, sem contar espaços nas pontas | `required`, `too_short`, `too_long` |
| `email` | Obrigatório; formato de e-mail; até 254 caracteres | `required`, `invalid_email`, `too_long` |
| `password` | Obrigatória; 8 a 128 caracteres | `required`, `too_short`, `too_long` |
| `acceptedTerms` | Precisa ser `true` no cadastro | `terms_not_accepted` |

As mesmas regras rodam no app e no servidor, a partir de um único código em `packages/shared`.

### 5.3 Telas

| Situação | Tela |
|---|---|
| App aberto sem sessão guardada | Entrar (com "Entrar com Google", se configurado, e o link "Área do colaborador") |
| App aberto com sessão guardada e válida | Início, sem pedir senha |
| "Entrar com Google", primeiro acesso | Resumo dos termos + caixa de aceite + "Aceitar e continuar" |
| Clique em "Área do colaborador" | Login do colaborador, com o aviso de que o acesso é criado pela equipe |
| Usuário tenta a Área do colaborador (ou o contrário), com a senha certa | Mensagem explicando por onde aquela conta entra |
| Login bem-sucedido | Início: "Olá, {nome}", tipo de conta e botão Sair. A tela do colaborador tem destaque visual próprio |
| Clique em Sair | Entrar |

## 6. Modelo de dados

| Tabela | Colunas | Restrições |
|---|---|---|
| `usuario` | `id`, `nome`, `email`, `senha_hash` (opcional), `google_sub` (opcional), `perfil`, `criado_em`, `atualizado_em` | `email` único e em minúsculas; `google_sub` único; `perfil` ∈ {`usuario`, `colaborador`}; toda conta tem senha ou Google; **colaborador tem senha e nunca Google** (todas por `CHECK`) |
| `consentimento` | `id`, `usuario_id`, `tipo`, `versao`, `aceito_em` | Chave estrangeira para `usuario` |
| `token_renovacao` | `id`, `usuario_id`, `token_hash`, `familia`, `criado_em`, `expira_em`, `revogado_em` | `token_hash` único; chave estrangeira para `usuario` |

A migração tem `down.sql`, conforme a SPEC-001.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Cadastro válido cria **usuário**, registra o consentimento (versão e data) e devolve a sessão. Não é possível criar colaborador pela API |
| CA02 | E-mail já existente, mesmo com maiúsculas diferentes, é recusado com `email_in_use` (RB01) |
| CA03 | Cadastro sem aceite dos termos ou com campos inválidos é recusado com `validation_error` e o problema de cada campo |
| CA04 | Senha guardada só como hash argon2id; nenhuma resposta e nenhum log contém senha, hash ou token (RNF07) |
| CA05 | Senha errada e e-mail inexistente dão a mesma resposta (`invalid_credentials`) |
| CA06 | `GET /api/me` responde 401 sem token, com token inválido, adulterado ou expirado |
| CA07 | A renovação devolve um novo par e invalida o token de renovação usado |
| CA08 | Reusar um token de renovação já trocado derruba toda a sessão daquele login |
| CA09 | Depois do logout, o token de renovação não funciona mais |
| CA10 | A 11ª requisição em um minuto a uma rota de `/api/auth`, do mesmo IP, recebe 429 (RNF10) |
| CA11 | `colaborador:criar` cria conta de colaborador com senha forte gerada; colaborador entra só pela Área do colaborador e usuário só pelo login comum (403 `wrong_account_type`, revelado só com a senha certa) |
| CA12 | O app guarda o token de renovação só criptografado pelo cofre do SO e nunca grava o token de acesso (RNF08) |
| CA13 | O app renova a sessão sozinho quando o token de acesso expira (RF02) |
| CA14 | Ao abrir o app com sessão válida guardada, a pessoa entra direto na tela inicial |
| CA15 | As telas funcionam em português e inglês, com os erros traduzidos |
| CA16 | As tabelas existem com as restrições da §6; a migração pode ser desfeita e refeita |
| CA17 | ID token do Google inválido, adulterado, expirado, de outro app ou de outro emissor é recusado |
| CA18 | Primeiro acesso pelo Google sem aceite → `terms_required`; com aceite, cria a conta de usuário sem senha e registra o consentimento |
| CA19 | Google com o mesmo e-mail de uma conta de usuário liga as duas, e a senha continua valendo; e-mail não verificado é recusado |
| CA20 | Colaborador não entra pelo Google; o app só mostra o botão do Google quando está configurado; o login no navegador usa PKCE e recusa resposta com `state` diferente |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-03 | **Resolvida** (§4): perfil colaborador, criado só pela equipe |
| DA24 | Criar o projeto e o client ID no Google Cloud; tela de consentimento e testadores |
| — | Texto definitivo dos termos de uso e da política de privacidade (a versão 1 é um resumo provisório) |
| — | Troca de senha pelo colaborador (SPEC-003) |

## 9. Verificação (08/10/2026)

| Critério | Resultado |
|---|---|
| CA01–CA10 | ✅ Testes automatizados (regras com repositórios em memória e rotas HTTP) e ponta a ponta com o servidor compilado e PostgreSQL 16 real: cadastro, e-mail duplicado (409), senha em argon2id no banco, `/api/me`, reuso de token recusado, 11ª tentativa bloqueada (429), nenhum segredo no log |
| CA11 | ✅ Ponta a ponta: `colaborador:criar` gerou senha de 24 caracteres; colaborador entrou pela Área do colaborador (200) e foi recusado no login comum (403); usuário recusado na Área do colaborador (403), mas com senha errada recebeu só "E-mail ou senha incorretos" (401); e-mail repetido recusado pelo comando; senha do colaborador ausente do log |
| CA12, CA13 | ✅ Testes automatizados; no Linux de teste (sem keyring, `basic_text`), o app não gravou o token em disco, como previsto |
| CA14 | ✅ Teste automatizado da restauração. ⏳ Conferir manualmente no Windows e no macOS, que têm cofre do SO |
| CA15 | ✅ Electron real (Linux, sem tela): erros por campo no cadastro; cadastro → Início; Sair; senha errada; entrar; Área do colaborador sem cadastro nem Google; porta errada explicada; Início do colaborador com destaque. Paridade dos idiomas coberta por teste |
| CA16 | ✅ Restrições `CHECK` conferidas no PostgreSQL real (e-mail em minúsculas, nome, forma de acesso, colaborador com senha e sem Google, validade do token); banco idêntico ao esquema do Prisma; migrações desfeitas e refeitas |
| CA17 | ✅ Testes com chaves geradas no próprio teste: token válido aceito; outro app, outro emissor, expirado, outra chave e lixo recusados |
| CA18, CA19 | ✅ Testes automatizados (regras, rotas e banco real) |
| CA20 | ✅ Testes automatizados e Electron real: o botão só aparece com o client ID configurado; o app abriu `accounts.google.com` com PKCE S256 e retorno em `127.0.0.1`; resposta com `state` falsificado foi recusada. ⏳ O login completo com uma conta Google real depende do client ID da equipe (DA24) |

Total: **166 testes** (com o banco real), lint, tipos e build passando.
