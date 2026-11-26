# SPEC-047 — Mais fontes de notícias e notícias repetidas entre fontes

| Campo | Conteúdo |
|---|---|
| Status | ✅ Escrita em 21/11/2026, a pedido da Nicoly (referência "Integração de notícias econômicas"); aprovada por ela no mesmo dia, como escrita ("aprovo spec 047"), e implementada (§9) |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)) |
| Prioridade | Should (proposta) |
| Depende de | [SPEC-027](SPEC-027.md) (fontes e coleta), [SPEC-028](SPEC-028.md) (vínculo com os ativos), [SPEC-029](SPEC-029.md) (notícias na ficha), [SPEC-044](SPEC-044.md) (sentimento) |
| Muda | O processador (marca as repetidas depois de cada coleta e uma vez nas notícias já guardadas), o banco (`noticia.repetida_de_id`), o servidor (as listas e as contagens deixam as repetidas de fora), o app (sugestões no formulário Nova fonte; "Também em" na ficha; repetidas na tela Notícias do colaborador), a SPEC-027 (OPEN-29) e o mapa |
| Requisitos | RF26; RNF13, RNF17 |
| ADRs | [DA06](../adr/DA06-adaptadores-fontes-externas.md), [DA07](../adr/DA07-ingestao-assincrona.md), [DA19](../adr/DA19-fontes-de-noticias.md) (só RSS ou Atom, sem raspar páginas) |

---

## 1. Objetivo

1. **Mais fontes curadas:** o formulário **Nova fonte** do colaborador sugere os feeds RSS de **InfoMoney**, **Valor Econômico**, **Exame** e **Investing.com Brasil**, que foram testados e respondem. O colaborador confere a licença e cadastra, como já faz com qualquer fonte curada (SPEC-027).
2. **Notícias repetidas entre fontes:** a mesma matéria que chega por duas fontes (o mesmo endereço, ou o mesmo título republicado) vira **uma notícia só** para quem lê. A repetida fica guardada, ligada à original, e a ficha mostra "Também em: Valor, Exame".

## 2. Valor

- **Usuário:** mais notícias de mercado na ficha do ativo, sem ver a mesma notícia duas ou três vezes.
- **Pesquisa (sentimento × preço):** uma notícia repetida não conta duas vezes no sentimento do pregão (SPEC-044) nem nos marcadores do gráfico (SPEC-029).
- **Hoje:** a coleta só evita repetir dentro da mesma fonte (fonte + endereço, SPEC-027). Entre fontes, nada.

## 3. Escopo

### 3.1 Inclui

1. **Fontes sugeridas** no formulário Nova fonte, com nome, endereço e categoria já preenchidos.
2. **Marcar as repetidas** entre fontes: pelo endereço e pelo título quase igual (§4.1, decisão 3), depois de cada coleta, e uma vez nas notícias já guardadas.
3. **Deixar as repetidas de fora** da ficha (lista, marcadores e contagens), do vínculo com os ativos, do sentimento e da amostra de avaliação (SPEC-044).
4. **"Também em"** na ficha, com o link para a matéria em cada fonte.
5. Na tela **Notícias** do colaborador, quantas repetidas cada fonte trouxe.

### 3.2 Não inclui

- **Agrupar o "mesmo assunto"** (duas matérias diferentes sobre o mesmo fato): continuam duas notícias (§4.1, decisão 4).
- **Google News, CNN Brasil, Reuters** (§4.1, decisão 1).
- **Feed de notícias para o usuário** com filtros por empresa, setor, período e sentimento: é outra Spec (SPEC-030).
- **Impacto por empresa com justificativa e confiança:** SPEC-031.
- **Visitar a página das matérias** (DA19): das curadas, continua só o que o feed traz.

## 4. Decisões

### 4.1 Aprovadas pela Nicoly em 21/11/2026 (as recomendações)

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Quais fontes sugerir** | **InfoMoney** (`https://www.infomoney.com.br/feed/`, mercado), **Valor Econômico** (`https://valor.globo.com/rss/valor`, economia), **Exame** (`https://exame.com/feed/`, economia) e **Investing.com Brasil** (`https://br.investing.com/rss/news.rss`, mercado). **Ficam de fora:** o **Google News** (a busca por "bolsa, ibovespa, ações" trouxe prefeituras, Exército e "ações" do governo; os links passam por um redirecionamento do Google; e ele reagrega os veículos que já seriam coletados, a maior fonte de repetidas), a **CNN Brasil** (o feed de economia deu 404) e a **Reuters** (sem feed público) | Testados em 21/11/2026: os quatro respondem com RSS. Feed é o meio que o próprio veículo oferece para mostrar título, resumo e link (DA19) |
| 2 | **Sugerir, não cadastrar sozinho** | As quatro aparecem como **sugestões** no formulário Nova fonte; o colaborador escolhe uma, **confere a licença** e cadastra, com a confiabilidade que a equipe der. Nada entra pela migração | A SPEC-027 pede que alguém da equipe confira a licença de cada fonte curada; só a Agência Brasil (Creative Commons) entrou já conferida. O Valor tem conteúdo para assinantes: o feed traz título e resumo, e a matéria fica no site |
| 3 | **O que é repetida** | Uma notícia é **repetida** de outra, de **outra fonte**, publicada até **48 horas** antes ou depois, quando: **(a)** o **endereço é o mesmo**, sem `?`, `#`, `www.` e a barra do fim; ou **(b)** o **título é quase igual**: sem acento, maiúsculas, pontuação, o " - Nome do veículo" do fim e as palavras de até 2 letras, com **pelo menos 80% das palavras em comum** (Jaccard ≥ 0,8) | Na medição de 21/11/2026 (255 itens de 6 feeds), as cópias tinham título idêntico ou quase (republicação). "Mesmo assunto, outra matéria" ficou em 64% (Exame × Valor sobre a prisão do "Chapo Isidro"): com 80%, isso não vira repetida |
| 4 | **Mesmo assunto não é repetida** | Duas matérias diferentes sobre o mesmo fato continuam **duas notícias** | São textos diferentes, de veículos diferentes; juntar pediria comparar o conteúdo (fora do que o feed traz) e esconderia pontos de vista |
| 5 | **Qual fica como a original** | A **primeira coletada**; no empate, a da **fonte pai** (Investidor10), depois a de **maior confiabilidade**. A repetida guarda **`repetida_de_id`** e continua no banco | Nunca troca a original depois (o vínculo e o sentimento dela já foram calculados). Guardar a repetida permite o "Também em" e desfazer, se a regra mudar |
| 6 | **Onde a repetida fica de fora** | Na **ficha** (lista, "Ver mais", marcadores e contagens do pregão), no **vínculo com os ativos** (não recebe vínculo próprio), no **sentimento** (não é classificada) e na **amostra de rótulos** (SPEC-044). Na tela **Notícias** do colaborador, aparece contada à parte ("12 repetidas") | Uma notícia, uma contagem: a pesquisa não pode contar a mesma matéria duas vezes |

### 4.2 Aprovadas junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Quando marcar** | Logo depois de gravar cada coleta (fonte pai, arquivo e curadas), comparando só com as notícias das 48 horas em volta. Uma vez, ao subir a versão, nas notícias já guardadas (tarefa de uma execução, registrada como as outras) | O vínculo (SPEC-028) e o sentimento (SPEC-044) rodam depois e já encontram a repetida marcada |
| **Notícia que já tinha vínculo e sentimento** | Na marcação das antigas, a repetida perde o vínculo e o sentimento, e a original fica como está | Uma contagem só |
| **Original apagada** (`investidor10:apagar`) | As repetidas dela deixam de ser repetidas (`ON DELETE SET NULL`) e voltam a aparecer na próxima marcação, que pode ligá-las a outra original | Nada some por causa de um apagamento |
| **"Também em" na ficha** | No rodapé do cartão: "Também em: Valor Econômico, Exame", cada nome com o link para a matéria naquela fonte | Quem prefere um veículo abre nele |
| **Fontes sugeridas na tela** | No formulário Nova fonte, uma lista "Sugestões testadas" com as quatro; clicar preenche nome, endereço e categoria; a confiabilidade e a licença ficam com o colaborador. Uma já cadastrada some da lista | Tira o trabalho de achar o endereço certo do feed |
| **Contagem por fonte** | Na tela Notícias do colaborador, cada fonte mostra o total e quantas foram repetidas | O colaborador vê se uma fonte só repete as outras e pode desativá-la |
| **Rotas** | Nenhuma nova. `GET /api/assets/:id/news` traz `alsoIn` (fonte e endereço) em cada notícia; `GET /api/news/sources` traz `duplicates` por fonte | — |

### 4.3 Exemplos

| Situação | Resultado |
|---|---|
| O InfoMoney e o Valor publicam a mesma nota da Agência Brasil, com o mesmo título | Uma notícia (a da Agência Brasil, coletada primeiro); na ficha, "Também em: InfoMoney, Valor Econômico" |
| "Diretor da X compra US$ 34.240 em ações" no Investing.com e no Investidor10, com o mesmo endereço de origem | Uma notícia |
| Exame: "México prende 'Chapo Isidro'…"; Valor: "México captura narcotraficante 'El Chapo Isidro'…" (64% das palavras) | Duas notícias |
| O mesmo título, publicado com 5 dias de diferença | Duas notícias (fora das 48 horas: pode ser outro fato) |
| A original é apagada com o `investidor10:apagar` | A repetida volta a valer como notícia na próxima marcação |

## 5. Comportamento esperado

### 5.1 Processador

| Quando | O quê |
|---|---|
| Depois de gravar uma coleta | Para cada notícia nova: procura, nas outras fontes, uma notícia nas 48 horas em volta com o mesmo endereço normalizado ou com o título quase igual (decisão 3); achou, grava `repetida_de_id` com a original (decisão 5) |
| Uma vez, depois da migração | A mesma marcação em todas as notícias guardadas, em ordem de coleta; a repetida perde o vínculo e o sentimento |
| Vínculo (SPEC-028) e sentimento (SPEC-044) | Pulam as repetidas |

### 5.2 Servidor

| Rota | Mudança |
|---|---|
| `GET /api/assets/:id/news` e os dias com notícia | Só as originais; cada uma com `alsoIn: [{ source, url }]` |
| `GET /api/news/sources` | Cada fonte com `duplicates` (quantas repetidas trouxe) |
| As últimas notícias do colaborador (SPEC-028) | Só as originais |

### 5.3 Telas

| Situação | Tela |
|---|---|
| Nova fonte | "Sugestões testadas" com as quatro; clicar preenche o formulário |
| Notícias do colaborador | Ao lado do total de cada fonte, "N repetidas" |
| Ficha do ativo | No cartão da notícia com repetidas, "Também em: …" com os links |

Em português e inglês, pelo teclado, a 480 px e com contraste (RNF04, RNF18, RNF20).

## 6. Modelo de dados

| Tabela | Mudança | Restrições |
|---|---|---|
| `noticia` | `repetida_de_id` (uuid, nulo) e `repetida_por` (`endereco` ou `titulo`, nulo) | Chave estrangeira para `noticia(id)` com `ON DELETE SET NULL`; os dois juntos (ou ambos nulos); índice em `repetida_de_id` |

A migração tem `down.sql` (RNF17) e passa no `npm run db:check`.

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | O formulário Nova fonte mostra as quatro sugestões; clicar preenche nome, endereço e categoria; a licença e a confiabilidade continuam com o colaborador; uma já cadastrada não aparece |
| CA02 | Notícia de outra fonte, nas 48 horas, com o mesmo endereço normalizado ou título quase igual (≥ 80%), vira repetida da primeira coletada (empate: fonte pai, depois confiabilidade); "mesmo assunto" abaixo de 80% e fora das 48 horas não |
| CA03 | A repetida fica de fora da ficha (lista, marcadores, contagens), do vínculo, do sentimento e da amostra de rótulos; a original mostra "Também em" com os links |
| CA04 | A marcação das notícias já guardadas roda uma vez, registrada; a repetida perde o vínculo e o sentimento |
| CA05 | Apagar a original libera a repetida, que volta na próxima marcação |
| CA06 | A tela Notícias do colaborador mostra as repetidas por fonte |
| CA07 | Testes do domínio (normalização do endereço e do título, Jaccard, janela de 48 h, escolha da original), do banco (chave e `ON DELETE SET NULL`) e E2E da ficha e do formulário; em português e inglês e a 480 px |
| CA08 | Migração com `down.sql`, desfeita e refeita sem diferença no `npm run db:check`; SPEC-027 (OPEN-29) e mapa atualizados; e a lista das fontes que de fato coletaram depois do cadastro |

## 8. Pontos em aberto

| Tema | Situação |
|---|---|
| OPEN-29 | A lista inicial de fontes curadas cresce com as quatro sugestões; a confiabilidade de cada uma continua com a equipe |
| Google News por ativo | Se a equipe quiser notícias de veículos que não têm feed, uma busca por ativo no Google News pode voltar numa Spec própria, com o ruído medido |
| Feed do usuário com filtros | SPEC-030 |

## 9. Implementação (21/11/2026)

| Parte | O que mudou |
|---|---|
| Domínio | `news/domain/duplicates.ts`: endereço normalizado, palavras do título, Jaccard, janela de 48 h e `findOriginal`. Título com menos de 4 palavras só vale se for igual (poucas palavras enganam) |
| Processador | `NewsDeduplicator`: confere as notícias ainda não conferidas, na ordem de coleta (empate: fonte pai, depois confiabilidade), e liga a repetida à original. Roda depois de cada coleta e a cada 30 minutos, antes do vínculo e do sentimento (tarefa "notícias repetidas e vínculo"). Como o vínculo, não grava execução nem aparece na tela Tarefas; a primeira volta confere todas as já guardadas |
| Banco | Migração `20261121120000_noticias_repetidas`: `repetida_de_id` (chave para `noticia`, `ON DELETE SET NULL`), `repetida_por` (`endereco` ou `titulo`) e `repeticao_conferida_em`; a restrição recusa um sem o outro e a notícia repetida dela mesma. Um gatilho tira o motivo e a data da conferência quando a ligação some (original apagada), e a notícia é conferida de novo |
| Repetida | Perde o vínculo e o sentimento; o rótulo da equipe passa para a original, se ela não tem um. Fica fora do vínculo, da classificação, da amostra de rótulos, das últimas notícias e das contagens |
| Servidor | `alsoIn` em cada notícia da ficha; `duplicates` em cada fonte |
| Telas | "Sugestões testadas" no formulário Nova fonte (somem as já cadastradas; o clique preenche nome, endereço e categoria); "N repetidas" na tabela de fontes; "Também em: …" no cartão da notícia |
| Validação | 1.231 testes (com o banco `simulador_test`) e 28 roteiros E2E (3 novos em `tests/e2e/news-duplicates.e2e.ts`). O leitor de feeds do app leu os quatro feeds reais (InfoMoney 10, Valor 100, Exame 25, Investing.com 10 itens), e a regra marcou 1 repetida entre os 155 itens (a mesma matéria da Reuters no InfoMoney e no Investing.com). No banco de desenvolvimento, a primeira volta conferiu as notícias guardadas sem nenhuma repetida (só Investidor10 e Agência Brasil). As quatro fontes ainda não foram cadastradas: o colaborador confere a licença de cada uma |
