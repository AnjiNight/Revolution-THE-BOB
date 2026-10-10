# SPEC-003 — Perfil do usuário e consentimento

| Campo | Conteúdo |
|---|---|
| Status | Implementada em 10/10/2026 (ver §9); revisar com a equipe no Pull Request |
| Fase | 1 — Conta e acesso ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should |
| Depende de | [SPEC-002](SPEC-002.md) |
| Requisitos | RF05; RB01, RB03; RNF07, RNF10, RNF11, RNF20 |
| Casos de uso | Gerenciar perfil e consentimento |
| Drivers | QA05, QA07, RES05 |
| ADRs | [DA05](../adr/DA05-autenticacao-propria.md), [DA12](../adr/DA12-autorizacao-planos-no-servidor.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA24](../adr/DA24-login-com-google.md) |

---

## 1. Objetivo

A pessoa conectada (usuário ou colaborador) abre a tela **Meu perfil** e:

- vê e edita o **nome** e o **e-mail**;
- **troca a senha**;
- vê **quais termos aceitou**, em qual versão e quando, e aceita uma versão nova quando os termos mudarem.

## 2. Valor

- **Usuário:** controle sobre os próprios dados (LGPD).
- **Colaborador:** troca a senha gerada pela equipe por uma que ele conheça (pendência da SPEC-002).
- **Sistema:** histórico de consentimentos consultável (RNF11) e base para a SPEC-034.

## 3. Escopo

### 3.1 Inclui

1. **Consultar o perfil**: nome, e-mail, tipo de conta, formas de acesso (senha, Google) e data de criação.
2. **Editar o nome.**
3. **Trocar o e-mail**, pedindo a senha atual. O novo e-mail continua único (RB01).
4. **Trocar a senha**, pedindo a senha atual. As outras sessões da conta são encerradas; a sessão atual continua.
5. **Consultar os consentimentos**: tipo, versão e data de cada aceite.
6. **Aceitar uma versão nova dos termos**: quando a versão vigente for maior que a última aceita, o app mostra o aviso e registra o novo aceite.
7. **Tela Meu perfil** no app, acessível a partir do Início, para os dois tipos de conta.

### 3.2 Não inclui

- Retirar o consentimento dos termos: sem ele a conta não pode existir, então isso é a exclusão da conta (RF06, [SPEC-034](mapa_specs.md)). A tela mostra o caminho para essa opção.
- Recuperação de senha por e-mail (RF03, SPEC-004).
- Ligar ou desligar o Google pelo perfil.
- Criar senha para conta só com Google: **decidido que não** — o login com Google basta, como em outros serviços.
- Confirmação do novo e-mail por link: não está nos requisitos.
- Foto, telefone ou outros dados: o modelo de domínio não prevê.

## 4. Decisões propostas nesta Spec

| Tema | Decisão | Motivo |
|---|---|---|
| Quem usa | Usuário e colaborador; cada um só vê e altera **o próprio** perfil (RB03, DA12). A rota não recebe `id`: o servidor usa o do token | Evita acessar o perfil de outra pessoa |
| Senha atual | Exigida para trocar e-mail e senha | Uma sessão roubada não basta para tomar a conta |
| Conta só com Google | Pode editar o nome; **não** troca e-mail nem senha e **não cria senha** | Decisão da equipe (10/10/2026): o login com Google basta; o e-mail vem do Google |
| Colaborador | Pode editar o nome, trocar a senha e **trocar o e-mail** (com a senha atual) | Decisão da equipe (10/10/2026), "a princípio"; pode ser revista |
| Consentimento | Continua só o aceite obrigatório dos termos no cadastro, já entregue pela SPEC-002 (caixa marcada ao preencher os dados, ou no primeiro acesso pelo Google). Não há consentimentos opcionais | Decisão da equipe (10/10/2026) |
| Sessões após trocar a senha | Revoga **todos** os tokens de renovação da conta e devolve uma sessão nova para quem fez a troca, que o app guarda no lugar da antiga | Quem tinha a senha antiga perde o acesso. O token de acesso não diz a qual família pertence; abrir uma sessão nova é mais simples e tem o mesmo efeito para o usuário |
| Validação | Mesmas regras de nome, e-mail e senha da SPEC-002, do mesmo código em `packages/shared` | Uma regra só, no app e no servidor |
| Limite de tentativas | 10 por minuto, por IP, em cada rota que pede a senha atual (RNF10), igual às rotas de `/api/auth` | Dificulta adivinhar a senha com uma sessão roubada |
| Consentimentos | Só leitura e novo aceite; o histórico nunca é alterado nem apagado | Prova de consentimento (RNF11) |
| Auditoria | Toda alteração atualiza `atualizado_em`; o log registra a ação e o `id`, nunca nome, e-mail ou senha | DA13: dados pessoais fora dos logs |

## 5. Comportamento esperado

### 5.1 Rotas

Todas exigem `Authorization: Bearer <accessToken>`; sem token válido, 401 `unauthorized`.

| Rota | Entrada | Sucesso | Erros |
|---|---|---|---|
| `GET /api/me` | — | 200 com `user` (já existe, ganha os campos novos) | — |
| `PATCH /api/me` | `name` | 200 com `user` | 400 `validation_error` |
| `PUT /api/me/email` | `email`, `currentPassword` | 200 com `user` | 400 `validation_error`; 401 `invalid_password`; 403 `email_change_not_allowed` (conta só Google); 409 `email_in_use`; 429 |
| `PUT /api/me/password` | `currentPassword`, `newPassword` | 200 com a sessão nova (`user`, `accessToken`, `refreshToken`) | 400 `validation_error` (inclui nova igual à atual: `same_password`); 401 `invalid_password`; 403 `password_change_not_allowed` (conta só Google); 429 |
| `GET /api/me/consents` | — | 200 com a lista e a versão vigente | — |
| `POST /api/me/consents` | `type` (`terms`), `version` | 201 com `consent` | 400 `validation_error` (versão diferente da vigente: `invalid_version`) |

Nas rotas de perfil, `user` é o `UserProfile`: `{ id, name, email, role, hasPassword, hasGoogle, createdAt }`. As rotas de `/api/auth` continuam devolvendo o `user` da SPEC-002. Nenhuma resposta contém senha, hash, `google_sub` ou token, exceto a sessão nova da troca de senha.

### 5.2 Telas

| Situação | Tela |
|---|---|
| Início → "Meu perfil" | Dados da conta, com botões Editar nome, Trocar e-mail e Trocar senha conforme o tipo de conta |
| Salvar com erro | Mensagem por campo, igual ao cadastro |
| Senha atual errada | "Senha atual incorreta" |
| Troca de senha concluída | Aviso de que as outras sessões foram encerradas |
| Seção Consentimentos | Lista: termo, versão, data; link para "Excluir minha conta" (SPEC-034) |
| Versão nova dos termos | Ao entrar, aviso com o resumo e "Aceitar e continuar" |

## 6. Modelo de dados

Sem tabelas novas. Usa `usuario` e `consentimento` da SPEC-002. O índice único de `usuario.email` já garante RB01. Se nada mudar no esquema, não há migração.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | `GET /api/me` devolve os campos novos e nunca senha, hash ou token |
| CA02 | Nome válido é salvo; nome inválido dá `validation_error` com o problema do campo |
| CA03 | Trocar o e-mail com a senha certa salva o novo e-mail em minúsculas; o login passa a usar o novo |
| CA04 | E-mail já usado por outra conta, mesmo com maiúsculas diferentes, dá `email_in_use` (RB01) |
| CA05 | Senha atual errada dá `invalid_password` e nada muda |
| CA06 | Conta só Google recebe `email_change_not_allowed` e `password_change_not_allowed`; colaborador troca o e-mail com a senha atual e continua entrando só pela Área do colaborador |
| CA07 | Depois da troca de senha, a nova funciona, a antiga não, os tokens de renovação de outras sessões são recusados e a sessão atual continua |
| CA08 | Nova senha guardada só como hash argon2id; nenhum log contém nome, e-mail, senha ou token (RNF07, DA13) |
| CA09 | Não existe forma de ler ou alterar o perfil de outra conta (RB03) |
| CA10 | `GET /api/me/consents` lista os aceites com versão e data, e a versão vigente |
| CA11 | Aceitar a versão vigente registra um novo aceite; o histórico anterior continua igual |
| CA12 | A 11ª tentativa em um minuto nas rotas com senha atual recebe 429 (RNF10) |
| CA13 | A tela Meu perfil funciona para usuário e colaborador, em português e inglês, com os botões certos para cada tipo de conta |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | ✅ Conta só com Google não cria senha (§4) |
| — | ✅ Colaborador troca o próprio e-mail, a princípio (§4) |
| — | ✅ Sem consentimentos opcionais; só o aceite dos termos no cadastro (§4) |
| — | ✅ Conta com senha **e** Google pode trocar o e-mail; o login com Google continua pelo `google_sub`, mesmo com e-mail diferente do Google (decisão da equipe, 10/10/2026) |
| OPEN-43 | Diagrama de casos de uso ainda sem a troca de senha |

## 9. Verificação (10/10/2026)

| Critério | Resultado |
|---|---|
| CA01–CA07, CA09–CA12 | ✅ Testes automatizados das regras (`profile-service.test.ts`, repositórios em memória) e das rotas HTTP (`profile-routes.test.ts`): perfil sem hash, nome, troca de e-mail (inclusive colaborador e conta com senha + Google), e-mail duplicado (409), senha atual errada (401), conta só Google (403), troca de senha derrubando as sessões antigas, `id` no corpo ignorado, consentimentos e 429 na 11ª tentativa |
| CA08 | ✅ Teste confirma que os logs não contêm nome, e-mail, senhas, hash nem token. O hash argon2id é o mesmo `Argon2PasswordHasher` da SPEC-002 |
| CA13 | ✅ Tipos e build do app; cliente testado (`auth-client.test.ts`); textos em português e inglês com paridade testada. ⏳ Conferir a tela manualmente no Electron |
| Banco real | ⏳ Testes novos em `prisma-identity.db.test.ts` (atualização de nome, e-mail e senha; histórico de consentimentos; `revokeAllForUser`) **não rodaram**: sem PostgreSQL/Docker na máquina. Rodar com `TEST_DATABASE_URL`. Esquema sem mudanças, então não há migração |

Total: **197 testes** passando (13 de banco pulados), lint, tipos, formatação e build.
