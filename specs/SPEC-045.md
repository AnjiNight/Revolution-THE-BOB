# SPEC-045 — Visão do usuário para o colaborador

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 21/11/2026, a pedido da Nicoly ("em colaborador deve se poder verificar a visão do usuário"); aprovada por ela no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9) |
| Fase | 8 — Experiência e conformidade ([mapa de specs](mapa_specs.md)) |
| Prioridade | Could (RF44) |
| Depende de | [SPEC-002](SPEC-002.md) (colaborador e sessão), [SPEC-012](SPEC-012.md) a [SPEC-016](SPEC-016.md) (carteiras e lançamentos), [SPEC-019](SPEC-019.md) a [SPEC-023](SPEC-023.md) (acompanhamento), [SPEC-043](SPEC-043.md) (proventos na carteira) |
| Muda | O servidor (as rotas de carteira passam a aceitar o colaborador), o app (alternância entre a Área do colaborador e a Visão do usuário, com a faixa de aviso), `requisições.md` (RF44, versão 1.14), a SPEC-012 (§4.2, "Quem tem carteira") e o mapa |
| Requisitos | RF44 (novo); RB03; RNF04, RNF18, RNF20 |
| Casos de uso | Cenário de uso da P03 (sem caso de uso no diagrama; ver OPEN-43) |
| Drivers | QA05 (acesso só ao que é seu), QA12 (a equipe confere a qualidade dos dados) |
| ADRs | [DA12](../adr/DA12-autorizacao-planos-no-servidor.md) (autorização no servidor), [DA13](../adr/DA13-dados-pessoais-concentrados.md) (dados pessoais) |

---

## 1. Objetivo

O colaborador abre, sem sair da conta dele, a **Visão do usuário**: as mesmas telas que um usuário vê (Início, Ativos com a busca e a ficha, Carteiras, com compra, venda, rentabilidade, comparação e distribuição), com **carteiras de teste dele próprio**. Assim ele confere como os dados que a equipe cuida (catálogo, calendário, cotações, proventos, índices) aparecem para quem usa o app, sem criar uma segunda conta de usuário.

## 2. Valor

- **Colaborador (P03):** confere na tela do usuário o efeito do que publicou ou corrigiu (um setor, um ano do calendário, uma cotação), e reproduz um problema relatado montando uma carteira igual.
- **Equipe e apresentação:** uma conta só mostra os dois lados do app.
- **Hoje:** o colaborador recebe 403 nas carteiras ([SPEC-012 §4.2](SPEC-012.md)) e, para ver o app como usuário, precisa de outro e-mail, confirmar o cadastro e trocar de conta.

## 3. Escopo

### 3.1 Inclui

1. **Botão "Visão do usuário"** no menu do colaborador, e **"Voltar à Área do colaborador"** na Visão do usuário.
2. **Navegação do usuário** na Visão do usuário: Início, Ativos (a busca e a ficha do usuário, com **Comprar**) e Carteiras, com uma **faixa fixa** avisando o modo.
3. **Carteiras de teste do colaborador**: as rotas de carteira (SPEC-012 a 023 e 043) passam a aceitar a conta de colaborador, com as mesmas regras e a mesma verificação de dono.
4. **Requisitos e Specs atualizados**: RF44, e a linha "Quem tem carteira" da SPEC-012.

### 3.2 Não inclui

- **Ver as carteiras ou os dados de um usuário de verdade** (§4.1, decisão 1).
- **Entrar como outro usuário** ("personificar") ou trocar de conta.
- **Escolher o plano** (gratuito ou assinante) na Visão do usuário: chega com a SPEC-025/026, se a equipe quiser.
- **Meu perfil do usuário** (consentimento, exclusão de conta, exportação): o colaborador continua com o Meu perfil dele.
- **Dados fictícios** do `mocks/window-api.js`: a Visão do usuário usa os dados reais do servidor.

## 4. Decisões

### 4.1 Aprovadas pela Nicoly em 21/11/2026 (as recomendações)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **O que "visão do usuário" mostra** | As **telas do usuário com as carteiras de teste do próprio colaborador**, criadas por ele. **Nunca** as carteiras de um usuário real | RB03 e DA12 ("o servidor confere se a carteira pertence ao usuário do token") e a LGPD (DA13): carteiras dizem muito sobre a pessoa, e o usuário não consentiu em mostrá-las à equipe. Ver a carteira de alguém pediria consentimento, registro de acesso e uma regra nova; se um dia for preciso para suporte, vira outra Spec |
| 2 | **Como o servidor autoriza** | As rotas de carteira trocam `requireUser` por **"usuário ou colaborador"**; a verificação de dono não muda. As rotas do colaborador (catálogo, calendário, notícias, indicadores) continuam só do colaborador. **Nenhum token ou sessão novos**: a Visão do usuário é um modo da tela | A regra que protege os dados é a do dono da carteira, e ela continua igual. Um token "de usuário" para o colaborador seria um segundo login, com o risco de alguém esquecer de sair dele |
| 3 | **Carteiras do colaborador seguem as mesmas regras** | Até **20 carteiras**, nomes únicos, ao vivo e históricas, lançamentos, estorno, proventos: tudo como para o usuário | A ideia é ver exatamente o que o usuário vê; regras diferentes esconderiam problemas |
| 4 | **Onde fica o botão** | No **menu do topo do colaborador**, como último item antes do Meu perfil, com o texto "Visão do usuário" (a 480 px, só o ícone de olho, com o nome para o leitor de tela). Na Visão do usuário, a **faixa** no topo: "Visão do usuário — você está vendo o app como um usuário, com as suas carteiras de teste." e o botão **Voltar à Área do colaborador** | O colaborador troca de lado com um clique, e nunca fica em dúvida de onde está |
| 5 | **Ao entrar no app** | O colaborador **sempre começa na Área do colaborador**; o modo não fica guardado entre as sessões | Quem entra pela Área do colaborador espera vê-la; o modo é para conferir algo e voltar |

### 4.2 Aprovadas junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Telas da Visão do usuário** | Exatamente as do usuário: **Início do usuário**, **Ativos** com a busca (`AssetSearch`), não o catálogo do colaborador, e a ficha com **Comprar**, e **Carteiras**. O menu mostra só esses itens, mais **Meu perfil** (o do colaborador) | É a visão do usuário de verdade, e não uma mistura |
| **Faixa de aviso** | Fixa no topo, com cor de destaque diferente da do usuário e **texto**, não só a cor (RNF18); anunciada uma vez ao entrar no modo (`role="status"`) | O colaborador não confunde os dois lados, nem numa captura de tela da apresentação |
| **Ficha do ativo** | Na Visão do usuário, a ficha é a do usuário (com **Comprar**); na Área do colaborador, continua como hoje | Cada lado vê a sua |
| **Exportação de dados** | O colaborador não exporta nem exclui a conta pelo app ([SPEC-034](SPEC-034.md)); nada muda | — |
| **Remoção da conta de colaborador** | Se a equipe remover a conta, as carteiras de teste saem junto (o banco já apaga em cascata) | São simulações da própria conta |
| **Comparação de carteiras e "nova a partir de outra"** | Só entre as carteiras do próprio colaborador, como para o usuário | RB03 |
| **Textos** | Em português e inglês; nenhum texto novo no servidor (as recusas são as mesmas) | RNF20 |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| André (colaborador) publicou o calendário de 2026 e quer ver uma carteira histórica de março | Clica em **Visão do usuário**, abre **Carteiras**, cria "Teste calendário" histórica com início em 02/03/2026 e compra PETR4; vê a rentabilidade como um usuário veria |
| André corrigiu o setor de um FII | Na Visão do usuário, abre a carteira de teste com o FII e confere a distribuição por segmento |
| André tenta abrir uma carteira de um usuário (pelo id) | 404 `portfolio_not_found`, como hoje para qualquer carteira que não é sua; o servidor registra a tentativa |
| André chama uma rota de carteira pela API, sem a tela | Funciona com as carteiras dele: a Visão do usuário é só a tela; o servidor autoriza pelo dono |
| Um usuário chama uma rota do catálogo do colaborador | 403, como hoje |
| André sai e entra de novo | Começa na Área do colaborador |
| André já tem 20 carteiras de teste | A 21ª dá `portfolio_limit_reached`, como para o usuário |

## 5. Comportamento esperado

### 5.1 Rotas

Nenhuma rota nova. Todas as rotas de `portfolio-routes.ts` (carteiras, lançamentos, estorno, rentabilidade, comparação, distribuição, nova a partir de outra) passam a aceitar `role` igual a `user` **ou** `collaborator`. Sem sessão: 401. As rotas `requireCollaborator` não mudam.

### 5.2 Telas

| Situação | Tela |
|---|---|
| Área do colaborador | Menu do topo: Início, Calendário, Ativos, **Visão do usuário**, Meu perfil |
| Visão do usuário | Faixa no topo com o aviso e **Voltar à Área do colaborador**; menu: Início, Ativos, Carteiras, Meu perfil; as telas são as do usuário |
| Voltar | Volta ao Início do colaborador |
| 480 px | O botão vira o ícone de olho com o nome acessível; a faixa quebra em duas linhas, sem passar da largura |

Pelo teclado, com o foco indo para o conteúdo da tela ao trocar de modo; em português e inglês; com contraste (RNF04, RNF18, RNF20).

## 6. Modelo de dados

Nenhuma mudança. A carteira já se liga a `usuario` (que inclui o colaborador) com `ON DELETE CASCADE`.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O menu do colaborador tem **Visão do usuário**; ao clicar, aparecem a faixa de aviso e o menu do usuário (Início, Ativos, Carteiras, Meu perfil), com as telas do usuário |
| CA02 | Na Visão do usuário, o colaborador cria, lança, estorna, compara e copia carteiras de teste, com as mesmas regras e recusas do usuário (inclusive o limite de 20) |
| CA03 | O colaborador nunca vê carteira de outra conta: rota com id de outra carteira dá 404 `portfolio_not_found` e o servidor registra a tentativa |
| CA04 | As rotas só do colaborador continuam recusando o usuário (403); sem sessão, 401 em todas |
| CA05 | **Voltar à Área do colaborador** leva ao Início do colaborador; ao entrar de novo no app, o colaborador começa na Área do colaborador |
| CA06 | A faixa tem texto (não só cor) e é anunciada ao entrar no modo; tudo funciona pelo teclado, a 480 px e em português e inglês |
| CA07 | `requisições.md` 1.14 com o RF44, a SPEC-012 §4.2 com a nova regra "Quem tem carteira" e o mapa atualizado |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| Plano na Visão do usuário | Com a assinatura (SPEC-025/026), decidir se o colaborador escolhe ver como gratuito ou assinante |
| Suporte com a carteira de um usuário | Fora desta Spec (decisão 1); exigiria consentimento do usuário e registro de acesso |
| OPEN-43 | O diagrama de casos de uso continua sem os cenários do colaborador |

## 9. Implementação (21/11/2026)

| Parte | O que mudou |
|---|---|
| Servidor | `requireUser` virou `requirePortfolioAccount` (`identity/controllers/authenticate.ts`): as rotas de carteira aceitam o usuário e o colaborador; a verificação de dono (`owned`) não mudou. Testes: o colaborador lista, cria e abre as carteiras dele; a de outra conta dá 404 com o aviso no log (cópia, estorno, posições), e a Ana não vê a carteira de teste do colaborador |
| App | Estado `userView` no `App.tsx`, só na memória (volta a falso ao entrar, sair ou perder a sessão). Na Visão do usuário, o `AppShell` mostra o menu do usuário e a faixa (`role="status"`) com **Voltar à Área do colaborador**; o Início, a busca de ativos e a ficha com **Comprar** são os do usuário. O Início não pede o aceite dos termos na Visão do usuário (`userView` no `Home`) |
| Fora | Os avisos de variação (SPEC-033: a rota `dayChanges` continua com `requireUser`) e o modo consulta (SPEC-032) continuam só da conta de usuário |
| Textos | `shell.userView`, `shell.userViewBannerTitle`, `shell.userViewBannerText` e `shell.backToCollaborator`, em português e inglês |
| Validação | Roteiro em `tests/e2e/user-view.e2e.ts` (entrar e voltar, menu do usuário, busca de ativos, lista de carteiras, 375 px sem rolagem de lado); o mock ganhou a lista de carteiras. Os 23 roteiros E2E e os 1.213 testes (com o banco `simulador_test`) passaram em 21/11/2026 |
