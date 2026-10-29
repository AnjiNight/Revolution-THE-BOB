# SPEC-034 — Exportação e exclusão de dados pessoais

| Campo | Conteúdo |
|---|---|
| Status | Aprovada pelo Luís em 13/10/2026 e implementada (ver §9) |
| Fase | 1 — Conta e acesso ([mapa de specs](mapa_specs.md)) |
| Prioridade | **Must** |
| Depende de | [SPEC-002](SPEC-002.md), [SPEC-003](SPEC-003.md), [SPEC-039](SPEC-039.md) (código por e-mail) |
| Requisitos | RF06; RB04; RNF07, RNF10, RNF11, RNF17, RNF18, RNF20 |
| Casos de uso | Gerenciar perfil e consentimento |
| Drivers | FAS09, QA07, PA06, RES05 |
| ADRs | [DA08](../adr/DA08-cache-dois-niveis-offline-leitura.md), [DA13](../adr/DA13-dados-pessoais-concentrados.md), [DA14](../adr/DA14-registro-execucoes-logs.md) |

---

## 1. Objetivo

Os dois direitos da LGPD sobre os próprios dados, na tela **Meu perfil**:

- **Baixar meus dados:** um arquivo com tudo o que o app guarda sobre a pessoa, num formato que outro programa consegue ler.
- **Excluir minha conta:** a conta e todos os dados pessoais são apagados, depois de a pessoa confirmar com um código enviado ao e-mail da conta.

Esta Spec cobre os dados que existem hoje: conta, consentimentos, sessões e códigos de e-mail. **Cada Spec seguinte que guardar dado do usuário entrega a sua parte** da exportação e da exclusão (carteiras, lançamentos, simulações, assinatura, fontes de notícias, cache local).

## 2. Valor

- **Usuário:** controle real sobre os próprios dados; consegue sair do app sem deixar rastro.
- **Sistema:** conformidade com a LGPD (RES05, RNF11) desde o começo, antes de existir qualquer carteira.
- **Equipe:** o caminho da exclusão fica pronto e testado; as próximas Specs só acrescentam as suas tabelas.

## 3. Escopo

### 3.1 Inclui

1. **Exportação** em arquivo JSON, baixado direto pelo app, que pergunta onde salvar.
2. **Pedido de exclusão** com aviso claro do que será apagado e **código enviado ao e-mail da conta**.
3. **Exclusão imediata** depois do código certo: conta, consentimentos, sessões e códigos.
4. **Registro da exclusão** sem nenhum dado pessoal (QA07 pede "registro do pedido").
5. **E-mail de despedida** confirmando que a conta foi excluída.
6. **No app:** depois da exclusão, a sessão guardada no dispositivo é apagada e a pessoa volta para a página de entrada com um aviso.
7. Seção **"Seus dados"** no Meu perfil, e o texto dos consentimentos passa a apontar para ela.
8. **Regra de retenção** de backups e logs compatível com os 30 dias da RB04 (OPEN-40).

### 3.2 Não inclui

- **Exclusão de carteira** (OPEN-15): fica com a SPEC-012. A regra para lá é que excluir a conta apaga as carteiras de vez (DA13).
- **Exclusão de conta de colaborador** pelo app: a conta é da equipe, e quem remove é a equipe (comando no servidor, numa Spec futura).
- **Prazo para desistir** da exclusão: ela é imediata (§4).
- **Envio do arquivo por e-mail:** dados pessoais não circulam por e-mail.
- **Limpeza do cache local:** o cache ainda não existe; chega com a SPEC-032, que entrega a sua parte.

## 4. Decisões tomadas nesta Spec

Aprovadas pela equipe em 13/10/2026: exclusão **imediata**; confirmação por **código no e-mail**; colaborador **não** se exclui pelo app; backups e logs por **no máximo 30 dias** (o detalhe fica para quando a hospedagem for escolhida).

| Tema | Decisão | Motivo |
|---|---|---|
| **Formato da exportação (OPEN-04)** | **JSON** com versão do formato (`format`, `version`), data de geração e uma seção por tipo de dado. Nomes dos campos em inglês, como no resto da API | A LGPD pede formato que permita usar os dados em outro serviço; JSON é aberto e qualquer linguagem lê. A versão deixa as próximas Specs acrescentarem seções sem quebrar quem já leu |
| **Conteúdo** | Conta (nome, e-mail, tipo, formas de acesso, datas de criação e de confirmação, e-mail pendente), consentimentos (todos, com versão e data) e sessões (início, última renovação, validade, se foi encerrada) | É tudo o que o app guarda sobre a pessoa hoje |
| O que **não** entra | Hash da senha, tokens, códigos de e-mail e o identificador interno do Google | São segredos de segurança ou dados técnicos temporários; não descrevem a pessoa e, se vazassem pelo arquivo, ajudariam um ataque. A exportação diz só "entra com Google: sim" |
| **Entrega (OPEN-04)** | O app pede o arquivo ao servidor e mostra a janela "Salvar como", com o nome `simulador-meus-dados-AAAA-MM-DD.json` | Sem e-mail, sem link público: o arquivo vai direto para o computador da pessoa |
| **Confirmação da exclusão** | **Código enviado ao e-mail da conta**, o mesmo motor da SPEC-004 e da SPEC-039 (8 caracteres, 15 minutos, 5 tentativas, 5 e-mails por hora) | Uma sessão roubada não basta para apagar a conta. Funciona igual para conta com senha e conta só Google, que não tem senha para digitar |
| **Quando apaga** | **Na hora**, assim que o código certo chega | Cumpre a RB04 (até 30 dias) com folga e não cria um estado "exclusão agendada". O aviso e o código evitam exclusão por engano |
| O que é apagado | A linha da conta e, em cascata, consentimentos, sessões e códigos. Todas as sessões deixam de valer na mesma hora | DA13: os dados pessoais estão concentrados na identidade; o resto do sistema só guarda o `id` |
| **Logs** | Não são reescritos: desde a SPEC-002 eles guardam só o `id` da conta, nunca nome, e-mail ou senha. Apagada a conta, o `id` não aponta para ninguém | É a anonimização que a DA13 pede, sem custo |
| **Registro da exclusão** | Tabela `exclusao_conta` com um `id` próprio, o `id` antigo da conta (sem chave estrangeira) e a data. Nenhum nome ou e-mail | QA07 pede o registro do pedido; sem dado pessoal, o registro não fere a exclusão |
| E-mail de despedida | Enviado depois de apagar, para o endereço que a conta tinha; diz só que a conta foi excluída e quando | Se não foi a pessoa, ela fica sabendo |
| Mesmo e-mail depois | Pode criar uma conta nova com o mesmo e-mail, que nasce do zero (outro `id`) | Nada da conta antiga sobra para ligar as duas |
| Colaborador | **Não** exclui a própria conta pelo app (403 `deletion_not_allowed`); a equipe remove | A conta de colaborador é criada e controlada pela equipe (SPEC-002) |
| **Retenção (OPEN-40)** | Backups do banco guardados por **no máximo 30 dias**; logs da aplicação também. Vale quando a hospedagem for escolhida | Um backup antigo ainda tem os dados apagados; com 30 dias, eles somem de todas as cópias dentro do prazo da RB04 |
| Limites | 10 requisições por minuto, por IP, em cada rota (RNF10) | Igual às outras rotas sensíveis |

## 5. Comportamento esperado

### 5.1 Rotas

Todas exigem `Authorization: Bearer <accessToken>`.

| Rota | Entrada | Sucesso | Erros |
|---|---|---|---|
| `GET /api/me/export` | — | 200 com o JSON, `Content-Disposition: attachment` | 401; 429 |
| `POST /api/me/deletion/request` | `locale?` | **202** sem corpo; código enviado ao e-mail da conta | 401; 403 `deletion_not_allowed` (colaborador); 429; 503 `email_confirmation_unavailable` |
| `POST /api/me/deletion/confirm` | `code` | **204**: conta apagada | 400 `invalid_confirmation_code`; 401; 403 `deletion_not_allowed`; 429 |

### 5.2 Exemplo do arquivo

```json
{
  "format": "simulador-investimentos/dados-pessoais",
  "version": 1,
  "exportedAt": "2026-10-13T15:00:00.000Z",
  "account": {
    "id": "…",
    "name": "Ana Souza",
    "email": "ana@exemplo.com",
    "role": "user",
    "signInMethods": ["password", "google"],
    "createdAt": "…",
    "emailConfirmedAt": "…",
    "pendingEmail": null
  },
  "consents": [{ "type": "terms", "version": "1", "acceptedAt": "…" }],
  "sessions": [{ "startedAt": "…", "lastRenewedAt": "…", "expiresAt": "…", "ended": false }]
}
```

### 5.3 Telas

| Situação | Tela |
|---|---|
| Meu perfil | Nova seção **"Seus dados"** com **"Baixar meus dados"** e **"Excluir minha conta"** (botão em vermelho) |
| Baixar meus dados | Janela "Salvar como"; depois, "Arquivo salvo." |
| Excluir minha conta, passo 1 | Aviso: "Isto apaga sua conta, seus consentimentos e suas sessões. Não dá para desfazer." e **"Enviar código para {e-mail}"** |
| Passo 2 | Campo do código, **"Excluir minha conta para sempre"** (vermelho) e **"Cancelar"** |
| Código errado | "Código inválido ou vencido. Confira o código ou peça um novo." |
| Conta excluída | O app apaga a sessão guardada e volta para a página de entrada com "Sua conta foi excluída. Seus dados foram apagados." |
| Seção Consentimentos | O texto passa a ser "Para retirar o consentimento, exclua sua conta em Seus dados." |
| Colaborador | A seção mostra só "Baixar meus dados" e a frase "A exclusão de contas de colaborador é feita pela equipe." |

### 5.4 E-mails

| E-mail | Conteúdo |
|---|---|
| Código de exclusão | Assunto "Código para excluir sua conta". O código, a validade de 15 minutos e "Se você não pediu, ignore este e-mail e troque sua senha: alguém pode estar usando sua conta." Sem links |
| Conta excluída | Data e hora da exclusão e "Seus dados foram apagados. Se quiser voltar, é só criar uma conta nova." |

Os dois existem em português e em inglês.

## 6. Modelo de dados

| Tabela | Mudança |
|---|---|
| `codigo_email` | Nova finalidade `excluir_conta` |
| `exclusao_conta` (nova) | `id`, `usuario_id` (o id antigo, **sem** chave estrangeira), `excluida_em`. Nenhum dado pessoal |

A migração tem `down.sql` (RNF17).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | A exportação traz conta, consentimentos e sessões, e nunca hash de senha, token, código ou o identificador do Google |
| CA02 | O arquivo é JSON com `format`, `version` e `exportedAt`; o app salva onde a pessoa escolher, com o nome sugerido |
| CA03 | O pedido de exclusão responde 202, envia o código ao e-mail da conta e não apaga nada ainda |
| CA04 | Com o código certo: 204; a conta, os consentimentos, as sessões e os códigos somem do banco; o token de acesso e o de renovação deixam de valer; o registro em `exclusao_conta` não tem nome nem e-mail; o e-mail de despedida é enviado |
| CA05 | Código errado, vencido ou já usado dá `invalid_confirmation_code` e nada é apagado; depois da 5ª tentativa errada, nem o certo vale |
| CA06 | Colaborador recebe 403 `deletion_not_allowed` no pedido e na confirmação; conta só Google exclui normalmente |
| CA07 | Depois da exclusão, o mesmo e-mail pode criar uma conta nova, com outro `id` e sem nada da antiga |
| CA08 | A 11ª requisição em um minuto, do mesmo IP, em cada rota recebe 429 (RNF10) |
| CA09 | Nenhum log contém nome, e-mail, código ou senha; depois da exclusão, nada no banco liga o `id` dos logs a uma pessoa |
| CA10 | No app: seção "Seus dados" com os dois botões; o arquivo é salvo; a exclusão mostra o aviso, pede o código e, no fim, apaga a sessão local e volta para a página de entrada com o aviso; tudo em português e inglês e usável pelo teclado (RNF18) |
| CA11 | A migração cria a finalidade e a tabela, e pode ser desfeita e refeita (RNF17) |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-04 | ✅ **Resolvida nesta Spec** (§4): JSON versionado, baixado pelo app |
| OPEN-40 | ✅ Regra decidida (§4): backups e logs por no máximo 30 dias. ⏳ Configurar quando a hospedagem for escolhida (OPEN-02) |
| OPEN-15 | Fica com a SPEC-012 (exclusão de carteira) |
| — | ✅ Exclusão **imediata**, sem prazo para desistir (Luís, 13/10/2026) |
| — | ✅ Exclusão confirmada por **código no e-mail** (Luís, 13/10/2026) |
| — | Remoção de conta de colaborador pela equipe (comando no servidor): Spec futura |
| OPEN-43 | Diagrama de casos de uso sem a exportação e a exclusão |
| OPEN-44 | Incluir EXCLUSAO_CONTA na arquitetura (§9) e no modelo de domínio |

## 9. Verificação (13/10/2026)

| Critério | Resultado |
|---|---|
| CA01, CA02 | ✅ Testes das regras (`account-data-service.test.ts`) e das rotas (`account-data-routes.test.ts`): conta, consentimentos e sessões (uma por login); nenhum hash, token, código ou identificador do Google no arquivo; nome do arquivo com a data. App: "Salvar como" com o nome sugerido, cancelar sem salvar, erro do servidor sem abrir a janela (`data-export.test.ts`) |
| CA03–CA07 | ✅ Testes das regras e das rotas: pedido 202 sem apagar; código certo apaga conta e consentimentos, grava só o id e a data, derruba o token de acesso (401 em todas as rotas) e o de renovação, e manda a despedida; código errado não apaga; 5ª tentativa; colaborador recebe 403; conta só Google exclui; o mesmo e-mail cria conta nova com outro id |
| CA08, CA09 | ✅ Testes: 429 na 11ª requisição por minuto; nenhum log com nome, e-mail ou código |
| CA10 | ✅ Telas conferidas no navegador (claro e escuro): seção "Seus dados", "Arquivo salvo.", aviso em vermelho, código errado e certo, volta para "Entrar" com "Sua conta foi excluída", colaborador só com "Baixar meus dados" e a nota da equipe. Cliente testado (`auth-client.test.ts`: a exclusão apaga a sessão guardada no dispositivo). Paridade dos idiomas coberta por teste. ⏳ Conferir no Electron (janela "Salvar como" de verdade) |
| CA04, CA11 (banco real) | ✅ PostgreSQL real (`prisma-identity.db.test.ts`): exclusão em cascata de conta, consentimentos, sessões e códigos, com o registro só com id e data; sessões resumidas por login; fluxo completo pela API. Migração `20261013120000_exclusao_conta` conferida contra o esquema do Prisma (nenhuma diferença), desfeita (tabela e finalidade removidas) e refeita |
| Ponta a ponta | ✅ Servidor compilado, PostgreSQL e Mailpit: 15 de 15 verificações (arquivo com nome e conteúdo certos e sem segredos, código no e-mail da conta, código errado sem apagar, exclusão de tudo, registro sem nome nem e-mail, acesso antigo recusado, despedida recebida, conta nova com o mesmo e-mail e outro id). Log do servidor sem dado pessoal |

Total: **321 testes** passando (com o banco real), lint, tipos, formatação e build.
