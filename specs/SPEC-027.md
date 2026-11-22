# SPEC-027 — Fontes oficiais de notícias e coleta

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 12/11/2026 pela Nicoly; aprovada por ela no mesmo dia com as recomendações do §4.1, a 1 sem o pedido de confirmação por e-mail; implementada e validada como usuária (§9) |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)), a primeira da fase |
| Prioridade | Could (RF26); começo da trilha de notícias que a Visão §24 destaca (SPEC-029) |
| Depende de | [SPEC-002](SPEC-002.md) (colaborador), [SPEC-008](SPEC-008.md) (padrão de ingestão: adaptador, idempotência, novas tentativas, execução registrada), [SPEC-041](SPEC-041.md) (visitas ao Investidor10, com o interruptor e o ritmo) |
| Muda | SPEC-041 (o `investidor10:apagar` passa a apagar também as notícias do Investidor10) |
| Requisitos | RF26; RNF13 |
| Casos de uso | Ler notícias do ativo (lado do sistema, ator Serviço de notícias); fluxo 7.4 da arquitetura (coleta) |
| Drivers | OBJ02, OBJ03, FAS04, QA02, QA08, PA04 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA11](../adr/DA11-noticias-ia-modulo-isolado.md), [DA14](../adr/DA14-registro-execucoes-logs.md), [DA19](../adr/DA19-fontes-de-noticias.md) |

---

## 1. Objetivo

O processador passa a **coletar notícias** de duas fontes, sem duplicar e com cada execução registrada:

- da **fonte pai**, o **Investidor10** (DA19): as notícias novas a cada 30 minutos e, uma única vez, o arquivo desde 2023;
- das **fontes curadas**, que o colaborador cadastra (feeds RSS ou Atom, com categoria e confiabilidade). A primeira é a Agência Brasil.

Esta Spec só **guarda**. Quem usa as notícias vem depois: o vínculo com os ativos e o sentimento (SPEC-028) e a ficha do ativo (SPEC-029).

## 2. Valor

- **Sistema:** a base de notícias de que a SPEC-028 precisa para classificar e a SPEC-031 para os cenários (OBJ03).
- **Projeto:** começa a trilha de notícias, que a Visão §24 trata como parte central do MVP.

## 3. Escopo

### 3.1 Inclui

1. **Fonte pai Investidor10:** notícias novas pelo sitemap de notícias deles, e o arquivo desde 22/09/2023 (cerca de 22.500 notícias), carregado devagar.
2. **Fontes curadas** por RSS ou Atom: cadastro pelo colaborador, com nome, endereço, categoria e confiabilidade; ativar e desativar.
3. **Coleta sem duplicar**, com as notícias atualizadas quando a fonte muda o texto.
4. **Tela do colaborador** "Fontes de notícias": as fontes, a última coleta de cada uma, quantas notícias há e o andamento do arquivo do Investidor10.
5. **Fim da autorização:** o `investidor10:apagar` apaga também as notícias deles.

### 3.2 Não inclui

- **Vínculo com os ativos e sentimento:** SPEC-028. Esta Spec só guarda as empresas que o próprio Investidor10 marca em cada notícia, para a SPEC-028 usar.
- **Notícias na tela do usuário** (ficha do ativo e gráfico Notícias × Preço): SPEC-029.
- **Fontes do usuário** (feeds que ele mesmo adiciona) e preferências: SPEC-030.
- **Redes sociais, fóruns e Reddit** (DA19, ponto 4): fora.

## 4. Decisões

### 4.1 Aceitas pela Nicoly em 12/11/2026

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Autorização das notícias** (OPEN-28) | O Investidor10 autorizou **por telefone**, em **12/11/2026**, o uso das notícias para fins universitários, nas mesmas condições da autorização dos dados (só neste projeto, "Fonte: Investidor10", sem uso comercial, até a apresentação). Sem pedido de confirmação por e-mail (decisão da Nicoly). A coleta fica atrás do mesmo interruptor `INVESTIDOR10_ENABLED` | Fica registrado quando e como veio a autorização, e um interruptor só desliga tudo do Investidor10 |
| 2 | **Como coletar do Investidor10** | Sem RSS (o endereço deles devolve erro). As **novas** vêm do sitemap de notícias (`/sitemap-news.xml`, as cerca de 50 mais recentes, com título e data), lido **a cada 30 minutos**. Para cada notícia nova, uma visita à página, que traz os dados estruturados `NewsArticle` (título, texto, data, autor) e os temas e empresas marcados. O ritmo é o da SPEC-041: **uma página a cada 3 segundos** | São os caminhos que o próprio site publica para buscadores. Os dados estruturados evitam depender do layout da página |
| 3 | **Arquivo desde 2023** | Uma carga única de todo o arquivo (`/noticias/sitemap.xml`: 22.491 notícias, de 22/09/2023 até hoje), **da mais nova para a mais antiga**, no mesmo ritmo de uma página a cada 3 segundos (cerca de 19 horas no total). Ela anda nas horas em que não há coleta de notícias novas e continua de onde parou se o processador for desligado | A SPEC-028 precisa de histórico para treinar e avaliar o sentimento, e a SPEC-031 para os cenários (OPEN-31). Devagar, para não pesar no site deles |
| 4 | **O que guardar** | Título, endereço, data de publicação e de atualização, autor, temas, empresas marcadas, **resumo** e **texto completo**. O texto completo serve só para a classificação (SPEC-028): o app vai mostrar título, data, resumo, "Fonte: Investidor10" e o link **"Ler no Investidor10"** (SPEC-029), nunca a matéria inteira | Respeita o conteúdo deles e manda o leitor para o site, que é o que interessa a eles |
| 5 | **Fontes curadas** (OPEN-29) | Só **RSS ou Atom** (sem raspar páginas, DA19). O colaborador cadastra nome, endereço, **categoria** (economia, mercado, empresas, internacional) e **confiabilidade** (de 1 a 5), e marca que **conferiu a licença** da fonte. A primeira sugerida é a **Agência Brasil – Economia**, que publica com licença Creative Commons. Das curadas, guarda-se o que o feed traz (título, link, data, resumo), sem visitar a página | A lista e o critério de confiabilidade da OPEN-29 ficam com a equipe, com uma regra simples. A Agência Brasil é pública e de uso livre com atribuição |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Sem duplicar** | A chave de cada notícia é a fonte mais o endereço (sem `?` nem `#`). Se a fonte mudar a data de atualização, o texto é atualizado; a data de publicação nunca muda | Uma notícia, uma linha |
| **Segurança dos feeds** | Só `https`, só endereços públicos (recusa IPs internos, como `localhost`, `10.x`, `192.168.x`, também depois de redirecionar), resposta de até 2 MB, tempo máximo de 20 segundos, no máximo 200 itens por leitura, e todo conteúdo guardado como **texto puro** (sem HTML nem scripts) | DA19: os mesmos cuidados valem para o colaborador agora e para o usuário na SPEC-030 |
| **Falha de fonte** | Uma fonte fora do ar não para as outras nem o app (RNF13): fica registrada na execução, com novas tentativas como na SPEC-008, e a tela do colaborador mostra "Última coleta com erro" | QA02 |
| **Ritmo das curadas** | Cada feed a cada 30 minutos; mais de 3 falhas seguidas marcam a fonte "com problema" na tela, sem desativar | O colaborador decide |
| **Fonte pai** | Criada pela migração, com tipo `pai`. Não pode ser desativada nem apagada pela tela; o que a desliga é o interruptor | DA19: a base mínima nunca some por engano |
| **Fim da autorização** | O `investidor10:apagar` apaga as notícias da fonte pai e o andamento do arquivo | Mesmas condições dos dados |
| **Retenção** | As notícias ficam guardadas (não têm dado pessoal) | Histórico para as SPECs 028 e 031 |
| **Rotas** | Só para o colaborador: `GET /api/news/sources` (fontes, com a última coleta, a quantidade de notícias e o andamento do arquivo), `POST /api/news/sources` (nova curada), `PATCH /api/news/sources/:id` (ativar, desativar, editar) | Cadastro de fontes (RF26, DA19) |
| **Onde fica** | Módulo novo **Notícias** (DA11), só no processador para coletar, com os adaptadores `Investidor10NewsSource` e `FeedSource` atrás de portas (DA06). Outros módulos só leem | DA11: o módulo de notícias nunca derruba o núcleo |
| **Auditoria** | Cadastro, edição, ativação e desativação de fonte vão para o registro de auditoria, como as mudanças do catálogo | Rastro das ações do colaborador |
| **Exportação (SPEC-034)** | Sem mudança: não há dado pessoal. As fontes do usuário (SPEC-030) entram lá | Nada a exportar aqui |

### 4.3 O que os dados mostram (12/11/2026)

| Achado | Dado |
|---|---|
| RSS do Investidor10 | Não existe: `/noticias/rss/` devolve erro do próprio site, e `/feed/` dá 404 |
| Sitemap de notícias | `/sitemap-news.xml`: 51 notícias (as mais recentes), com título e data e hora de publicação |
| Arquivo | `/noticias/sitemap.xml`: 22.491 notícias, cada uma com `lastmod`, da nº 1 (22/09/2023) à nº 123.866 (12/11/2026), e 166 páginas "Notícias sobre" de empresas |
| Página da notícia | Dados estruturados `NewsArticle` com título, texto completo (2.228 caracteres no exemplo da PETR4), data de publicação e de atualização e autor; temas ("Dividendos", "Petróleo") e empresas marcadas ("Notícias sobre Petrobras", "Notícias sobre PRIO") |
| `robots.txt` do Investidor10 | Não proíbe `/noticias/` |
| Agência Brasil – Economia | RSS 2.0 funcionando, com as 10 últimas (título, link, data e resumo em HTML) |

### 4.4 Exemplos

| Situação | Resultado |
|---|---|
| Notícia nova no sitemap às 17:03 | Na coleta seguinte (até 30 minutos depois), uma visita à página e a notícia guardada com o texto, os temas e as empresas marcadas |
| A mesma notícia com `lastmod` novo | O texto e a data de atualização são atualizados; continua uma notícia só |
| Arquivo: processador desligado depois de 8.000 notícias | Ao ligar, continua da 8.001ª |
| Colaborador cadastra `http://10.0.0.5/feed` | Recusado: "Use um endereço https público" |
| Feed da Agência Brasil fora do ar | Execução registrada com erro; as outras fontes e o app seguem normais |
| `INVESTIDOR10_ENABLED=false` | Nada do Investidor10 é coletado; as curadas continuam |
| `npm run investidor10:apagar` | Somem as notícias do Investidor10 e o andamento do arquivo, junto com os dados das SPECs 041 e 042 |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/news/sources` (nova) | Colaborador | — | Fontes (tipo, nome, endereço, categoria, confiabilidade, ativa, última coleta e situação, total de notícias) e o andamento do arquivo do Investidor10 (feitas, total, situação) | 403 para o usuário |
| `POST /api/news/sources` (nova) | Colaborador | `name`, `url`, `category`, `reliability` (1 a 5), `licenseChecked: true` | 201 com a fonte; o primeiro teste do feed roda na hora e diz quantos itens achou | 400 `validation_error` (`url`: `not_https`, `private_address`, `not_a_feed`; `licenseChecked`: `required`); 409 `source_exists` |
| `PATCH /api/news/sources/:id` (nova) | Colaborador | `name`, `category`, `reliability` ou `active` | 200 com a fonte | 409 `parent_source` (a fonte pai não muda pela tela) |

### 5.2 Telas

Na Área do colaborador, **Fontes de notícias**:

- a lista das fontes, com a fonte pai no topo, marcada "Fonte pai: não pode ser desativada";
- de cada fonte: a última coleta, a situação, quantas notícias há, e os botões Ativar/Desativar e Editar;
- o andamento do arquivo do Investidor10 ("8.000 de 22.491");
- o formulário **Nova fonte** (nome, endereço do feed, categoria, confiabilidade, "Conferi que a licença permite o uso").

Português e inglês, pelo teclado, 480 px.

## 6. Modelo de dados

| Tabela | Campos | Restrições |
|---|---|---|
| `fonte_noticia` (nova) | `id`, `tipo` (`pai`, `curada`), `nome`, `url`, `categoria`, `confiabilidade`, `ativa`, `licenca_conferida_em`, `criada_em`, `atualizada_em` | Uma só `pai`; `url` única; `confiabilidade` de 1 a 5; `https` obrigatório |
| `noticia` (nova) | `id`, `fonte_id`, `url`, `titulo`, `resumo`, `texto` (pode ser vazio nas curadas), `autor`, `temas`, `empresas_marcadas`, `publicada_em`, `atualizada_na_fonte_em`, `coletada_em` | (`fonte_id`, `url`) única; índice por `publicada_em` |
| `coleta_noticia_arquivo` (nova) | `fonte_id`, `total`, `feitas`, `ultima_url`, `situacao`, `atualizada_em` | Uma por fonte |

As execuções usam o registro que já existe (SPEC-008, DA14), com tarefas novas (`noticias_novas`, `noticias_arquivo`, `noticias_feeds`). A migração cria a fonte pai e tem `down.sql` (RNF17). `FONTE_NOTICIA` entra no modelo conceitual (OPEN-44).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Notícias novas do Investidor10 pelo sitemap a cada 30 minutos, com título, texto, data, autor, temas e empresas marcadas, no ritmo de uma página a cada 3 segundos |
| CA02 | Arquivo desde 2023, da mais nova para a mais antiga, continuando de onde parou; com dados reais, uma amostra de 200 notícias carregada e conferida |
| CA03 | Sem duplicar; atualização pelo `lastmod`, com a data de publicação mantida |
| CA04 | Fontes curadas por RSS e Atom, com a Agência Brasil coletando de verdade |
| CA05 | Segurança: só `https` público (também depois de redirecionar), 2 MB, 20 segundos, 200 itens, texto puro |
| CA06 | Fonte fora do ar: execução com erro, novas tentativas e as outras fontes seguindo (RNF13); "com problema" depois de 3 falhas seguidas |
| CA07 | Interruptor desligado: nada do Investidor10; `investidor10:apagar` apaga as notícias e o andamento |
| CA08 | Rotas e tela do colaborador (403 para o usuário); fonte pai sem desativar; auditoria das mudanças |
| CA09 | Banco: as restrições do §6; migração desfeita e refeita (RNF17) |
| CA10 | Leitura do sitemap, da página `NewsArticle` e do RSS testada com arquivos de exemplo, sem rede nos testes |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-28 | ✅ Parte de notícias resolvida (decisão 1): autorizada por telefone em 12/11/2026, nas mesmas condições dos dados |
| OPEN-29 | ⏳ Com a decisão 5: lista inicial (Agência Brasil) e confiabilidade de 1 a 5 dada pela equipe. Desde a [SPEC-047](SPEC-047.md), o formulário sugere InfoMoney, Valor Econômico, Exame e Investing.com Brasil; a licença e a confiabilidade continuam com a equipe |
| OPEN-31 | ⏳ Histórico de notícias: o arquivo do Investidor10 começa em 22/09/2023 (cerca de 3 anos); a janela de treino é decisão da SPEC-028 |
| OPEN-44 | ⏳ `FONTE_NOTICIA` entra no modelo conceitual |

## 9. Verificação (12/11/2026)

**Ajustes da implementação:**

| Tema | Ajuste |
|---|---|
| Onde fica | Módulo novo `api/src/modules/news` (DA11): leitores puros em `domain/` (sitemaps, `NewsArticle`, RSS e Atom, texto puro, endereços internos), `NewsCollection` e `NewsSourcesService` em `application/`, e os adaptadores `Investidor10NewsHttpSource`, `HttpFeedFetcher` e `PrismaNewsRepository`. O registro de execuções é o da SPEC-008 (tarefas `noticias_novas`, `noticias_arquivo` e `noticias_feeds`) |
| Fila do Investidor10 | As notícias novas e o arquivo dividem a mesma fila: nunca duas páginas ao mesmo tempo, sempre 3 segundos desde a anterior. A coleta semanal da SPEC-041 (domingo às 03:00) tem a fila dela; as duas podem coincidir por alguns minutos |
| Arquivo por partes | No processador, o arquivo roda a cada 35 minutos, com até 550 páginas por vez (cerca de 30 minutos). Notícia que sumiu (404) ou sem os dados estruturados não volta para o topo da fila. Terminado, só busca de novo as notícias com `lastmod` mais novo que o guardado |
| Temas e empresas | Só os links do corpo da matéria: o menu do site também tem links de tema ("Últimos Resultados"), que entravam em toda notícia |
| Texto | As quebras de parágrafo do texto completo ficam (servem à SPEC-028) |
| Primeiras fontes | A migração cria a fonte pai e a Agência Brasil – Economia (licença conferida na própria migração, decisão 5) |
| Buscador de feeds | Recusa `http`, `localhost`, IP interno e nome que resolve para IP interno, antes de cada redirecionamento (até 3). Resposta acima de 2 MB é cortada e recusada; 20 segundos no máximo |
| Tela | **Notícias** no menu do colaborador. Na validação, a tabela passava da largura da tela: o endereço passou a quebrar a linha e, abaixo de 860 px, cada fonte vira cartão, como as posições. Em 375 px, o menu do colaborador (agora com 5 itens) cortava o "Meu perfil": em telas estreitas a lista do menu rola de lado, e o Sair continua visível |
| Menu em telas estreitas (a pedido do Luís, 16/11/2026) | Com a rolagem de lado, o "Meu perfil" ficava fora da vista sem nenhuma pista mesmo em 480 px, a largura mínima da janela (RNF04), e entre 561 e uns 690 px o Sair saía da ilha. Até 719 px, o menu do colaborador fica compacto (sem o avatar, o Sair só com o ícone, espaços e letra um pouco menores): os 5 itens cabem em 480 px com uns 10 px de folga, e a rolagem fica para larguras menores. O contorno do foco passa para dentro do botão, porque a lista corta o que passa da borda |
| Ordem das fontes (CI, 18/11/2026) | A fonte pai primeiro (a ordem do tipo no banco), depois as curadas na ordem de cadastro, com o nome como desempate. Só pela data de criação, a ordem entre as duas fontes da migração variava num banco novo, porque elas nascem no mesmo milissegundo. Por isso, o teste com banco "andamento do arquivo e a limpeza do fim da autorização" falhava na CI (esperava 3, vinham 4): a notícia da Agência Brasil ia para a fonte pai. Teste novo: a pai vem primeiro mesmo quando é criada depois |
| Auditoria | `fonte_noticia_cadastrada` e `fonte_noticia_editada`, com a entidade `fonte_noticia`. O `down.sql` não apaga linhas da auditoria (o gatilho barra); reescreve as colunas, como a reversão da SPEC-021 |
| Validação visual | Primeira Spec com a validação como usuária pedida pela Nicoly: roteiro no navegador embutido e o mesmo roteiro salvo em `tests/e2e/news-sources.e2e.ts` (Playwright, com o Edge do Windows, janela aberta e devagar), com o `window.api` falso de `mocks/window-api.js` (dados fictícios: colaboradora "Colaboradora Teste" e as fontes do `mocks/README.md`) |

**Coleta real (banco de desenvolvimento, 12/11/2026, 21:35–21:50):**

| Tarefa | Resultado |
|---|---|
| Fontes curadas | Agência Brasil – Economia: 10 notícias (título, link, data e resumo) em menos de 1 segundo |
| Notícias novas (sitemap de notícias) | 51 notícias, de 29/10 a 12/11/2026, em 2min55s (51 páginas + o sitemap) |
| Arquivo (amostra de 200) | 200 notícias em 11min28s (cerca de 3,4 s por página), sem falha; andamento gravado: 251 de 22.482 (o sitemap tinha 22.482 notícias nessa hora) |
| Segunda execução das novas | Nenhuma notícia nova; nada duplicado (251 notícias, 251 endereços) |
| Conteúdo | As 251 com texto completo (2.568 caracteres em média), 221 com temas e 97 com empresas marcadas |

**Checklist da validação como usuária** (navegador embutido e `npm run test:e2e`):

| Critério | Resultado |
|---|---|
| CA01 | ✅ Notícias novas: 51 reais, com texto, temas e empresas; teste da fila de 3 s (`news-collection.test.ts`) |
| CA02 | ✅ Arquivo: 200 reais, da mais nova para a mais antiga, andamento "251 de 22.482"; continuar de onde parou e notícia que sumiu nos testes |
| CA03 | ✅ Sem duplicar e atualização pelo `lastmod`, com a data de publicação mantida (testes e banco) |
| CA04 | ✅ Agência Brasil coletando de verdade (10 notícias); RSS e Atom nos testes |
| CA05 | ✅ Na tela: `http://` recusado ("Use um endereço que comece com https://."), endereço interno recusado ("Use um endereço https público (não da rede interna)."), endereço repetido recusado. Nos testes: `localhost`, `127.0.0.1`, `10.0.0.5`, `[::1]`, `169.254.169.254`, nome que resolve para IP interno, redirecionamento para a rede interna, 2 MB |
| CA06 | ✅ Fonte fora do ar não para as outras (teste); na tela, "Com problema: 4 falhas seguidas" e o erro da última coleta |
| CA07 | ✅ Interruptor desligado: aviso na tela e nada do Investidor10 coletado (teste); `clearParent` apaga notícias e andamento (banco) |
| CA08 | ✅ Na tela: lista com a fonte pai no topo, sem botão de desativar; desativar e ativar a Agência Brasil; cadastrar a InfoMoney com o teste do feed. Rotas: 403 para o usuário, 401 sem sessão, 409 na fonte pai, auditoria |
| CA09 | ✅ Restrições no PostgreSQL (`https`, curada com licença, fonte pai sempre ativa e única); migração desfeita e refeita sem diferença |
| CA10 | ✅ Sitemaps, `NewsArticle`, RSS e Atom com arquivos de exemplo, sem rede |
| Erros na tela | ✅ Campo vazio (todos os campos apontados, nada enviado), dado inválido, lista vazia (só a fonte pai, "Ainda não coletada"), carregamento lento ("Carregando as fontes…", "Testando o feed…"), clique duplo (uma chamada só) e celular 375 px (cartões, menu alcançável, sem rolagem lateral) |

Total: **1035 testes** passando, **132 com o banco** de teste e **6 de ponta a ponta**, mais lint, tipos e formatação.

**Para as próximas Specs:** a SPEC-028 liga as notícias aos ativos (as empresas marcadas pelo Investidor10 ajudam) e classifica o sentimento; a SPEC-029 mostra título, resumo, "Fonte: Investidor10" e "Ler no Investidor10" na ficha do ativo.
