# SPEC-035 — Alternância de idioma

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 16/11/2026 a pedido do Luís, que no mesmo pedido mandou implementar ("vamo faze o md e implementar a spec 035"): aprovada com as recomendações do §4.1 e implementada (§9) |
| Fase | 8 — Experiência e conformidade ([mapa de specs](mapa_specs.md)), depois da SPEC-032 |
| Prioridade | Could (RF38) |
| Depende de | [SPEC-001](SPEC-001.md) (textos fora do código desde o início, RNF20) e as Specs com tela já entregues |
| Muda | O app (botão de idioma no topo da página de entrada e no rodapé das telas depois de entrar; a escolha guardada neste computador; `<html lang>` e título da janela seguindo o idioma), o processo principal (a página do navegador depois do login com Google e o nome sugerido do arquivo "Baixar meus dados" passam a seguir o idioma), `decisoes_tecnicas.md` e o mapa (OPEN-45) |
| Requisitos | RF38; RNF04, RNF18, RNF20 |
| Casos de uso | — (o diagrama não tem caso de uso para o idioma; ver OPEN-43) |
| Drivers | QA15 ("Troca de idioma") |
| ADRs | [DA03](../adr/DA03-cliente-desktop-multiplataforma.md) |

---

## 1. Objetivo

A pessoa troca o idioma do app entre **português e inglês** a qualquer momento, antes ou depois de entrar, sem reiniciar: os textos, os números, a moeda e as datas mudam juntos ("R$ 1.234,56" e "16 de novembro de 2026" viram "R$1,234.56" e "November 16, 2026"). A escolha fica guardada **neste computador**; sem escolha, vale o idioma do sistema operacional, como hoje.

## 2. Valor

- **Usuário:** quem lê melhor em inglês usa o app inteiro em inglês, inclusive para entrar e criar a conta (QA15).
- **Projeto:** entrega o RF38. Os textos já estão nos dois idiomas desde a SPEC-001 (RNF20): faltava a troca. Fecha a OPEN-45.

## 3. Escopo

### 3.1 Inclui

1. **Botão de idioma** com o globo e o nome do outro idioma, no topo da página de entrada (ao lado de "Entrar") e no rodapé de todas as telas depois de entrar.
2. **A troca na hora**, sem recarregar nem perder o que está na tela; `<html lang>` e título da janela mudam junto.
3. **A escolha guardada neste computador**, valendo na próxima abertura, antes de entrar e depois de sair.
4. **Textos do processo principal** que hoje são fixos em português: a página que o navegador mostra depois do login com Google e o nome sugerido do arquivo "Baixar meus dados".
5. A decisão da **OPEN-45** (o que fica em português com a interface em inglês) e a atualização de `decisoes_tecnicas.md` e do mapa.

### 3.2 Não inclui

- **Outros idiomas** além de português e inglês (RF38).
- **Idioma guardado na conta** (decisão 2).
- **Menus e janelas do sistema operacional** (o "Salvar como" do Windows, o menu padrão do Electron): seguem o idioma do sistema.
- **Traduzir o que vem das fontes**: nomes de empresas e de fundos, notícias (decisão 3).
- **Outra moeda**: os valores continuam em reais; só a pontuação muda com o idioma.
- **E-mails**: já seguem o idioma da interface no momento do pedido (SPECs 004, 034 e 039); nada muda no servidor.

## 4. Decisões

### 4.1 Recomendações (aprovadas no próprio pedido)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Onde fica a troca** | Um botão com o **globo e o nome do outro idioma, escrito nele mesmo**: "English" com a interface em português e "Português" com ela em inglês. No **topo da página de entrada**, ao lado de "Entrar", e no **rodapé de todas as telas** depois de entrar, ao lado da situação do servidor | Com dois idiomas, um botão só basta, e o nome no próprio idioma é o que a pessoa procura ("English", não "Inglês"). No topo da página de entrada, quem não lê português acha antes de entrar. Na barra do app depois de entrar não cabe a 480 px (as quatro seções e o Sair já ocupam a largura); por isso o rodapé, que está em todas as telas |
| 2 | **Onde guardar a escolha** | **Neste computador** (o armazenamento local do app), não na conta. Vale antes de entrar e sem conexão, e continua depois de sair. Sem escolha, o idioma do sistema (como hoje) | Não é dado do servidor: nada muda no banco, na exportação nem na exclusão (SPEC-034). Guardar na conta exigiria migração e rota, e a tela de entrada (antes de saber quem é a pessoa) continuaria no idioma do sistema. A SPEC-004 já tinha decidido que a conta não guarda idioma |
| 3 | **O que fica em português com a interface em inglês** (OPEN-45) | O que vem das fontes fica **como veio**: nomes de empresas e de fundos e, quando a SPEC-029 existir, as notícias (em português, PRE04); ela marca o idioma do texto (`lang="pt-BR"`), para o leitor de tela pronunciar certo, e avisa "Em português". **Tudo o que o próprio app escreve é traduzido**: telas, avisos, e-mails, a página do login com Google e, na SPEC-031, os textos gerados dos cenários | Traduzir notícia exigiria outro serviço (custo, RES) e mudaria o texto da fonte; nome de empresa é nome próprio |
| 4 | **Como a troca acontece** | **Na hora**, sem reiniciar nem perder o que está na tela (um formulário aberto continua com o que foi digitado); números, moeda e datas mudam junto. O leitor de tela ouve "O app agora está em inglês" no idioma novo | É a "alternância" do RF38, e o `i18next` troca os textos sem recarregar |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Botão** | `<button>` com o ícone de globo (decorativo) e o nome do outro idioma, com o atributo `lang` desse idioma (o leitor de tela pronuncia "English" em inglês) e a dica "Mudar o idioma do app para inglês" / "Switch the app language to Portuguese". Depois do clique, o foco continua no botão, que passa a mostrar o outro nome, e uma região `role="status"` anuncia a troca no idioma novo | O nome visível é o nome acessível (WCAG 2.5.3); a dica explica a ação no idioma atual |
| **A escolha guardada** | Armazenamento local do app, chave `simulador.idioma`, só `pt-BR` ou `en`; um valor estranho é ignorado. Sem armazenamento disponível, a troca vale até fechar o app | Simples, síncrono (o idioma já vale na primeira tela) e sem servidor |
| **Idioma ao abrir** | A escolha guardada; sem ela, o do sistema operacional: inglês se começar com "en", português nos outros casos | É a regra de hoje (`pickLanguage`), agora depois da escolha guardada |
| **`<html lang>` e título** | Mudam junto: `lang="en"` ou `lang="pt-BR"` (leitor de tela e hifenização) e o título da janela "Investment Simulator" ou "Simulador de Investimentos" | Era a nota deixada no código da SPEC-001 ("atualizar também na troca") |
| **Processo principal** | A interface avisa o processo principal do idioma ao abrir e a cada troca (canal `app:set-language`; outro valor é ignorado). Ele usa o idioma na página que o navegador mostra depois do login com Google ("Pronto! Você já pode fechar esta aba…" / "Done! You can close this tab…") e no nome sugerido do arquivo "Baixar meus dados" (`simulador-meus-dados-AAAA-MM-DD.json` / `investment-simulator-my-data-AAAA-MM-DD.json`) | São os dois únicos textos fixos fora das telas; o conteúdo do arquivo não muda |
| **E-mails** | Nada muda: o app já manda o idioma da interface em cada pedido que gera e-mail; depois da troca, o e-mail seguinte sai no idioma novo | SPECs 004, 034 e 039 |
| **Avisos que já estavam na tela** | Um aviso que já apareceu (por exemplo, "Carteira excluída") continua no idioma em que apareceu até sumir; o resto muda na hora | O aviso é guardado como texto quando aparece; refazê-lo não vale a complexidade |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| Sistema em português, primeira abertura | App em português; o botão diz "English" |
| Clica em "English" na página de entrada | A página inteira muda para inglês na hora, inclusive o formulário de entrada (o que foi digitado continua); o botão passa a dizer "Português"; o leitor de tela ouve "The app is now in English." |
| Fecha e abre o app | Abre em inglês: a escolha ficou neste computador |
| Entra e abre uma carteira | "Cash balance R$7,500.00", "since Jan 2, 2019" |
| Sai da conta | Continua em inglês: a escolha não é da conta |
| Outra pessoa usa o mesmo computador | Vê o idioma escolhido por último neste computador e troca no botão, se quiser |
| Sistema em inglês, nunca escolheu | Abre em inglês, como hoje |
| "Download my data" em inglês | O "Salvar como" sugere `investment-simulator-my-data-2026-11-16.json` |
| Entra com Google em inglês | O navegador mostra "Done! You can close this tab and go back to Investment Simulator." |
| Troca para inglês e pede o código para trocar o e-mail | O e-mail chega em inglês |

### 4.4 Conferido em 16/11/2026

| Pergunta | Resposta |
|---|---|
| Os textos | Todas as telas usam os arquivos de idioma desde a SPEC-001; o teste dos arquivos confere que português e inglês têm as mesmas chaves e as mesmas variáveis. A busca por textos e atributos fixos (`aria-label`, `title`, `placeholder`, texto entre tags) nos componentes não achou nenhum |
| O idioma hoje | Escolhido uma vez, ao abrir, pelo idioma do sistema (`pickLanguage`); não há troca. O `<html lang>` é posto só na abertura, com a nota "Quando a troca de idioma existir (SPEC-035), atualizar também na troca" |
| Números e datas | As funções de `format.ts` recebem o idioma a cada chamada e não guardam nada em cache; as telas que usam `useTranslation` re-renderizam com a troca, e não há `React.memo` que segure uma tela antiga |
| Fora das telas | A página do navegador depois do login com Google é fixa em português (`google-oauth.ts`), com "Requisição inválida." no erro; o nome sugerido do arquivo de exportação também (`simulador-meus-dados-…`) |
| E-mails | O app manda `locale` (`pt-BR` ou `en`) com o idioma da interface no momento do pedido (`emailLocale`); a conta não guarda idioma (SPEC-004) |
| Espaço na barra | A barra do app depois de entrar, a 480 px, já ocupa a largura com as quatro seções e o Sair (só o ícone abaixo de 560 px). A da página de entrada esconde os links abaixo de 880 px e mostra só a marca e o "Entrar" |

## 5. Comportamento esperado

### 5.1 Rotas

Nenhuma rota nova nem mudança no servidor.

### 5.2 Entre a interface e o processo principal

| Peça | Mudança |
|---|---|
| `app:set-language` | Novo canal: a interface manda `pt-BR` ou `en` ao abrir e a cada troca; outro valor é ignorado. O processo principal começa em `pt-BR` até receber o primeiro aviso |

### 5.3 Telas

| Situação | Tela |
|---|---|
| Página de entrada | No topo, ao lado de "Entrar": o botão com o globo e "English" (ou "Português") |
| Depois de entrar | No rodapé de todas as telas, ao lado da situação do servidor: o mesmo botão |
| Depois da troca | Todos os textos, números, moeda e datas no idioma novo; o foco continua no botão; a troca é anunciada ao leitor de tela |
| 480 px | O botão cabe no topo da página de entrada e no rodapé, sem rolagem lateral |

Pelo teclado, com contraste e a 480 px (RNF04, RNF18, RNF20).

## 6. Modelo de dados

Nenhuma mudança no banco nem na conta. No computador, a chave `simulador.idioma` no armazenamento local do app.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O botão está no topo da página de entrada e no rodapé de todas as telas depois de entrar, com o globo, o nome do outro idioma (com o `lang` dele) e a dica; funciona pelo teclado; a 480 px cabe sem rolagem lateral |
| CA02 | A troca muda na hora os textos, os números, a moeda e as datas da tela, sem recarregar nem perder o que foi digitado; `<html lang>` e o título da janela mudam junto; o leitor de tela ouve a troca no idioma novo |
| CA03 | A escolha fica guardada neste computador: reabrir o app abre no idioma escolhido; sair da conta não muda o idioma; sem escolha, vale o idioma do sistema; um valor estranho guardado é ignorado; sem armazenamento, a troca vale até fechar o app |
| CA04 | O processo principal recebe o idioma: a página do navegador depois do login com Google e o nome sugerido do arquivo "Baixar meus dados" seguem o idioma; um valor estranho é ignorado |
| CA05 | Os e-mails pedidos depois da troca saem no idioma novo (o `locale` do pedido segue a interface) |
| CA06 | Português e inglês continuam com as mesmas chaves e variáveis, e nenhuma tela tem texto fixo; o que vem das fontes fica como veio (OPEN-45) |
| CA07 | `decisoes_tecnicas.md` e o mapa (OPEN-45 resolvida) atualizados |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-45 | ✅ **Resolvida** (decisão 3 do §4.1): o que vem das fontes fica como veio; o que o app escreve é traduzido |
| SPEC-029 | Quando for feita, marca o idioma das notícias (`lang="pt-BR"`) e mostra "Em português" com a interface em inglês |
| SPEC-031 | Os textos gerados dos cenários saem no idioma da interface |

## 9. Verificação (16/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | `app/src/renderer/src/i18n/index.ts`: `pickLanguage(guardado, sistema)`, `changeLanguage` (guarda a escolha e troca na hora) e `currentLanguage`; a cada troca (`languageChanged`), o `<html lang>`, o título da janela e o aviso ao processo principal. O botão é o `LanguageSwitch`. No processo principal, o canal `app:set-language` (só `pt-BR` ou `en`, por `isAppLanguage`), a página `callbackPage(idioma, ok)` do login com Google e o nome do arquivo em `saveDataExport` |
| Barra estreita da página de entrada | A 480 px, o botão de idioma ao lado de "Entrar" cortava o nome do app e quebrava o "Entrar" em duas linhas. Abaixo de 560 px, a barra mostra só a marca (o nome do app continua para leitores de tela, como na barra das telas depois de entrar), e o "Entrar" não quebra mais |
| Botão e "Entrar" juntos | Um grupo (`island-actions`) mantém os dois à direita da barra |
| Pré-visualização | A ponte falsa (`app/.previa`, fora do Git) ganhou `setLanguage`, que não faz nada |

| Critério | Resultado |
|---|---|
| CA01 | ✅ Pré-visualização: o botão no topo da página de entrada (ao lado de "Entrar") e no rodapé das telas depois de entrar, com o globo, o nome do outro idioma ("English" com `lang="en"`, ou "Português") e a dica "Mudar o idioma do app para inglês" / "Switch the app language to Portuguese"; é um botão nativo, que funciona pelo teclado. A 480 px, a barra da página de entrada fica numa linha (a marca, "Português" e "Sign in") e o rodapé põe a situação do servidor e o botão lado a lado, sem rolagem lateral |
| CA02 | ✅ Clicar em "English" com o formulário "Nova carteira" aberto e um nome digitado: o título da tela vira "Portfolios", o `<html lang>` vira `en`, o título da janela "Investment Simulator", o nome digitado continua no campo, o foco fica no botão (que passa a dizer "Português") e o leitor de tela recebe "The app is now in English."; na carteira, "R$7,500.00" e "since Jan 2, 2019". A volta para português anuncia "O app agora está em português." |
| CA03 | ✅ `pick-language.test.ts`: a escolha guardada vale mais que o sistema; um valor estranho ("fr", "EN", vazio) é ignorado; sem escolha, o sistema decide (en-US: inglês; pt-BR, es-ES e nenhum: português); a troca guarda `simulador.idioma`; com o armazenamento recusando, a troca vale do mesmo jeito. Na pré-visualização: recarregar abre em inglês, e sair da conta continua em inglês |
| CA04 | ✅ `google-oauth.test.ts`: a página do fim do login em português e em inglês (`<html lang>`, "Done! You can close this tab and go back to Investment Simulator.", "Invalid request."), e o navegador recebe a página no idioma de agora. `data-export.test.ts`: em inglês, o "Salvar como" sugere `investment-simulator-my-data-2026-10-13.json`, com o mesmo conteúdo. ⏳ Ver no Electron o login com Google em inglês |
| CA05 | ✅ Conferido no código: todo pedido que gera e-mail (confirmar o cadastro, reenviar o código, recuperar a senha, trocar o e-mail e excluir a conta) manda `emailLocale(i18n.language)` no momento do pedido; depois da troca, vai o idioma novo. Nada mudou nesses pedidos |
| CA06 | ✅ O teste dos arquivos de idioma continua passando (as mesmas chaves e variáveis nos dois, agora com `language.switchTo` e `language.changed`); a busca por textos fixos nos componentes não achou nenhum. Os nomes dos idiomas no botão são fixos de propósito: cada um no próprio idioma |
| CA07 | ✅ `decisoes_tecnicas.md` (Internacionalização) e o mapa v1.55 (OPEN-45 resolvida; a SPEC-035 sem entidade nova) |

Total: **1.057 testes** passando (7 novos), com o banco de teste, mais lint, tipos e formatação.
