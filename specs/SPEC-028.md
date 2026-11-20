# SPEC-028 — Vínculo notícia–ativo

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 12/11/2026 pela Nicoly; aprovada por ela com as recomendações do §4.1 e as propostas do §4.2; implementada e validada como usuária em 17/11/2026 (§9) |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)), depois da SPEC-027 |
| Prioridade | Could (RF27); caminho para as notícias na ficha (SPEC-029), que a Visão §24 destaca |
| Depende de | [SPEC-006](SPEC-006.md) e [SPEC-040](SPEC-040.md) (catálogo de ativos), [SPEC-027](SPEC-027.md) (notícias coletadas) |
| Muda | Mapa: o **sentimento** (RF28), que estava nesta Spec, vai para a nova **SPEC-044** (§4.1, decisão 1); a SPEC-029 passa a depender só do vínculo para listar as notícias |
| Requisitos | RF27; RNF13, RNF16 |
| Casos de uso | Ler notícias do ativo (lado do sistema); fluxo 7.4 da arquitetura (vínculo) |
| Drivers | OBJ02, OBJ03, FAS04, PA04 |
| ADRs | [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA11](../adr/DA11-noticias-ia-modulo-isolado.md), [DA19](../adr/DA19-fontes-de-noticias.md) |

---

## 1. Objetivo

Para cada notícia coletada (SPEC-027), o processador descobre **de quais ativos do catálogo ela fala** e guarda o vínculo, com a **relevância** de cada um:

- **principal:** o assunto da notícia ("Petrobras (PETR4) pode pagar 20% em dividendos");
- **citado:** aparece no texto, mas não é o assunto;
- **lista:** a notícia é uma lista ou agenda com muitos ativos ("mais de 100 empresas divulgam resultados").

Com isso, a SPEC-029 pode mostrar na ficha de cada ativo as notícias **sobre ele**, sem encher a ficha de listas. O **sentimento** fica para a SPEC-044.

## 2. Valor

- **Usuário (pela SPEC-029):** na ficha da PETR4, as notícias da Petrobras.
- **Sistema:** a base da pesquisa do projeto (OBJ03): notícia ligada ao ativo e ao preço do dia.

## 3. Escopo

### 3.1 Inclui

1. **Vínculo pelo ticker** citado no título ou no texto, conferido no catálogo.
2. **Relevância** de cada vínculo: principal, citado ou lista (§4.1, decisão 3).
3. **Empresas marcadas pelo Investidor10** ("Notícias sobre Petrobras") reforçando o vínculo (§4.1, decisão 4).
4. **Vínculo das notícias já guardadas** (as 261 de hoje e o arquivo que vai chegando) e das novas, no processador.
5. Na tela **Notícias** do colaborador: quantas notícias têm vínculo e as **últimas notícias** com os tickers, para conferir (§4.2).

### 3.2 Não inclui

- **Sentimento** (RF28), versão do modelo e notícias "pendentes de classificação": nova **SPEC-044**, com as OPEN-30 e OPEN-31.
- **Notícias na ficha do ativo e no gráfico:** SPEC-029.
- **Vínculo pelo nome da empresa no texto** ("Vale", "Itaú"): fora, porque "vale" também é verbo e confunde (§4.1, decisão 2). As notícias da Agência Brasil, que não citam ticker, ficam sem vínculo.
- **Setor ou índice** ("o setor bancário", "o Ibovespa"): fora.

## 4. Decisões

### 4.1 Recomendações para aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Separar o sentimento** | Esta Spec faz **só o vínculo** (RF27). O sentimento (RF28), com o modelo, a versão e as pendentes, vai para uma **nova SPEC-044**, que pode vir depois da SPEC-029 | Escolha da Nicoly em 12/11/2026 (caminho 2): as notícias chegam logo na ficha, e o sentimento entra depois sem refazer nada |
| 2 | **Como achar o ativo** | Pelo **ticker** escrito na notícia (4 letras e o número da classe: PETR4, MXRF11, BPAC11), conferido no catálogo (ativos ativos e desativados). Não pelo nome da empresa no texto | Medido nas 251 notícias do Investidor10: **153 (61%) citam um ticker do catálogo**, e o site escreve o ticker entre parênteses ("Petrobras (PETR4)"). Pelo nome, "Vale" e "Itaú" confundem com palavras comuns |
| 3 | **Relevância** | **Lista:** a notícia cita **mais de 8 ativos** (todos os vínculos dela são de lista). Senão, **principal:** o ticker está **no título**, ou a empresa está marcada pelo Investidor10; **citado:** o resto | Medido: 22 notícias citam mais de 8 ativos (agendas de resultados, listas de dividendos, uma com 158 tickers); 79 têm o ativo principal no título. Sem a lista, a ficha de quase todo ativo teria as mesmas agendas |
| 4 | **Empresas marcadas pelo Investidor10** | Uma empresa marcada ("Petrobras", "Banco do Brasil") torna **principal** o ticker citado dessa empresa. A empresa é ligada ao ticker pelo nome no catálogo (o nome do ativo contém o nome marcado, sem acento nem maiúscula). Se a notícia marca a empresa mas não cita ticker, o vínculo vai para **todos os tickers ativos** dela, como principal | O site marca 97 notícias; em quase todas o ticker também aparece (só 1 sem ticker). A marcação diz qual é o assunto |
| 5 | **Quando** | Logo depois de guardar cada notícia (SPEC-027) e, para as que estão sem vínculo calculado, numa tarefa a cada 30 minutos, que também vincula o arquivo de uma vez quando a Spec entra. Cada vínculo guarda a **versão da regra**: se a regra mudar, as notícias são vinculadas de novo | Nada fica para trás, e a regra pode melhorar sem perder o que já foi feito |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **O que é ticker** | Palavra com 4 letras maiúsculas seguidas de 3, 4, 5, 6 ou 11 (a regra da B3 para ações, units e FIIs), que **existe no catálogo**. Palavra que bate com o padrão mas não está no catálogo é ignorada | Evita falso vínculo com siglas |
| **Mesma empresa, outra classe** | PETR3 citada não liga à PETR4: cada ticker citado é um vínculo. Só a decisão 4 (empresa marcada sem ticker) liga a todos | O ticker escrito é o que a notícia quis dizer |
| **Notícia atualizada** | Se o texto muda na fonte (SPEC-027), o vínculo é refeito | O vínculo segue o texto |
| **Ativo novo no catálogo** | Notícias antigas não são revistas sozinhas quando um ativo entra no catálogo; a próxima mudança de versão da regra revê todas | Raro, e simples de corrigir |
| **Tela do colaborador** | Em **Notícias**: "Com vínculo: 153 de 261" e uma lista das **20 últimas notícias** (data, fonte, título com link para a fonte, tickers com a relevância). Só para conferir; o usuário vê as notícias na SPEC-029 | O colaborador confere a coleta e o vínculo, que hoje não aparecem em lugar nenhum |
| **Rota** | `GET /api/news/latest` (colaborador): as 20 últimas, com os vínculos | Para a tela |
| **Onde fica** | No módulo **Notícias** (DA11): a regra é pura (`domain/asset-links.ts`), testada com textos de exemplo. O catálogo chega por uma porta (`tickers()`), ligada no `main.ts` | DA10 e arquitetura §6 |
| **Fim da autorização** | O `investidor10:apagar` já apaga as notícias; os vínculos saem junto (chave estrangeira) | Nada sobra |
| **Exportação (SPEC-034)** | Sem mudança: não há dado pessoal | — |

### 4.3 Exemplos (notícias reais de 12/11/2026)

| Notícia | Vínculos |
|---|---|
| "Petrobras (PETR4) pode pagar 20% em dividendos em 2027, diz banco", marcada Petrobras e PRIO | PETR4 **principal** (no título); PRIO3 **principal** (marcada e citada no texto) |
| "IBOV cai em dia marcado pelos resultados da Petrobras (PETR4) no 3T26", 15 tickers no texto | Mais de 8 ativos: todos de **lista** |
| "Dólar bate máxima em 2026 e até explica repique das ações da VALE3", 16 tickers | **Lista** (mais de 8), mesmo com a VALE3 no título |
| "3T26: Petrobras, Banco do Brasil e mais de 100 empresas divulgam resultados" | 158 tickers: **lista** |
| Notícia que cita "CASH3" uma vez no meio do texto, sem estar no título nem marcada | CASH3 **citado** |
| Notícia da Agência Brasil sobre o Banco do Brasil, sem ticker | Sem vínculo |

O exemplo da VALE3 mostra o custo da decisão 3: uma notícia com o ativo no título vira lista quando cita muitos outros. A SPEC-029 pode mostrar as de lista num grupo à parte ("Também citado em"), em vez de escondê-las.

## 5. Comportamento esperado

### 5.1 Rota

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/news/latest` (nova) | Colaborador | — | As 20 últimas notícias (título, endereço, fonte, data de publicação, vínculos com ticker e relevância) e os totais (`total`, `linked`) | 403 para o usuário |

### 5.2 Telas

Na tela **Notícias** do colaborador, abaixo das fontes: o total com vínculo e a lista das 20 últimas, com o título (link para a fonte, abrindo no navegador do sistema), a fonte, a data e os tickers em etiquetas (principal em destaque, citado e lista mais discretos). Português e inglês, pelo teclado, 375 px.

## 6. Modelo de dados

| Tabela | Campos | Restrições |
|---|---|---|
| `noticia_ativo` (nova) | `noticia_id`, `ativo_id`, `relevancia` (`principal`, `citado`, `lista`), `origem` (`ticker_titulo`, `ticker_texto`, `empresa_marcada`) | Chave (`noticia_id`, `ativo_id`); apaga junto com a notícia; índice por (`ativo_id`, relevância) para a ficha |
| `noticia` (SPEC-027) | Ganha `vinculada_em` e `versao_vinculo` | Vazios até o primeiro vínculo |

A migração tem `down.sql` (RNF17). `NOTICIA_ATIVO` já está no modelo de domínio.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Ticker do catálogo citado no título ou no texto vira vínculo; padrão que não está no catálogo é ignorado |
| CA02 | Relevância: lista acima de 8 ativos; principal no título ou empresa marcada; citado no resto; os exemplos do §4.3 |
| CA03 | Empresa marcada sem ticker liga a todos os tickers ativos da empresa |
| CA04 | Notícias novas vinculadas logo depois de guardadas; as antigas e o arquivo pela tarefa de 30 minutos; vínculo refeito quando o texto ou a versão da regra muda |
| CA05 | Com dados reais: as notícias guardadas vinculadas, com a contagem por relevância e uma conferência à mão de 20 vínculos |
| CA06 | Rota e tela do colaborador (403 para o usuário); a lista das 20 últimas com os tickers |
| CA07 | Banco: chave, relevância e origem com domínio fechado; os vínculos saem com a notícia; migração desfeita e refeita (RNF17) |
| CA08 | Regra pura com testes de unidade (RNF16) |
| CA09 | Validação visual como usuária (checklist, navegador visível, erros e 375 px) e o roteiro em `tests/e2e/` |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-30 | Vai para a SPEC-044 (modelo de sentimento) |
| OPEN-31 | Vai para a SPEC-044 (histórico e janela de treino); o arquivo do Investidor10 começa em 22/09/2023 |
| — | Vínculo pelo nome da empresa no texto (para a Agência Brasil): fica para depois, se fizer falta |

## 9. Verificação (17/11/2026)

**Como ficou:**
- **Regra:** `api/src/modules/news/domain/asset-links.ts`, função pura `linkNewsToAssets` (`LINK_RULE_VERSION = 1`, lista acima de 8 ativos). O ticker é `\b[A-Z]{4}\d{1,2}\b` conferido no catálogo: o padrão ficou mais largo que o do §4.2 para pegar classes como RAIZ55, e o catálogo continua sendo o filtro. A empresa marcada é ligada ao nome do ativo sem acento, sem maiúscula, sem palavras genéricas ("S.A.", "Participações") e aceitando o apelido entre parênteses.
- **Execução:** `application/news-linker.ts` vincula em lotes de 500 depois de cada coleta e na tarefa "vínculo notícia–ativo" do processador, a cada 30 minutos. Chamadas ao mesmo tempo dividem uma execução só. A notícia atualizada na fonte volta a ficar sem vínculo calculado (`vinculada_em` e `versao_vinculo` vazios), e a próxima rodada refaz o vínculo.
- **Banco:** migração `20261113120000_noticia_ativo`, com `down.sql`. Relevância e origem são enums, os vínculos saem com a notícia (cascade) e há índice por (`ativo_id`, `relevancia`). Uma restrição garante que `vinculada_em` e `versao_vinculo` estão os dois preenchidos ou os dois vazios.
- **Rota e tela:** `GET /api/news/latest` (403 para o usuário); a seção "Últimas notícias" na tela Notícias do colaborador.

| CA | Resultado |
|---|---|
| CA01 | ✅ Testes de unidade: ticker do catálogo no título e no texto, padrão fora do catálogo ignorado, ticker desativado aceito |
| CA02 | ✅ Testes de unidade com os exemplos do §4.3 (lista acima de 8, principal no título ou marcada, citado no resto) |
| CA03 | ✅ Empresa marcada sem ticker liga a todos os tickers ativos dela (teste de unidade) |
| CA04 | ✅ Vínculo logo depois da coleta e pela tarefa de 30 minutos; refeito quando o texto muda (teste com banco) ou quando sobe a versão da regra |
| CA05 | ✅ Banco de desenvolvimento: 261 notícias vinculadas em cerca de 0,6 s, 154 com pelo menos um ativo. Principal: 106 vínculos em 99 notícias; citado: 139 em 77; lista: 454 em 22. Conferência à mão de 20 vínculos sorteados: 18 certos e 2 discutíveis, nos limites abaixo |
| CA06 | ✅ Rota com 403 para o usuário (teste de rota); a lista das 20 últimas com os tickers e a relevância |
| CA07 | ✅ Testes com o `simulador_test`: chave, enums, cascade ao apagar a notícia, migração desfeita e refeita |
| CA08 | ✅ Regra pura com testes de unidade (RNF16) |
| CA09 | ✅ Validação visual abaixo e o roteiro em `tests/e2e/news-sources.e2e.ts` |

**Validação visual (navegador do Claude, com `mocks/window-api.js`):**

| Caso | Resultado |
|---|---|
| Lista com vínculos | ✅ "Com ativo vinculado: 154 de 261 notícias"; etiquetas Principal em destaque, Citado e Lista discretas; leitor de tela ouve a relevância; notícia sem ativo diz "Sem ativo vinculado"; o título abre a fonte em outra janela |
| Lista vazia | ✅ Só "Nenhuma notícia coletada ainda.". Antes mostrava "0 de 0 notícias" e a legenda das etiquetas; corrigido |
| Carregamento lento | ✅ "Carregando as notícias…" até a resposta |
| Servidor fora do ar | ✅ Aviso "Não foi possível falar com o servidor" só na seção, e as fontes continuam na tela |
| 375 px | ✅ Sem rolagem para o lado; as etiquetas quebram linha |
| Ponta a ponta | ✅ 8 testes (Playwright, Edge), 2 deles novos para as últimas notícias, e o de 375 px passando pela seção |

**Limites conhecidos:**
- A empresa marcada "CSN" liga à CMIN3 (CSN Mineração), mas não à CSNA3, cujo nome no catálogo é "Siderúrgica Nacional". Para corrigir, seria preciso uma lista de apelidos.
- Um FII sem ticker no título ("FII vende imóvel para Coca-Cola…", ALZR11) fica como **citado**, embora seja o assunto.
- "Santander (SANB11) e mais 5 empresas pagam dividendos" vira **lista**, porque o texto cita mais de 8 tickers (várias classes das mesmas empresas).
- Os três casos ficam para uma próxima versão da regra, se fizerem falta na ficha (SPEC-029).
