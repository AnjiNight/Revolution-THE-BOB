# SPEC-032 — Consulta sem conexão e sincronização incremental

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 16/11/2026, a pedido do Luís; aprovada por ele no mesmo dia, como escrita ("Aprovo, implemente"), e implementada (§9). Escrita fora da ordem das fases: as Fases 6 e 7 ainda não foram detalhadas, mas esta Spec só depende de Specs já implementadas, porque a parte das notícias passa para a SPEC-029 (decisão 2) |
| Fase | 8 — Experiência e conformidade ([mapa de specs](mapa_specs.md)), a primeira da fase |
| Prioridade | Should (RF36, RF37) |
| Depende de | [SPEC-002](SPEC-002.md) (sessão e token de renovação no cofre do SO), [SPEC-010](SPEC-010.md) (ficha do ativo e séries de preço), [SPEC-019](SPEC-019.md) (rentabilidade e evolução). Usa também o que as SPECs 012 a 023, 041 e 042 mostram. A SPEC-029 (notícias) deixa de ser dependência: quando for feita, ela entrega a sua parte |
| Muda | `requisições.md` (versão 1.13: RF37 reescrito), `decisoes_tecnicas.md` (cache local em arquivos cifrados, no lugar do SQLite), DA08 (nota com o que fica guardado e como se sincroniza), SPEC-034 (a limpeza do cache local, que ela deixou para esta Spec), o servidor (ETag e 304 nas leituras) e o app (cache no processo principal, modo consulta nas telas) |
| Requisitos | RF36, RF37; RB03, RB04; RNF04, RNF08, RNF11, RNF13, RNF14, RNF18, RNF19, RNF20, RNF21 |
| Casos de uso | Fluxo 7.3 da [arquitetura](../arquitetura.md) ("Abrir o painel sem conexão"); QA03 dos drivers |
| Drivers | FAS06, QA03, PA01, PRE06 |
| ADRs | [DA03](../adr/DA03-cliente-desktop-multiplataforma.md) (cache local persistente), [DA08](../adr/DA08-cache-dois-niveis-offline-leitura.md) (offline somente leitura e sincronização incremental), [DA13](../adr/DA13-dados-pessoais-concentrados.md) (cópia local apagada no logout e na exclusão) |

---

## 1. Objetivo

Sem conexão com o servidor, o app continua mostrando **o que a pessoa já consultou neste computador**: a lista de carteiras, cada carteira (caixa, rentabilidade, posições, distribuição e extrato), a comparação, a ficha dos ativos e o perfil. Tudo fica **só para consulta**, com um aviso e com a **data e a hora dos dados**. Nada pode ser lançado, criado ou alterado até a conexão voltar.

Quando a conexão volta, o app atualiza sozinho o que está na tela, e o servidor manda **só o que mudou**: o que não mudou volta sem corpo (304).

A cópia local fica **cifrada pelo cofre do sistema operacional**, como o token de renovação. Ela é apagada quando a pessoa sai, quando a sessão termina e quando a conta é excluída.

## 2. Valor

- **Usuário (P01, P02):** abre a carteira no ônibus, no avião ou quando o servidor está fora do ar, sem ficar preso na tela de login (QA03).
- **Projeto:** o RNF21 (95% de disponibilidade) fica mais fácil de cumprir com hospedagem gratuita: se o servidor hiberna ou cai, o app continua útil para consulta, como a [arquitetura](../arquitetura.md) já previa. O RNF19 vale também com conexão: reabrir uma carteira que não mudou não traz o corpo de novo.
- **Projeto:** fecha a OPEN-10 (RF37 × RNF14).

## 3. Escopo

### 3.1 Inclui

1. **Cópia local das leituras** do usuário, feita pelo processo principal ao receber cada resposta: lista de carteiras, carteira, caixa e extrato (as páginas já vistas), posições e distribuição, rentabilidade (os períodos já consultados), comparação (as já abertas), ficha do ativo, histórico de preços (os períodos já vistos), indicadores, proventos e logos, perfil e consentimentos.
2. **Modo consulta**, ao abrir o app sem conexão (com sessão guardada) ou quando a conexão cai no meio do uso. Inclui o aviso no topo, a data dos dados de cada tela e os botões de escrita desativados, com o motivo.
3. **Volta da conexão:** o app confere o servidor a cada 30 s e no botão **Tentar agora**. Quando ele responde, o app renova a sessão, refaz a tela atual e avisa.
4. **Sincronização incremental:** o servidor manda um **ETag** em cada leitura. O app manda o ETag guardado (`If-None-Match`), e o servidor responde **304 sem corpo** quando nada mudou.
5. **Limpeza** da cópia local: ao sair (com ou sem conexão), quando a sessão é recusada ou expira, na exclusão da conta e quando outra pessoa entra no mesmo computador.
6. **Limite de tamanho** da cópia local (50 MB): quando passa, saem as leituras abertas há mais tempo.
7. `requisições.md` 1.13 (RF37), `decisoes_tecnicas.md`, a nota na DA08 e a parte da SPEC-034.

### 3.2 Não inclui

- **Lançar sem conexão** (aporte, retirada, compra, venda, estorno) para enviar depois: é a "fila de comandos pendentes" que a DA08 deixou como evolução (decisão 1).
- **Baixar tudo em segundo plano** (todas as carteiras, todos os períodos e todas as fichas): fica guardado só o que foi aberto neste computador (decisão 2).
- **Busca de ativos sem conexão**: a busca procura no catálogo do servidor. Sem conexão, o campo mostra que precisa de conexão; as fichas já abertas continuam acessíveis pelas posições das carteiras.
- **Área do colaborador sem conexão**: as telas dele servem para manter dados no servidor, e não são dados dele. O colaborador sem conexão continua vendo o login com "servidor indisponível", como hoje.
- **Mostrar a tela guardada antes da resposta do servidor** quando há conexão: com conexão, a tela continua esperando o servidor, como hoje. O ganho com conexão é o 304, não uma tela velha que depois muda.
- **Notícias**: ainda não existem. A SPEC-029 entrega a sua parte (as rotas dela entram na lista do §5.1).
- **Delta por linha** (mandar só o lançamento novo ou só o fechamento novo): fica de fora (decisão 4).

## 4. Decisões

### 4.1 Recomendações para o Luís aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Offline só leitura e o RF37** (OPEN-10) | Sem conexão, **só consulta**, como a DA08 e o RNF14 já dizem. O **RF37 é reescrito** na versão 1.13 dos requisitos: "Ao restabelecer a conexão, atualizar os dados guardados no computador, trazendo do servidor só o que mudou". A fila de lançamentos pendentes continua como evolução (DA08, alternativa 2) | Um lançamento feito sem conexão não tem como ser conferido. Na carteira ao vivo, a compra usa a cotação do próprio dia, que só o servidor tem (RB07, SPEC-014). Na histórica, a data depende do último lançamento (RB25), e o saldo e a posição dependem do livro todo (RB05, RB06, RB26). Um aporte "aceito" no app e recusado depois deixaria a carteira da tela diferente da carteira de verdade, que é justamente o que a DA01 (servidor como fonte da verdade) evita |
| 2 | **O que fica guardado** | **O que foi aberto neste computador** (DA08: "consultadas"): cada leitura bem-sucedida é guardada, com a pergunta exata (a carteira, o período, a página do extrato). Sem conexão, uma carteira ou um período nunca aberto aqui mostra "Ainda não consultado neste computador". A alternativa é baixar todas as carteiras em segundo plano ao entrar | Baixar tudo pediria ao servidor até 20 carteiras × caixa, posições e rentabilidade a cada entrada, cada uma com o cálculo da SPEC-019, num servidor gratuito. Quem consulta sem conexão quer ver o que costuma ver, e isso já está guardado. As notícias passam a ser a parte da SPEC-029, e esta Spec deixa de esperar por ela |
| 3 | **Onde e como guardar** | **Arquivos cifrados pelo cofre do SO** (`safeStorage` do Electron, o mesmo do token de renovação), na pasta de dados do app, um arquivo por leitura e um índice. **Sem cofre** (Linux sem keyring), a cópia fica **só na memória**: vale com o app aberto, como o token. Isso **troca a sugestão** do `decisoes_tecnicas.md` (SQLite com `better-sqlite3`) | O `better-sqlite3` é um módulo nativo: precisa ser compilado para a versão do Electron (no Windows, com Python e um compilador de C++), e o npm 11 já bloqueia os scripts de instalação, como acontece com o próprio Electron (README). Além disso, um SQLite comum deixaria as carteiras legíveis no disco. São poucos megabytes de JSON, e nenhuma consulta é feita dentro da cópia: a chave é a própria pergunta. Arquivos cifrados resolvem sem dependência nova |
| 4 | **Como sincronizar "só o que mudou"** (RNF19) | **Por resposta, com ETag**: o servidor calcula uma impressão digital do corpo de cada leitura e a manda no cabeçalho `ETag`. O app guarda essa impressão com a resposta e, na próxima vez, a manda em `If-None-Match`. Se for igual, o servidor responde **304 sem corpo**, e o app usa o que já tem. Vale com e sem a queda: toda leitura com conexão passa a ser assim | O que as telas mostram é **calculado**: posições, preço médio, rentabilidade e distribuição mudam com uma cotação nova sem nenhuma linha nova na carteira. "O que mudou desde a última vez" só faz sentido para a resposta inteira. Um delta por linha pediria uma tabela de mudanças para cada tipo de dado e regras para os ajustes retroativos (um provento novo muda o histórico ajustado inteiro, SPEC-010). O ETag cabe num gancho do Fastify, sem tabela nova |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Onde fica o cache** | No **processo principal**, dentro do cliente que já faz todas as chamadas (`AuthClient`). As telas continuam chamando `window.api` como hoje. A resposta passa a dizer, quando veio da cópia local sem conexão, **de quando ela é** (`savedAt`) | Todas as leituras já passam por um lugar só (`request`, com tempo-limite de 10 s). O cofre do SO só existe no processo principal, e a interface nunca toca no disco |
| **Quais leituras são guardadas** | As do §5.1: `GET` de usuário que a tela mostra. **Não** são guardadas: a busca, a cotação da negociação (`trade-quote`, que vale só para aquele minuto), o arquivo "Baixar meus dados" (`/api/me/export`), as rotas do colaborador e qualquer escrita | A busca e a cotação da negociação servem para escrever, e escrever não existe sem conexão. O arquivo de dados pessoais é baixado na hora e salvo onde a pessoa escolher (SPEC-034) |
| **Chave de cada leitura** | O caminho com a pergunta normalizada (por exemplo, `/api/portfolios/{id}/performance?period=1y`), sempre do mesmo usuário. O nome do arquivo é o SHA-256 da chave: nem o id da carteira aparece no nome | O nome do arquivo não revela nada; o conteúdo vai cifrado |
| **O que vale como "sem conexão"** | Servidor **inalcançável**: falha de rede, tempo esgotado ou resposta 502, 503 ou 504. Um **500** (erro do servidor) **não** liga o modo consulta: a tela mostra o erro, como hoje | 502, 503 e 504 são o que a hospedagem responde com o servidor fora do ar ou hibernando (arquitetura, riscos). Um 500 é um defeito, e esconder um defeito atrás de dados velhos atrapalha a correção |
| **Abrir o app sem conexão** | Ao abrir, o app tenta renovar a sessão, como hoje. Se o servidor estiver **inalcançável**, abre em modo consulta, desde que valham **as três** condições: há sessão guardada no cofre; a cópia local é **desse usuário** e de uma conta de usuário (não de colaborador); e a última renovação bem-sucedida foi há **menos de 30 dias**. Senão, vai para o login com "servidor indisponível", como hoje | 30 dias é a validade do token de renovação (SPEC-002): depois disso a sessão já acabou no servidor, e o app não deve fingir que não. Isso também garante a RB04: uma conta excluída em outro computador some desta cópia em no máximo 30 dias, mesmo sem conexão |
| **Conexão que cai no meio do uso** | Uma **leitura** que falha por servidor inalcançável devolve a cópia local com `savedAt` e liga o modo consulta. Se não há cópia, a tela mostra "Ainda não consultado neste computador". Uma **escrita** que falha por servidor inalcançável devolve `server_unavailable`, como hoje; o app **não repete sozinho** a escrita e liga o modo consulta | Repetir um aporte que talvez tenha chegado ao servidor antes da queda pode lançá-lo duas vezes. Quando a conexão volta, a tela é refeita e mostra o que de fato ficou gravado |
| **Volta da conexão** | Em modo consulta, o processo principal confere `GET /api/health` a cada **30 s** e ao clicar em **Tentar agora**. Quando o servidor responde, o app renova a sessão: deu certo → sai do modo consulta, refaz as leituras da tela atual (com o ETag) e anuncia "Conexão de volta. Os dados foram atualizados."; sessão recusada → apaga o cofre e a cópia local e vai para o login com o aviso de sessão expirada (o de hoje) | É o "ao reconectar, sincronização incremental automática" do fluxo 7.3. As outras telas guardadas se atualizam quando forem abertas: não há motivo para pedir ao servidor o que ninguém está vendo |
| **Aviso do modo consulta** | Uma faixa no topo da área de conteúdo, em todas as telas: "**Sem conexão com o servidor.** Você está vendo os dados guardados neste computador, só para consulta. Dados de {data} às {hora}.", com **Tentar agora**. A data é a da leitura **mais antiga** entre as da tela. A faixa é anunciada uma vez ao leitor de tela (`role="status"`) | É o "modo offline — dados de dd/mm hh:mm" da DA08. A mais antiga, porque a tela inteira só é tão atual quanto a parte mais velha dela |
| **Botões de escrita no modo consulta** | Ficam visíveis e **desativados**, com a dica "Precisa de conexão": Nova carteira, Copiar, Renomear, Excluir, Aportar, Retirar, Comprar, Vender, Estornar, Comprar pela ficha, Baixar meus dados e todas as alterações do perfil. A busca de ativos mostra "A busca precisa de conexão". **Sair** continua funcionando | Esconder os botões mudaria a tela inteira e confundiria quem já a conhece. Desativados com o motivo, mostram que a função existe e por que não está disponível agora |
| **Telas abertas que se atualizam sozinhas** | A ficha do ativo (que recarrega a cada 5 minutos) **não chama o servidor** em modo consulta; a volta da conexão faz isso | Evita um pedido falhando a cada intervalo e a tela piscando |
| **Servidor: ETag e 304** | Um gancho `onSend` no Fastify, em todo `GET /api/...` com resposta 200 (menos `/api/health`), calcula `ETag: W/"{SHA-256 do corpo, em base64url}"` e põe `Cache-Control: private, no-cache` quando a rota não definiu outro (o logo continua com o dele). Se o pedido traz `If-None-Match` igual, a resposta vira **304 sem corpo**. Nenhuma rota muda de regra | Um lugar só, sem tocar nas rotas. `private, no-cache` impede que um proxy guarde dados de um usuário e obriga a conferir antes de reaproveitar |
| **Respostas estáveis** | Duas leituras seguidas, sem nada mudar, têm que dar **o mesmo corpo**. Uma rota que mande um campo que muda a cada pedido (como o horário do pedido) tira esse campo ou passa a mandar o horário do dado. Em 16/11/2026 não foi encontrado nenhum campo assim nos tipos de `@simulador/shared`; o CA02 confere rota por rota | Sem isso, o ETag nunca bate, e o 304 nunca acontece |
| **O que acontece durante o pregão** | Com cotações novas a cada coleta (SPEC-009 e SPEC-040: até 45 min), as posições e a rentabilidade das carteiras ao vivo mudam, e o servidor responde 200 com o corpo. Fora do pregão, e na carteira histórica, o normal é 304 | O ETag não esconde mudança nenhuma: só evita mandar de novo o que é igual |
| **Arquivos locais** | Na pasta de dados do app (`userData`), uma pasta `cache/` com um arquivo por leitura e um `index`, todos cifrados. Cada leitura guarda: a chave, o corpo, o ETag, `savedAt` (quando o servidor respondeu) e `lastReadAt` (quando a tela usou). O índice guarda o usuário (id, nome, e-mail e tipo de conta, para abrir o Início sem o servidor), a última renovação de sessão e a lista das leituras com o tamanho de cada uma. Gravação num arquivo temporário e depois troca de nome, para não ficar arquivo pela metade | Tudo o que o modo consulta precisa para abrir sem o servidor, e nada além disso |
| **Limite de tamanho** | **50 MB** no total. Ao passar, saem as leituras com `lastReadAt` mais antigo. Um arquivo que não decifra, não é JSON ou é de outra versão do formato é apagado sem erro na tela (a leitura fica como "não consultada") | Um limite simples, que não cresce sem controle num computador compartilhado |
| **Quando a cópia local é apagada** | Sempre que o token de renovação é apagado do cofre: ao **sair** (mesmo sem conexão), quando a **sessão é recusada** ou expira na renovação, na **exclusão da conta** (SPEC-034). E também quando entra **outra pessoa**: ao entrar, se o índice é de outro usuário, tudo é apagado antes | Uma regra só: sem sessão, sem cópia. É a consequência negativa da DA08 ("precisam ser apagados no logout e na exclusão de conta") e o ponto 4 da DA13 |
| **Sair sem conexão** | Apaga o token e a cópia local na hora e vai para o login. O aviso ao servidor (revogar o token) é melhor esforço, como hoje: sem conexão ele não chega, e o token apagado do computador vence sozinho em até 30 dias | É o comportamento atual do `logout`, agora também com a cópia local |
| **Exportação (SPEC-034)** | A cópia local **não entra** no arquivo "Baixar meus dados": é uma cópia do que já está no servidor. A parte desta Spec na SPEC-034 é a **limpeza**, que a SPEC-034 §3 deixou para cá | Nada de novo no arquivo; a SPEC-034 ganha uma nota |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| P01 abriu ontem a lista, a carteira "Primeira" e o período "1 ano". Hoje abre o app no avião | O app tenta renovar a sessão e não alcança o servidor. Abre o Início em modo consulta, com a faixa "Sem conexão… Dados de 15/11/2026 às 21:10". Na lista, as carteiras de ontem. Em "Primeira": caixa, posições, distribuição, extrato (a primeira página) e a rentabilidade em "1 ano". Ao trocar para "Tudo", aparece "Ainda não consultado neste computador". Aportar, Comprar e Vender ficam desativados com "Precisa de conexão" |
| O mesmo, e a conexão volta 10 minutos depois | Na conferência seguinte (até 30 s), o servidor responde; o app renova a sessão, sai do modo consulta, refaz as leituras de "Primeira" com o ETag e anuncia "Conexão de volta. Os dados foram atualizados." O caixa e o extrato voltam 304; as posições voltam 200, porque houve cotação nova |
| Com conexão: P02 abre a mesma carteira histórica duas vezes seguidas | A segunda abertura manda `If-None-Match` em cada leitura; as quatro respondem 304 sem corpo, e a tela fica igual |
| Com conexão: P02 faz um aporte na carteira | O extrato e a rentabilidade mudam; o ETag novo não bate e o servidor manda o corpo (200), que substitui a cópia |
| A conexão cai no meio de um aporte (tempo esgotado) | O formulário mostra "servidor indisponível", como hoje, e o app entra em modo consulta. O aporte não é repetido sozinho. Quando a conexão volta, o extrato é refeito e mostra se o aporte chegou ou não |
| O servidor responde 500 numa leitura | A tela mostra o erro, como hoje; o modo consulta não liga |
| O app fica 31 dias sem conexão e é aberto | A última renovação passou de 30 dias: vai para o login com "servidor indisponível". A cópia local continua apagável pelo "Sair" e é apagada quando a renovação for recusada |
| A conta foi excluída em outro computador, e este está sem conexão | Este computador mostra a cópia local até reconectar (no máximo 30 dias depois da última renovação). Na primeira conexão, a renovação é recusada: o cofre e a cópia local são apagados |
| Luís sai do app sem conexão; Nicoly entra depois no mesmo computador | "Sair" apagou a cópia do Luís na hora. A Nicoly começa sem nada guardado |
| Luís fecha o app sem sair; Nicoly abre, sai da conta dele e entra na dela | O "Sair" apaga a cópia do Luís; se algo sobrasse, a entrada da Nicoly apagaria tudo, porque o índice é de outro usuário |
| O colaborador abre o app sem conexão | Login com "servidor indisponível", como hoje: a Área do colaborador não tem modo consulta |
| Linux sem keyring, conexão cai com o app aberto | A cópia está na memória: o modo consulta funciona até fechar o app. Ao reabrir sem conexão, vai para o login (não há sessão no disco, SPEC-002) |
| A cópia local passa de 50 MB | Saem as leituras usadas há mais tempo (por exemplo, a ficha de um ativo aberta só uma vez, há semanas) |

### 4.4 Conferido em 16/11/2026

| Pergunta | Resposta |
|---|---|
| Por onde passam as chamadas | Todas pelo processo principal: a interface chama `window.api`, que vai por IPC ao `AuthClient`, e todas as rotas passam por `request`, com tempo-limite de 10 s. Falha de rede e tempo esgotado viram `server_unavailable`; respostas de 500 em diante também. O cache cabe num lugar só, sem mexer no jeito de cada tela pedir os dados |
| O que acontece hoje sem conexão | Ao abrir, `restore` tenta renovar a sessão; sem conexão, a tela de login aparece com o aviso de servidor indisponível. No meio do uso, cada painel mostra o erro dele |
| Sessão | Token de renovação de **30 dias** (`REFRESH_TOKEN_TTL_DAYS`, SPEC-002), trocado a cada uso e guardado cifrado pelo `safeStorage` (`EncryptedFileSecretStore`). Sem cofre, fica só na memória. O `logout` apaga o cofre antes de avisar o servidor, e o aviso é melhor esforço. A confirmação da exclusão da conta e a renovação recusada também apagam o cofre |
| Leituras de cada tela | Início: consentimentos. Carteiras: `portfolios.list`, `get`, `cash` (com `offset`), `positions`, `performance` (com o período), `comparison`. Ficha: `assets.detail`, `history` (período e ajuste), `fundamentals.get`, `dividends` (período), `assets.logo`, e `portfolios.list` para o botão Comprar. Perfil: `profile.get`, `listConsents`. A busca (`assets.search`) e a cotação da negociação (`tradeQuote`) servem às escritas |
| Telas que se atualizam sozinhas | A ficha do ativo recarrega a cada 5 minutos (`ASSET_DETAIL_REFRESH_MINUTES`), e o formulário de negociação confere a cotação na carteira ao vivo |
| Servidor | Nenhuma rota manda ETag hoje. Só o logo tem `Cache-Control` (`private, max-age=86400`). Fastify 5.12 |
| SQLite no projeto | Não há. O app usa Electron 44, e cada `npm ci` exige rodar de novo o instalador do Electron, porque o npm 11 bloqueia os scripts de instalação: um módulo nativo passaria pelo mesmo problema, mais a compilação |
| Notícias | A SPEC-029 ainda não foi detalhada; não há rota de notícias |

## 5. Comportamento esperado

### 5.1 Rotas

Nenhuma rota nova e nenhuma regra nova. Todas as leituras ganham o ETag:

| Rota | Muda | Detalhes |
|---|---|---|
| Todo `GET /api/...` com resposta 200, menos `/api/health` | Sim | Cabeçalho `ETag: W/"…"` e, quando a rota não definiu outro, `Cache-Control: private, no-cache`. Com `If-None-Match` igual ao ETag atual: **304** sem corpo |

As leituras que o app **guarda** (o resto passa direto):

| Leitura | Rota | Guardada por |
|---|---|---|
| Lista de carteiras | `GET /api/portfolios` | Usuário |
| Carteira | `GET /api/portfolios/:id` | Carteira |
| Caixa e extrato | `GET /api/portfolios/:id/cash` | Carteira e página (`offset`) |
| Posições e distribuição | `GET /api/portfolios/:id/positions` | Carteira |
| Rentabilidade | `GET /api/portfolios/:id/performance` | Carteira e período (inclusive o personalizado, com as datas) |
| Comparação | `GET /api/portfolios/comparison` | Carteiras escolhidas e período |
| Ficha do ativo | `GET /api/assets/:id` | Ativo |
| Histórico de preços | `GET /api/assets/:id/history` | Ativo, período e ajuste |
| Indicadores | `GET /api/assets/:id/fundamentals` | Ativo |
| Proventos | `GET /api/assets/:id/dividends` | Ativo e período |
| Logo | `GET /api/assets/:id/logo` | Ativo |
| Perfil e consentimentos | `GET /api/me`, `GET /api/me/consents` | Usuário |
| Notícias (SPEC-029) | `GET /api/assets/:id/news`, `GET /api/assets/:id/news/days` | Ativo, grupo, página e intervalo (lista); ativo e período (marcadores) |

### 5.2 Entre a interface e o processo principal

| Peça | Mudança |
|---|---|
| `ClientResult` | Quando a resposta veio da cópia local **sem conexão**: `{ ok: true, data, savedAt }`. Com conexão (200 ou 304), sem `savedAt`, como hoje |
| `AuthResult` de `getSession` | Ao abrir em modo consulta: `{ ok: true, user, offline: true }`, com o usuário guardado no índice |
| Situação da conexão | Novo canal para a interface saber se está em modo consulta e um evento do processo principal quando isso muda (entrou em modo consulta, conexão de volta, sessão recusada). Novo canal **Tentar agora** |

### 5.3 Telas

| Situação | Tela |
|---|---|
| Qualquer tela em modo consulta | A faixa do §4.2 no topo da área de conteúdo, com a data da leitura mais antiga da tela e **Tentar agora** |
| Lista de carteiras | A lista guardada. Nova carteira, Copiar, Renomear e Excluir desativados com "Precisa de conexão". **Comparar carteiras** funciona; a comparação mostra a guardada ou "Ainda não consultado neste computador" |
| Carteira | Cabeçalho, caixa, rentabilidade, posições, distribuição e extrato guardados. Aportar, Retirar, Comprar, Vender, Estornar e Copiar carteira desativados. Período ou página do extrato nunca vistos aqui: "Ainda não consultado neste computador" no lugar do painel, e "Mostrar mais" desativado depois da última página guardada |
| Ficha do ativo | Dados, gráfico (os períodos já vistos), indicadores, proventos e logo guardados. Comprar desativado. Sem atualização automática |
| Ativos | O campo de busca mostra "A busca precisa de conexão" |
| Meu perfil | Dados e consentimentos guardados. Todas as alterações, Baixar meus dados e Excluir conta desativados. **Sair** funciona |
| Conexão de volta | A faixa some, a tela atual é refeita e "Conexão de volta. Os dados foram atualizados." é anunciado |
| Sessão recusada na volta | Login com o aviso de sessão expirada (o de hoje) |
| 480 px | A faixa quebra em duas linhas, com **Tentar agora** embaixo; sem rolagem lateral |

Em português e em inglês, pelo teclado (os botões desativados continuam recebendo foco e mostrando a dica), a 480 px e com contraste (RNF04, RNF18, RNF20).

## 6. Modelo de dados

| Onde | Mudança |
|---|---|
| Banco do servidor | **Nenhuma.** Sem migração |
| Computador do usuário | Pasta `cache/` nos dados do app: um arquivo cifrado por leitura (nome = SHA-256 da chave) e um `index` cifrado (§4.2). Formato com número de versão: um formato antigo é apagado, não convertido |

O `modelo_dominio.md` não muda: a cópia local não é entidade do domínio (o mapa já dizia "Nenhuma nova (cópia local)").

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | **Cópia cifrada:** cada leitura do §5.1, com conexão, fica guardada com o ETag e `savedAt`; nos arquivos da pasta `cache/` não aparece em texto nenhum dado (por exemplo, o nome de uma carteira ou o e-mail); sem cofre, nada é gravado no disco e a cópia vive na memória |
| CA02 | **ETag e 304:** todo `GET /api/...` com 200 (menos `/api/health`) traz `ETag` e `Cache-Control: private, no-cache` (o logo mantém o dele); com `If-None-Match` igual, 304 sem corpo; para cada rota do §5.1, duas leituras seguidas sem mudança dão o mesmo ETag; depois de um aporte, de uma compra ou de uma cotação nova, o ETag das rotas afetadas muda |
| CA03 | **Com conexão:** o app manda `If-None-Match` com o ETag guardado; no 304, a tela recebe o corpo guardado, sem `savedAt`; no 200, a cópia é trocada; nenhuma tela muda de comportamento com conexão |
| CA04 | **Abrir sem conexão:** com sessão guardada, cópia do mesmo usuário (conta de usuário) e última renovação há menos de 30 dias, o Início abre em modo consulta; com renovação há 30 dias ou mais, sem cópia, sem sessão ou com conta de colaborador, vai para o login com "servidor indisponível", como hoje. Servidor fora do ar (502, 503, 504, sem rede, tempo esgotado) liga o modo consulta; um 500 não liga |
| CA05 | **Queda no meio do uso:** a leitura que falha devolve a cópia com `savedAt`, ou "Ainda não consultado neste computador"; a escrita devolve `server_unavailable` e **não é repetida**; o app entra em modo consulta |
| CA06 | **Telas em modo consulta:** a faixa com a data da leitura mais antiga da tela e **Tentar agora**; os botões de escrita do §5.3 desativados com "Precisa de conexão"; a busca indisponível; a ficha sem atualização automática; **Sair** funciona; em português e em inglês, pelo teclado, a 480 px, com contraste, e a faixa anunciada ao leitor de tela |
| CA07 | **Volta da conexão:** a conferência a cada 30 s e o **Tentar agora** acham o servidor; a sessão é renovada, a tela atual é refeita com o ETag e "Conexão de volta…" é anunciado; com a renovação recusada, o cofre e a cópia são apagados e o login mostra a sessão expirada |
| CA08 | **Limpeza:** depois de Sair (com e sem conexão), da renovação recusada, da exclusão da conta e da entrada de outro usuário, a pasta `cache/` está vazia e a memória também |
| CA09 | **Limite e arquivos ruins:** passando de 50 MB, saem as leituras usadas há mais tempo, até caber; um arquivo que não decifra, corrompido ou de outro formato é apagado e tratado como "não consultado", sem erro na tela |
| CA10 | **RNF19 medido:** reabrir uma carteira histórica de 10 anos sem mudança: quantos bytes vieram na primeira abertura e na segunda (com os 304), anotado no §9. Abrir a mesma carteira em modo consulta leva menos de 2 s (QA04) |
| CA11 | `requisições.md` 1.13 (RF37 reescrito), `decisoes_tecnicas.md` (cache local em arquivos cifrados), nota na DA08, SPEC-034 (a limpeza da cópia local) e o mapa (OPEN-10 resolvida; SPEC-029 entrega a sua parte) atualizados |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-10 | ✅ **Resolvida** (decisão 1 do §4.1, aprovada em 16/11/2026): offline só leitura e o RF37 reescrito na versão 1.13 dos requisitos |
| SPEC-029 | Quando for detalhada, diz quais leituras de notícias entram na cópia local (§5.1) e as testa em modo consulta |
| Fila de lançamentos pendentes | Continua como evolução (DA08, alternativa 2; arquitetura, evoluções). Se um dia for feita, o modo consulta já tem a faixa e os botões onde ela entraria |

## 9. Verificação (16/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | No servidor, `registerEtag` (`api/src/shared/http/etag.ts`): um gancho `onSend` registrado antes das rotas. No app, a cópia local em `app/src/main/offline-cache.ts` (`EncryptedFileOfflineCache`, com `MemoryOfflineCache` sem cofre); as leituras do `AuthClient` passam por `read` e `cachedRead` (`If-None-Match`, 304 e a cópia sem conexão); `ConnectionMonitor` faz a conferência a cada 30 s e o "Tentar agora"; canais `connection:*` no preload. Na interface, `ConnectionContext`, `useNeedsConnection` e a faixa `OfflineBanner` |
| Botões de escrita | Recebem `aria-disabled`, `aria-describedby` (a dica "Precisa de conexão.", que fica na faixa) e `title`. Quem barra o clique (do mouse, do Enter ou do espaço) é a moldura, num lugar só (`stopDisabledClick`, na fase de captura), para nenhuma ação escapar |
| Data da faixa | O preload avisa a data de cada leitura que veio da cópia local; a faixa mostra a mais antiga desde a última troca de tela |
| Volta da conexão | A tela atual é montada de novo e relê tudo com o ETag; o usuário da moldura passa a ser o que o servidor devolveu |
| "Mostrar mais" do extrato sem conexão | Se a página seguinte nunca foi vista neste computador, o extrato continua na tela e aparece "Ainda não consultado neste computador" embaixo do botão, em vez de trocar o extrato pelo erro |
| Leitura que termina depois da saída | Não grava na cópia (a sessão tem um contador que muda a cada saída). E, ao entrar, uma cópia que sobrou sem dono ou de outra conta é apagada antes |
| Busca de ativos sem conexão | A tela Ativos troca a busca pela mensagem e não chama o servidor |
| Ficha do ativo sem conexão | A atualização a cada 5 minutos continua na tela, mas em modo consulta o processo principal responde da cópia, sem sair para a rede: a tela não precisou mudar |
| Pré-visualização | A ponte falsa (`app/.previa`, fora do Git) ganhou `?offline=1` e `window.__previa.goOffline()`. A cotação dos dados falsos ganhou o horário, que faltava desde a SPEC-009 e derrubava a tela Ativos só na pré-visualização |

| Critério | Resultado |
|---|---|
| CA01 | ✅ `offline-cache.test.ts`: guarda e devolve cada leitura; nos bytes dos arquivos e nos nomes deles não aparece o nome da carteira, o e-mail nem a rota; o dono e a última renovação sobrevivem a reabrir; sem cofre, nada vai para o disco e a cópia vale na memória |
| CA02 | ✅ `etag.test.ts`: `ETag: W/"…"` (SHA-256 em base64url) e `private, no-cache`; com `If-None-Match` igual, 304 sem corpo, sem tipo nem tamanho; comparação fraca, lista e `*`; corpo novo, ETag novo; o logo tem ETag e continua com o `Cache-Control` dele; escrita, erro, `/api/health` e rota fora da API ficam sem ETag. Nas rotas de verdade (servidor de teste): cada leitura do §5.1 repetida sem mudança tem o mesmo ETag e responde 304 com ele; um aporte muda o ETag do caixa, das posições e da rentabilidade, e não o da ficha |
| CA03 | ✅ `auth-client.test.ts`: a primeira leitura vai sem `If-None-Match`, a segunda vai com, e o 304 devolve o corpo guardado, sem `savedAt`; com o corpo novo no servidor, a cópia é trocada; nenhum aviso de conexão com o servidor no ar |
| CA04 | ✅ Abre em modo consulta com a sessão renovada há 30 dias menos 1 minuto; com 30 dias, vai para o login com `server_unavailable`; colaborador não tem cópia nem modo consulta; um 500 não liga o modo consulta; 502, 503, 504 e a rede fora ligam |
| CA05 | ✅ A leitura volta da cópia com `savedAt`; a nunca aberta, `not_saved_offline`; em modo consulta nenhum pedido sai para a rede; a escrita sai uma vez só e volta `server_unavailable` |
| CA06 | ✅ Pré-visualização com a ponte falsa em modo consulta: a faixa "Sem conexão com o servidor…" com "Dados de 15 de novembro de 2026 às 18:10." (a leitura mais antiga da tela); Nova carteira, Renomear, Copiar, Excluir, Copiar carteira, Aportar, Retirar, Comprar e Estornar e, no perfil, Editar nome, Trocar e-mail, Trocar senha, Baixar meus dados e Excluir minha conta com `aria-disabled`, focáveis e com a dica; clicar ou apertar Enter não abre nada; o período "12 meses", nunca aberto, mostra "Ainda não consultado neste computador."; a tela Ativos diz que a busca precisa de conexão; a queda no meio do uso troca a busca pela mensagem e anuncia "Sem conexão…" ao leitor de tela; em inglês; a 480 px sem rolagem lateral, com o "Try now" embaixo do texto; contraste da faixa de 15,4:1 (texto) e 5,4:1 (data) no tema claro e de 13,1:1 e 6,1:1 no escuro. ⏳ Abrir no Electron, com a ponte real e o servidor desligado |
| CA07 | ✅ `connection-monitor.test.ts`: confere a cada 30 s só em modo consulta e para ao sair; servidor fora do ar ou sem banco: continua em modo consulta; "Tentar agora" junto com a conferência periódica faz uma conferência só. `auth-client.test.ts`: a volta renova a sessão, sai do modo consulta e avisa com o usuário; a sessão recusada apaga o cofre e a cópia e avisa a saída; o app aberto sem conexão também reconecta. Na pré-visualização, a primeira tentativa mostra "Ainda sem conexão…" e a segunda volta com "Conexão de volta. Os dados foram atualizados." e os botões ativos |
| CA08 | ✅ Sair com e sem conexão, a renovação recusada (no uso normal e na volta), a exclusão da conta e a entrada de outra conta apagam a cópia; no teste com arquivos, limpar apaga a pasta inteira |
| CA09 | ✅ Passando do limite, sai a leitura usada há mais tempo; uma leitura maior que o limite nem entra; um arquivo corrompido vira "não consultado" e some; um índice de outro formato começa do zero; arquivos que o índice não conhece saem ao abrir |
| CA10 | ✅ Medido no servidor de teste: uma carteira histórica de 2016 a 2026 (2.711 pregões, 131 compras). A primeira abertura (lista, carteira, extrato, posições e rentabilidade em "Tudo") trouxe **139.350 bytes** (106.682 da rentabilidade e 30.651 do extrato); a segunda, sem mudança, **0 byte de corpo** (5 respostas 304). Pela cópia local, ler essas 5 leituras do disco levou **5,3 ms** (com o cofre falso dos testes; o do Windows acrescenta pouco a isso) |
| CA11 | ✅ `requisições.md` 1.13 (RF37), `decisoes_tecnicas.md` (cache local), DA08 (atualização), `drivers_arquiteturais.md` (divergência 2), SPEC-034 (a limpeza da cópia local) e o mapa v1.54 (OPEN-10 resolvida; a SPEC-029 entrega a sua parte) |

Total: **1.050 testes** passando (36 novos), com o banco de teste, mais lint, tipos e formatação.
