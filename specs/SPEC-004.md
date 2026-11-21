# SPEC-004 — Recuperação de senha por e-mail

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pela equipe e implementada em 12/10/2026 (ver §9); revisar com a equipe no Pull Request |
| Fase | 1 — Conta e acesso ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should |
| Depende de | [SPEC-002](SPEC-002.md) |
| Requisitos | RF03; RB01; RNF07, RNF09, RNF10, RNF17, RNF18, RNF20 |
| Casos de uso | Autenticar-se (fluxo alternativo "esqueci minha senha", ainda fora do diagrama: OPEN-43) |
| Drivers | FAS07, QA06, RES05 |
| ADRs | [DA05](../adr/DA05-autenticacao-propria.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md) |

---

## 1. Objetivo

Quem esqueceu a senha consegue voltar a entrar sem depender da equipe:

1. na tela de entrada, clica em **"Esqueci minha senha"** e informa o e-mail;
2. recebe por e-mail um **código de 8 caracteres** (ex.: `K7QM-4XPD`), válido por 15 minutos;
3. digita o código e a nova senha **no próprio app**;
4. a senha é trocada, todas as sessões abertas são encerradas e a pessoa entra com a senha nova.

## 2. Valor

- **Usuário e colaborador:** não perdem a conta por esquecer a senha.
- **Equipe:** sem pedidos manuais para trocar senha.
- **Sistema:** fecha o RF03 e o ponto que a [DA05](../adr/DA05-autenticacao-propria.md) deixou como consequência da autenticação própria.

## 3. Escopo

### 3.1 Inclui

1. **Pedir o código** informando o e-mail. A resposta é sempre a mesma, exista a conta ou não.
2. **E-mail com o código**, no idioma do app (português ou inglês).
3. **Redefinir a senha** com e-mail, código e nova senha. Encerra todas as sessões da conta.
4. **E-mail de aviso** de que a senha foi trocada.
5. **Limites contra abuso:** por IP, por conta e por código.
6. **Telas no app:** link "Esqueci minha senha" nas telas Entrar e Área do colaborador, e a tela **Recuperar senha** em dois passos.
7. **Envio de e-mail por SMTP**, com o provedor escolhido só por configuração, e o **Mailpit** no `docker compose` para testar sem mandar e-mail de verdade.

### 3.2 Não inclui

- **Link no e-mail** para uma página web ou para o app (`simulador://…`). O app é desktop e não tem site; o código digitado no app evita os dois (ver §4).
- **Criar senha para conta só com Google**: decidido na SPEC-003 que não. Essas contas recebem um e-mail explicando que entram pelo Google.
- **Confirmação do e-mail no cadastro**: não está nos requisitos.
- **Escolha do provedor de e-mail e da hospedagem** (OPEN-02): esta Spec só define a interface SMTP.
- **Derrubar tokens de acesso já emitidos**: eles vencem sozinhos em até 15 minutos, como na troca de senha da SPEC-003.
- **E-mail em HTML elaborado**: texto simples basta.

## 4. Decisões tomadas nesta Spec

Aprovadas pela equipe em 12/10/2026: o colaborador também usa a recuperação por e-mail; os textos dos e-mails (§5.4) ficam como estão; o provedor de e-mail será escolhido junto com a hospedagem.

| Tema | Decisão | Motivo |
|---|---|---|
| **O que chega por e-mail** | Um **código** para digitar no app, não um link | O app é desktop: um link precisaria de um site ou de um protocolo próprio (`simulador://`), que funciona diferente no Windows, no macOS e no Linux e falha com o app fechado. O código funciona em qualquer cliente de e-mail, inclusive no celular |
| Formato do código | 8 caracteres do alfabeto Crockford, sem I, L, O e U (cerca de 1 trilhão de combinações), mostrado como `XXXX-XXXX`. O app aceita minúsculas, espaços e hífen; O vira 0, I e L viram 1 | Fácil de ler e digitar, e impossível de adivinhar com os limites abaixo |
| Validade | **15 minutos**, uso único. Pedir um código novo invalida o anterior | Janela curta reduz o risco de alguém usar um e-mail antigo |
| Como o código é guardado | Só um **HMAC-SHA-256** com chave derivada do segredo do servidor; nunca o código | Quem copiar o banco não consegue usar os códigos (QA06). SHA-256 puro não basta para um código curto: daria para testar todas as combinações |
| **Não revelar quem tem conta** | O pedido responde sempre **202, igual e na hora**, antes de consultar o banco e de enviar o e-mail. E-mail sem conta: nada é enviado. Conta só Google: recebe um aviso sem código | Mesmo princípio do "E-mail ou senha incorretos" da SPEC-002 (CA05): só o dono da caixa de e-mail descobre algo |
| Quem pode | Toda conta com senha: **usuário** (pela tela Entrar) e **colaborador** (pela Área do colaborador) | O colaborador já cuida do próprio e-mail e da própria senha (SPEC-003); não faz sentido depender da equipe só para isso |
| Depois de redefinir | Troca a senha (argon2id), **encerra todas as sessões** da conta, invalida os códigos pendentes e envia o e-mail de aviso. **Não abre sessão**: o app volta para a tela de origem com o e-mail já preenchido | Quem estava com uma sessão roubada perde o acesso. Entrar pela própria porta mantém a regra da SPEC-002 de que cada porta aceita só o seu tipo de conta |
| Limites (RNF10) | **IP:** 10 por minuto em cada rota, como em `/api/auth`. **Conta:** no máximo 5 e-mails por hora; pedidos além disso recebem a mesma resposta, sem e-mail. **Código:** na 5ª tentativa errada ele deixa de valer. **App:** "Reenviar código" só depois de 60 segundos | Impede adivinhar o código e encher a caixa de entrada de alguém |
| **Envio de e-mail (OPEN-02, parte do e-mail)** | Uma porta `EmailSender` com implementação **SMTP**, configurada por variáveis de ambiente (§6.2). Sem SMTP configurado, a recuperação fica **desligada**: as rotas respondem 503 e o app avisa | SMTP é o padrão: qualquer provedor com camada gratuita serve, e trocar de provedor não muda o código. Mesma ideia do Google desligado sem client ID |
| E-mail em desenvolvimento | **Mailpit** no `docker compose`: recebe os e-mails na própria máquina e mostra em `http://localhost:8025`. Nada sai para a internet | Testar o fluxo inteiro sem conta em provedor e sem mandar e-mail para ninguém |
| Onde o e-mail é enviado | No servidor de aplicação, logo depois de responder | O processador de tarefas só ganha fila na SPEC-008; o volume aqui é pequeno |
| Idioma do e-mail | O app envia o idioma da interface (`pt-BR` ou `en`); o padrão é `pt-BR` | RNF20; a conta não guarda idioma preferido |
| Formato do e-mail | Texto simples, sem links e sem imagens | Chega bem em qualquer cliente e tem menos chance de cair no spam. Sem link, ninguém imita o e-mail para roubar senha |
| Transporte | Em produção, SMTP só com TLS | Estende o RNF09 (canal cifrado) ao e-mail que sai do servidor |
| Logs | Registram a ação e o `id` da conta; **nunca** e-mail, código, senha, hash ou token | DA13 e RNF07. Pedido para e-mail sem conta não registra o e-mail |

## 5. Comportamento esperado

### 5.1 Rotas

Ficam em `/api/auth`, com o mesmo limite por IP das outras rotas de autenticação.

| Rota | Entrada | Sucesso | Erros |
|---|---|---|---|
| `POST /api/auth/password-reset/request` | `email`, `locale?` (`pt-BR` ou `en`) | **202** sem corpo, sempre (com conta, sem conta, só Google ou acima do limite da conta) | 400 `validation_error`; 429; 503 `password_reset_unavailable` |
| `POST /api/auth/password-reset/confirm` | `email`, `code`, `newPassword`, `locale?` (idioma do e-mail de aviso) | **204** | 400 `validation_error`; 400 `invalid_reset_code` (código errado, vencido, já usado, substituído, sem tentativas restantes ou e-mail sem conta: sempre o mesmo erro); 429; 503 `password_reset_unavailable` |

Nenhuma resposta contém o código, a senha, o hash ou a informação de que a conta existe.

### 5.2 Regras de validação

| Campo | Regra | Código de erro |
|---|---|---|
| `email` | Mesmas regras do cadastro (SPEC-002 §5.2) | `required`, `invalid_email`, `too_long` |
| `code` | Obrigatório; depois de normalizado (§4), 8 caracteres do alfabeto | `required`, `invalid_code` |
| `newPassword` | Mesmas regras da senha do cadastro: 8 a 128 caracteres | `required`, `too_short`, `too_long` |
| `locale` | Opcional; `pt-BR` ou `en`. Outro valor vira `pt-BR` | — |

As regras ficam em `packages/shared`, usadas pelo app e pelo servidor.

### 5.3 Telas

| Situação | Tela |
|---|---|
| Entrar e Área do colaborador | Link **"Esqueci minha senha"** |
| Recuperar senha, passo 1 | Campo de e-mail (já preenchido se a pessoa digitou no login) e **"Enviar código"** |
| Passo 2 | "Se houver uma conta com {e-mail}, enviamos um código. Ele vale por 15 minutos." Campos **Código** e **Nova senha**, botão **"Redefinir senha"**, **"Reenviar código"** liberado depois de 60 s (com contagem) e **"Usar outro e-mail"** |
| Código errado ou vencido | "Código inválido ou vencido. Confira o código ou peça um novo." |
| Recuperação desligada (503) | "A recuperação de senha não está disponível neste servidor." |
| Sucesso | Volta para a tela de origem (Entrar ou Área do colaborador) com o aviso "Senha redefinida. Entre com a nova senha." e o e-mail preenchido |

As telas ficam dentro da página de entrada, como as de login e cadastro. O código não é guardado em lugar nenhum do app e os campos são limpos ao sair da tela.

### 5.4 E-mails

| E-mail | Conteúdo |
|---|---|
| Código | Assunto "Seu código para redefinir a senha". O código em destaque, a validade de 15 minutos e a frase "Se você não pediu, ignore este e-mail: sua senha continua a mesma." Sem links |
| Conta só Google | Recebemos um pedido para redefinir a senha, mas esta conta entra com o Google e não tem senha. Use "Continuar com o Google" no app |
| Senha redefinida | Data e hora da troca, aviso de que todas as sessões foram encerradas e o que fazer se não foi a pessoa (pedir um novo código e falar com a equipe) |

Os três existem em português e em inglês.

## 6. Modelo de dados e configuração

### 6.1 Tabela nova

| Tabela | Colunas | Restrições |
|---|---|---|
| `redefinicao_senha` | `id`, `usuario_id`, `codigo_hash`, `tentativas`, `criado_em`, `expira_em`, `encerrado_em` (opcional) | Chave estrangeira para `usuario` com exclusão em cascata; `tentativas` entre 0 e 5; `expira_em` depois de `criado_em`; índice por `usuario_id` e `criado_em` |

- `encerrado_em` marca o código que já não vale: usado, substituído por um novo ou sem tentativas.
- O pedido de uma conta só Google também grava uma linha, já encerrada, só para contar no limite de 5 e-mails por hora.
- A tentativa é reservada no banco **antes** de comparar o código (um único `UPDATE` com a condição `tentativas < 5`): nem pedidos simultâneos passam do limite.
- Linhas com mais de 24 horas são apagadas quando a mesma conta pede um código novo. A limpeza automática pode ir para o processador de tarefas depois da SPEC-008.
- São dados temporários de segurança: **não entram na exportação** da SPEC-034 e são apagados junto com a conta.
- A migração tem `down.sql`, conforme a SPEC-001 (RNF17).

### 6.2 Configuração do servidor

| Variável | Uso |
|---|---|
| `SMTP_HOST` | Servidor SMTP. **Vazio desliga a recuperação** (503) |
| `SMTP_PORT` | Padrão 587. No desenvolvimento, 1025 (Mailpit) |
| `SMTP_USER`, `SMTP_PASSWORD` | Opcionais; o Mailpit não usa |
| `EMAIL_FROM` | Remetente, ex.: `Simulador de Investimentos <nao-responda@exemplo.com>`. Obrigatório quando `SMTP_HOST` está preenchido: sem ele, o servidor não inicia |

O `.env.example` vem apontando para o Mailpit. O `docker-compose.yml` ganha o serviço do Mailpit e o projeto ganha um comando para subi-lo, como o `db:up`.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Pedido para conta com senha responde 202 e envia um e-mail com código de 8 caracteres, no idioma pedido, válido por 15 minutos |
| CA02 | E-mail sem conta e conta só Google recebem exatamente a mesma resposta de uma conta com senha. Sem conta, nenhum e-mail sai; conta só Google recebe o aviso, sem código |
| CA03 | A resposta do pedido não espera a consulta ao banco nem o envio: com um envio lento de propósito, a resposta chega antes |
| CA04 | O banco guarda só o HMAC do código; nenhuma resposta contém o código; pedir um código novo invalida o anterior |
| CA05 | Com o código certo: 204; a nova senha funciona e a antiga não; os tokens de renovação de **todas** as sessões são recusados; os códigos pendentes deixam de valer; o e-mail de aviso é enviado |
| CA06 | Código errado, vencido, já usado, substituído ou de e-mail sem conta dá o mesmo `invalid_reset_code`, e nada muda |
| CA07 | Depois da 5ª tentativa errada, o código deixa de valer, mesmo digitado certo |
| CA08 | O 6º pedido em uma hora para a mesma conta recebe 202 igual, mas nenhum e-mail sai |
| CA09 | A 11ª requisição em um minuto, do mesmo IP, a cada uma das rotas recebe 429 (RNF10) |
| CA10 | O código é aceito com minúsculas, espaços, hífen e O/0, I/1, L/1 trocados; formato inválido dá `validation_error` com `invalid_code`; senha fora das regras dá `validation_error` |
| CA11 | A nova senha é guardada só como hash argon2id; nenhum log contém e-mail, código, senha, hash ou token (RNF07, DA13) |
| CA12 | Sem `SMTP_HOST`, as duas rotas respondem 503 `password_reset_unavailable` e o app mostra o aviso; `SMTP_HOST` sem `EMAIL_FROM` impede o servidor de iniciar com erro de configuração |
| CA13 | O colaborador redefine pela Área do colaborador e continua entrando só por ela; o usuário, pela tela Entrar |
| CA14 | Telas: link nas duas portas; fluxo em dois passos; "Reenviar código" só depois de 60 s; o sucesso volta para a tela de origem com o aviso e o e-mail preenchido; tudo em português e inglês e usável só pelo teclado (RNF18) |
| CA15 | A tabela `redefinicao_senha` existe com as restrições da §6.1; a migração pode ser desfeita e refeita (RNF17) |
| CA16 | Em desenvolvimento, com o Mailpit ligado, o fluxo completo funciona de ponta a ponta e o e-mail aparece em `http://localhost:8025` |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-02 | ✅ Parte do e-mail resolvida: envio por SMTP, registrado em [decisoes_tecnicas.md](../decisoes_tecnicas.md). ⏳ Falta escolher o provedor e o endereço de envio junto com a hospedagem (decisão da equipe). Sem domínio próprio, os e-mails podem cair no spam |
| — | ✅ O colaborador também usa a recuperação por e-mail (decisão da equipe, 12/10/2026) |
| — | ✅ Textos dos três e-mails aprovados (§5.4) |
| OPEN-43 | Diagrama de casos de uso ainda sem o fluxo "esqueci minha senha" |
| OPEN-44 | Incluir REDEFINICAO_SENHA na arquitetura (§9) e no modelo de domínio |

## 9. Verificação (12/10/2026)

| Critério | Resultado |
|---|---|
| CA01–CA08, CA11, CA13 | ✅ Testes das regras (`password-reset-service.test.ts`, repositórios em memória e relógio controlado) e das rotas HTTP (`password-reset-routes.test.ts`): e-mail com código em português e inglês, só o HMAC guardado, mesma resposta para conta com senha, sem conta e só Google, resposta antes do envio (com envio lento de propósito), código novo invalidando o anterior, senha trocada com sessões e códigos encerrados, erro único para código errado, vencido, usado ou de e-mail sem conta, 5ª tentativa errada, limite de 5 e-mails por hora, colaborador entrando só pela própria porta e nenhum dado pessoal nos logs |
| CA09 | ✅ Teste das rotas: a 11ª requisição em um minuto recebe 429 em cada rota |
| CA10 | ✅ Testes do esquema compartilhado e das rotas: minúsculas, espaços, hífen e O/0, I/1, L/1; `invalid_code` e regras da senha |
| CA12 | ✅ Testes: 503 nas duas rotas sem SMTP, mesmo com dados inválidos; `SMTP_HOST` sem `EMAIL_FROM` recusado na configuração. App mostra o aviso (conferido na tela) |
| CA14 | ✅ Telas conferidas no navegador (claro e escuro, português e inglês): link nas duas portas, dois passos, foco no primeiro campo de cada passo, contagem de 60 s para reenviar, erro de código, volta para a tela de origem com o aviso e o e-mail preenchido. Paridade dos idiomas coberta por teste. ⏳ Conferir no Electron |
| CA15 | ✅ PostgreSQL real (`prisma-identity.db.test.ts`): restrições de tentativas e validade, exclusão em cascata, 10 reservas simultâneas com só 5 aceitas, uso único; migração desfeita e refeita |
| CA16 | ✅ Ponta a ponta com o servidor compilado, PostgreSQL e Mailpit: 15 de 15 verificações (e-mail recebido com remetente, assunto e código, nenhum e-mail para endereço sem conta, código certo em minúsculas aceito, código reutilizado recusado, senha nova entra, antiga não, sessão antiga encerrada, aviso de troca recebido). Log do servidor sem e-mail, senha nem código |

Total: **259 testes** passando (com o banco real), lint, tipos, formatação e build.
