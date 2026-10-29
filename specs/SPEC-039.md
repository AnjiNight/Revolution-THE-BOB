# SPEC-039 — Confirmação de e-mail

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pelo Luís em 12/10/2026 e implementada (ver §9); textos dos e-mails e a mudança na SPEC-003 a revisar com a Nicoly no Pull Request |
| Fase | 1 — Conta e acesso ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should |
| Depende de | [SPEC-002](SPEC-002.md), [SPEC-003](SPEC-003.md), [SPEC-004](SPEC-004.md) |
| Requisitos | RF43 (novo), RF01, RF05, RF41; RB01, RB04, RB23 (nova); RNF07, RNF10, RNF11, RNF17, RNF18, RNF20 |
| Casos de uso | Cadastrar conta; Gerenciar perfil e consentimento (confirmação ainda fora do diagrama: OPEN-43) |
| Drivers | FAS07, QA06, QA07, RES05 |
| ADRs | [DA05](../adr/DA05-autenticacao-propria.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA24](../adr/DA24-login-com-google.md) |

---

## 1. Objetivo

Só entra no app quem provou que o e-mail é seu:

- **Cadastro com e-mail e senha:** a conta nasce **pendente**. O app pede o código enviado para o e-mail e só depois de confirmado a pessoa entra.
- **Troca de e-mail no Meu perfil:** o e-mail novo só passa a valer depois de confirmado com o código enviado para ele.
- **Google:** a conta já nasce confirmada, porque o Google só entrega e-mail verificado (SPEC-002).

Não existe outro jeito de saber se um e-mail existe: os provedores não respondem a esse tipo de consulta. Mandar um código prova duas coisas de uma vez: que o endereço existe e que é da pessoa.

## 2. Valor

- **Usuário:**
  - não perde a conta por erro de digitação no e-mail, porque o "Esqueci minha senha" (SPEC-004) sempre chega;
  - ninguém cria conta com o e-mail dele.
- **Sistema:**
  - não guarda dado pessoal nem "aceite dos termos" de quem nunca se cadastrou (LGPD, RNF11);
  - fecha o risco de alguém se apossar de uma conta antes de ela existir, pelo login com Google (§4).

## 3. Escopo

### 3.1 Inclui

1. **Cadastro em duas etapas:** o cadastro cria a conta pendente e envia o código; não abre sessão.
2. **Tela "Confirme seu e-mail":** código, "Reenviar código" depois de 60 s e "Corrigir e-mail" (volta ao cadastro com os dados preenchidos).
3. **Confirmação:** com o código certo, a conta é liberada e a pessoa entra no Início.
4. **Login de conta pendente:** com a senha certa, o app leva à tela de confirmação e envia um código novo.
5. **Novo cadastro com o e-mail de uma conta pendente:** substitui a conta pendente.
6. **Limpeza:** contas pendentes são apagadas 7 dias depois do cadastro.
7. **Troca de e-mail em duas etapas** no Meu perfil: pedido com a senha atual, código no e-mail novo, confirmação. O e-mail antigo recebe um aviso.
8. **Google:** conta criada pelo Google nasce confirmada; Google com o e-mail de uma conta pendente descarta a pendente.
9. **Contas que já existem e colaboradores:** ficam confirmados.

### 3.2 Não inclui

- **Link no e-mail:** o app é desktop, pelo mesmo motivo da SPEC-004; o código é digitado no app.
- **Confirmação do e-mail do colaborador:** a conta é criada pela equipe, que entrega o acesso por um canal seguro.
- **Pedir confirmação de novo de tempos em tempos.**
- **Bloquear provedores de e-mail descartável.**

## 4. Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| **Conta antes de confirmar** | **Não funciona:** o cadastro não abre sessão e o login é recusado até a confirmação | Decisão da equipe (Luís, 12/10/2026). Mais simples que uma conta "meio ativa" |
| **Troca de e-mail no perfil** | O e-mail novo **só vale depois do código** enviado para ele; até lá, o antigo continua valendo | Decisão da equipe (12/10/2026). Confirmar o e-mail no cadastro prova só o endereço antigo; o novo nunca foi conferido e pode ter erro de digitação |
| **Google** | Conta criada pelo Google nasce confirmada | Decisão da equipe (12/10/2026). O app só aceita e-mail que o Google já verificou |
| Código | O mesmo da SPEC-004: 8 caracteres, só o HMAC guardado, 15 minutos, uso único, 5 tentativas, no máximo 5 e-mails por conta e por hora | Reaproveita o que já foi feito e testado |
| Login de conta pendente | Só com a **senha certa**: 403 `email_not_confirmed`, e um código novo é enviado (dentro do limite por hora). Senha errada continua dando "E-mail ou senha incorretos" | Mesmo princípio do `wrong_account_type` (SPEC-002): não revela quem tem conta |
| Cadastro sobre conta pendente | Substitui o nome e a senha da conta pendente e envia um código novo. `email_in_use` só para conta **confirmada** | Quem digitou o e-mail de outra pessoa por engano não bloqueia o dono. Substituir não dá acesso a ninguém: ainda é preciso o código que chega na caixa de entrada |
| **Google sobre conta pendente** | A conta pendente é **descartada**, junto com a senha que alguém escolheu, e a pessoa entra só com o Google | Fecha o "sequestro antes do cadastro". Hoje (SPEC-002), alguém pode criar conta com o e-mail de outra pessoa e uma senha própria; quando o dono entra com o Google, as contas se ligam e a senha do intruso continua valendo |
| Prazo da conta pendente | **7 dias.** Depois disso ela é apagada: nome, e-mail, senha, aceite dos termos e códigos | LGPD (RB04, DA13): não guardar dado de quem não confirmou |
| Quem apaga | O processador de tarefas, uma vez por dia. Até lá, conta pendente vencida é tratada como inexistente | O processador já existe (SPEC-001) e não precisa de fila para isso |
| "Esqueci minha senha" com conta pendente | Não envia código: a conta é tratada como inexistente | Quem esqueceu a senha antes de confirmar pode simplesmente se cadastrar de novo |
| Troca para e-mail já usado | E-mail de conta confirmada: `email_in_use`, como hoje. E-mail de conta pendente: permitido; a pendente é descartada quando a troca for confirmada | O dono confirmado do endereço tem prioridade sobre um cadastro que nunca foi confirmado |
| Aviso ao e-mail antigo | Depois da troca, o endereço antigo recebe um aviso, sem link e com o e-mail novo parcialmente escondido (ex.: `a***@gmail.com`) | Se não foi a pessoa, ela fica sabendo |
| Contas existentes e colaboradores | A migração marca as contas atuais como confirmadas; o colaborador nasce confirmado | Ainda não há usuários reais; o colaborador já tem vínculo com a equipe |
| Logs | Ação e `id` da conta; nunca e-mail, código ou senha | DA13, RNF07 |
| SMTP obrigatório em produção | Sem `SMTP_HOST`, o servidor de produção não inicia. Fora de produção ele sobe, mas o cadastro com senha e a troca de e-mail respondem 503 `email_confirmation_unavailable`; o Google continua | Sem e-mail, ninguém confirmaria a conta (RB23). Decidido na implementação |
| Motor de códigos | A redefinição de senha (SPEC-004) e a confirmação usam o mesmo mecanismo: mesma tabela, mesmo formato, mesmos limites | Uma regra de segurança só, testada uma vez |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Entrada | Sucesso | Erros |
|---|---|---|---|
| `POST /api/auth/register` (**muda**) | Igual à SPEC-002, mais `locale?` | **202** sem corpo: conta pendente criada e código enviado; **sem sessão** | 400 `validation_error`; 409 `email_in_use` (só conta confirmada); 429 |
| `POST /api/auth/email-confirmation/confirm` (nova) | `email`, `code` | 200 com a sessão (`user`, `accessToken`, `refreshToken`) | 400 `invalid_confirmation_code` (errado, vencido, usado, sem tentativas ou sem conta pendente: sempre o mesmo); 429 |
| `POST /api/auth/email-confirmation/resend` (nova) | `email`, `locale?` | 202 sem corpo, sempre | 400 `validation_error`; 429 |
| `POST /api/auth/login` (**muda**) | Igual | Igual | Mais 403 `email_not_confirmed`, só com a senha certa |
| `POST /api/auth/google` (**muda**) | Igual | Igual; conta pendente com o mesmo e-mail é descartada | Igual |
| `PUT /api/me/email` (**muda**) | `email`, `currentPassword`, `locale?` | **202** sem corpo: o e-mail **ainda não muda**; código enviado ao e-mail novo | Iguais aos da SPEC-003 |
| `POST /api/me/email/confirm` (nova) | `code` | 200 com `user` já com o e-mail novo | 400 `invalid_confirmation_code`; 409 `email_in_use` (alguém confirmou o mesmo e-mail antes); 429 |

### 5.2 Telas

| Situação | Tela |
|---|---|
| Cadastro enviado | **"Confirme seu e-mail":** "Enviamos um código para {e-mail}. Ele vale por 15 minutos." Campo Código, **"Confirmar e entrar"**, **"Reenviar código"** depois de 60 s e **"Corrigir e-mail"** |
| Código certo | Início |
| Código errado ou vencido | "Código inválido ou vencido. Confira o código ou peça um novo." |
| Login de conta pendente, senha certa | Mesma tela, com "Sua conta ainda não foi confirmada. Enviamos um código novo." |
| Meu perfil → Trocar e-mail | Depois de salvar, o próprio cartão pede o código: "Enviamos um código para {e-mail novo}. Seu e-mail só muda depois da confirmação." Cancelar mantém o e-mail atual |

### 5.3 E-mails

| E-mail | Conteúdo |
|---|---|
| Confirmação do cadastro | Código em destaque, validade de 15 minutos e "Se você não criou esta conta, ignore este e-mail: ela será apagada em 7 dias." Sem links |
| Confirmação do e-mail novo | Código em destaque, validade e "Se você não pediu esta troca, ignore este e-mail." |
| Aviso ao e-mail antigo | "O e-mail da sua conta foi trocado para a***@…, em {data e hora}. Se não foi você, alguém pode ter entrado na sua conta: avise a equipe do projeto o quanto antes." (O "Esqueci minha senha" não serve aqui: o endereço antigo já não pertence à conta.) |

Os três existem em português e em inglês.

## 6. Modelo de dados

| Tabela | Mudança |
|---|---|
| `usuario` | Nova coluna `email_confirmado_em` (opcional): vazia = conta pendente. A migração preenche as contas existentes com a data de criação. `CHECK`: colaborador e conta com Google sempre confirmados |
| `usuario` | Nova coluna `email_pendente` (opcional): o e-mail novo esperando confirmação, em minúsculas |
| `redefinicao_senha` (SPEC-004) | Renomeada para **`codigo_email`**, com a coluna `finalidade` ∈ {`redefinir_senha`, `confirmar_cadastro`, `trocar_email`}. O limite de 5 e-mails por hora passa a contar todas as finalidades juntas |

A exclusão de uma conta pendente apaga também o consentimento e os códigos (cascata). A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Cadastro com e-mail e senha responde 202, sem sessão; a conta fica pendente e recebe o e-mail com o código |
| CA02 | Código certo confirma a conta e devolve a sessão; código errado, vencido, já usado ou de e-mail sem conta pendente dá `invalid_confirmation_code`; depois da 5ª tentativa errada, nem o certo funciona |
| CA03 | Login de conta pendente: senha errada dá `invalid_credentials`; senha certa dá 403 `email_not_confirmed` e um código novo é enviado |
| CA04 | Conta pendente não consegue sessão por nenhum caminho (login, Área do colaborador, renovação, Google) |
| CA05 | Novo cadastro com o e-mail de conta pendente substitui nome e senha, e só o último código vale; com o e-mail de conta confirmada dá `email_in_use` |
| CA06 | "Reenviar" responde 202 sempre; no máximo 5 e-mails por conta e por hora; a 11ª requisição em um minuto, do mesmo IP, recebe 429 (RNF10) |
| CA07 | Contas pendentes com mais de 7 dias são apagadas pelo processador, com consentimento e códigos; uma pendente vencida já é tratada como inexistente antes da limpeza |
| CA08 | Troca de e-mail: o e-mail só muda depois do código enviado ao endereço novo; até lá, o login continua com o antigo; o antigo recebe o aviso; código errado não muda nada |
| CA09 | Conta criada pelo Google nasce confirmada; Google com o e-mail de uma conta pendente descarta a pendente, e a senha dela deixa de funcionar |
| CA10 | "Esqueci minha senha" não envia código para conta pendente |
| CA11 | Colaborador criado pela equipe e contas que já existiam estão confirmados |
| CA12 | Nenhum log contém e-mail, código ou senha (RNF07, DA13) |
| CA13 | Telas em português e inglês, usáveis só pelo teclado (RNF18), com foco no campo do código |
| CA14 | As colunas e a tabela existem com as restrições da §6; a migração pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| — | ✅ Prazo de **7 dias** para apagar contas pendentes (Luís, 12/10/2026) |
| — | Revisar os textos dos três e-mails (§5.3) no Pull Request |
| — | ✅ Esta Spec **muda comportamentos já entregues**: o CA01 da SPEC-002 (o cadastro deixa de abrir sessão) e o CA03 da SPEC-003 (a troca de e-mail passa a ter duas etapas). As duas ganharam uma nota apontando para cá |
| OPEN-43 | Diagrama de casos de uso ainda sem a confirmação de e-mail |
| OPEN-44 | Incluir `email_confirmado_em`, `email_pendente` e CODIGO_EMAIL na arquitetura (§9) e no modelo de domínio |
| — | SPEC-034 (exportação e exclusão) deve incluir `email_pendente` |

## 9. Verificação (12/10/2026)

| Critério | Resultado |
|---|---|
| CA01–CA05, CA09, CA11 | ✅ Testes das regras (`auth-service.test.ts`) e das rotas (`auth-routes.test.ts`): cadastro sem sessão e com e-mail de código; confirmação abrindo a sessão; código errado, antigo ou de e-mail sem conta recusado; login de conta pendente com `email_not_confirmed` só com a senha certa e código novo; nenhuma sessão para conta pendente; cadastro sobre pendente substituindo nome e senha; **Google com o e-mail de uma conta pendente descartando a pendente e a senha do intruso**; Google e colaborador nascendo confirmados |
| CA06 | ✅ Reenviar com resposta 202 igual para conta pendente e sem conta; limite de 5 e-mails por hora (motor compartilhado com a SPEC-004); 429 na 11ª requisição por minuto |
| CA07 | ✅ Testes: pendente com mais de 7 dias tratada como inexistente; limpeza apaga só as vencidas, com consentimento e códigos (PostgreSQL real). Processador de verdade: a tarefa diária apagou a conta envelhecida para 8 dias e manteve as confirmadas |
| CA08 | ✅ Testes das regras (`profile-service.test.ts`) e das rotas (`profile-routes.test.ts`): o e-mail só muda com o código do endereço novo; o perfil mostra o e-mail pendente; aviso ao endereço antigo com o novo escondido; e-mail de conta pendente pode ser usado; código errado não muda nada |
| CA10 | ✅ Teste: "Esqueci minha senha" não envia nada para conta pendente |
| CA12 | ✅ Testes: nenhum log contém e-mail, código ou senha |
| CA13 | ✅ Telas conferidas no navegador: "Confirme seu e-mail" após o cadastro e após o login de conta pendente, foco no código, contagem para reenviar, "Corrigir e-mail" voltando com nome e e-mail preenchidos, código errado e certo; troca de e-mail no Meu perfil em duas etapas, com "Aguardando confirmação" ao cancelar. Paridade dos idiomas coberta por teste. ⏳ Conferir no Electron |
| CA14 | ✅ PostgreSQL real: restrições de confirmação e de e-mail pendente; migração aplicada, conferida contra o esquema do Prisma (nenhuma diferença), desfeita e refeita |
| Ponta a ponta | ✅ Servidor compilado, PostgreSQL e Mailpit: 17 de 17 verificações (cadastro, e-mail de confirmação, login pendente, código substituído, confirmação, troca de e-mail com aviso ao endereço antigo, redefinição de senha ignorando conta pendente). Log sem e-mail nem senha |

Total: **293 testes** passando (com o banco real), lint, tipos, formatação e build.
