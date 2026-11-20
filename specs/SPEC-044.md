# SPEC-044 — Classificação de sentimento das notícias

| Campo | Conteúdo |
|---|---|
| Status | 📝 Escrita em 17/11/2026 pela Nicoly com o Claude; aguardando a aprovação das recomendações do §4.1 e das propostas do §4.2 |
| Fase | 7 — Notícias e cenários ([mapa de specs](mapa_specs.md)), depois da SPEC-029 |
| Prioridade | Could (RF28); dado central da pesquisa (OBJ03) e pré-requisito dos cenários (SPEC-031) |
| Depende de | [SPEC-027](SPEC-027.md) (notícias coletadas), [SPEC-028](SPEC-028.md) (vínculo), [SPEC-029](SPEC-029.md) (notícias na ficha) |
| Muda | A ficha do ativo (SPEC-029) ganha o tom de cada notícia, quando o modelo passar na avaliação; `decisoes_tecnicas.md` (implementação do modelo); DA20 (nota com o que foi decidido); mapa (OPEN-30 resolvida, OPEN-31 em parte) |
| Requisitos | RF28; RNF13, RNF16 |
| Casos de uso | Analisar sentimento das notícias; fluxo 7.4 da arquitetura (classificação) |
| Drivers | OBJ03, FAS04, PA04, QA09 |
| ADRs | [DA10](../adr/DA10-nucleo-calculo-puro.md), [DA11](../adr/DA11-noticias-ia-modulo-isolado.md), [DA15](../adr/DA15-carater-educacional.md), [DA19](../adr/DA19-fontes-de-noticias.md), [DA20](../adr/DA20-modelo-ia-noticias.md) |

---

## 1. Objetivo

O processador dá a cada notícia um **sentimento** — **positivo**, **neutro** ou **negativo** — e guarda **qual versão do modelo** o produziu (DA20). A notícia ainda sem classificação fica **pendente**.

A equipe **rotula à mão** uma amostra de notícias na tela do colaborador, e cada versão do modelo é **medida** contra essa amostra. O usuário só vê o sentimento na ficha do ativo quando a versão em uso **passa na nota mínima**; antes disso, o dado existe só para a pesquisa e para o colaborador.

## 2. Valor

- **Sistema:** a base da hipótese de pesquisa (OBJ03) e da SPEC-031: dia a dia, o tom das notícias de cada ativo, com uma medida honesta de quanto o modelo acerta.
- **Usuário:** na ficha, o tom de cada notícia e o resumo do pregão ("2 positivas, 1 negativa"), sempre como leitura automática que pode errar (DA15).

## 3. Escopo

### 3.1 Inclui

1. **Interface do classificador** (DA11) e a **primeira versão**: regras com um dicionário de termos do mercado em português (§4.1, decisão 1).
2. **Versões do modelo** registradas no banco; cada notícia guarda a versão que a classificou.
3. **Classificação no processador**, logo depois do vínculo (SPEC-028), e numa tarefa a cada 30 minutos para as pendentes e para refazer tudo quando a versão muda.
4. **Amostra rotulada** pela equipe na tela do colaborador, e a **avaliação** de cada versão contra ela (acurácia, F1 macro e a tabela de erros).
5. **Nota mínima** para o sentimento aparecer ao usuário (§4.1, decisão 4).
6. Na **ficha do ativo** (SPEC-029): o tom em cada notícia e as contagens no painel do pregão, quando a versão passou.

### 3.2 Não inclui

- **Modelo treinado** (BERT em português, modelo de linguagem por API ou combinação): fica para uma versão futura, que entra pela mesma interface e só substitui a atual se medir melhor na mesma amostra (DA20). Por isso a janela de treino (OPEN-31) continua em aberto.
- **Sentimento por ativo dentro da mesma notícia** ("boa para a PRIO, ruim para a Petrobras"): a v1 dá um tom só para a notícia.
- **Sentimento diário por ativo** (SENTIMENTO_DIARIO) e os cenários: SPEC-031 (DA21).
- **Cor dos marcadores no gráfico** pelo sentimento: os marcadores da SPEC-029 continuam iguais.
- **Fontes do usuário:** SPEC-030 (DA19: nunca entram na avaliação).

## 4. Decisões

### 4.1 Recomendações para aprovar

| # | Tema | Recomendação | Motivo |
|---|---|---|---|
| 1 | **Primeira versão do modelo** (OPEN-30) | **Regras com dicionário** (léxico), em código puro no módulo Notícias: termos do mercado com peso ("lucro explode", "dispara", "recorde", "tomba", "derrubam", "prejuízo", "rebaixa"), negação ("não", "sem") e intensidade ("mais de"), lidos no **título** (peso 2) e no **resumo** (peso 1). Roda no processador, sem download, sem custo e sem mandar texto para fora | Custo zero (RES03) e funciona no servidor gratuito. Não manda o texto do Investidor10 para um serviço de terceiros (DA19). E dá uma **linha de base medida**: um modelo melhor depois precisa provar que acerta mais. Um modelo pronto não é garantia: o FinBERT-PT-BR, feito para notícias financeiras em português, acertou 34% (pouco acima do acaso, com 3 classes) num teste publicado por terceiros |
| 2 | **O que é o sentimento** | O tom da notícia **para o ativo principal** (SPEC-028). Se ela não tem ativo principal, o tom é para o mercado brasileiro. Positivo: fato bom para quem tem o ativo (lucro maior, dividendo, contrato, alta). Negativo: fato ruim (prejuízo, queda, multa, rebaixamento). Neutro: informativo, agenda, opinião dividida | Sem uma definição, cada pessoa rotula de um jeito e a nota não quer dizer nada. A mesma regra vale para a equipe rotular e para o modelo |
| 3 | **Amostra rotulada e avaliação** | A equipe rotula **pelo menos 150 notícias** na tela do colaborador. O modelo não aparece enquanto se rotula, para não influenciar. A amostra é dividida **pelo tempo**: as **60% mais antigas** servem para ajustar o dicionário, e as **40% mais novas** para a nota. A nota é a **F1 macro** (média do acerto nas 3 classes), com a acurácia e a tabela de erros ao lado | O DA20 manda separar no tempo e nunca embaralhar. A F1 macro não deixa um modelo que chama tudo de "neutro" parecer bom. 150 notícias dão umas 60 de teste, o mínimo para a nota não oscilar demais |
| 4 | **Quando o usuário vê** | Só quando a versão em uso foi avaliada com **pelo menos 60 notícias de teste** e teve **F1 macro de 0,60 ou mais**. Abaixo disso, a ficha continua como na SPEC-029, e o colaborador vê o motivo | Mostrar um tom errado em metade das notícias engana o usuário (DA15). A pesquisa continua com os dados de qualquer jeito |
| 5 | **Rótulo humano, não de preço** | A amostra é rotulada **por pessoas**, lendo a notícia. O rótulo automático pelo preço depois da notícia (proposta do DA20) **não** é usado | A SPEC-031 vai testar se o sentimento antecipa o preço. Se o sentimento fosse aprendido do próprio preço, o teste daria certo por construção |

### 4.2 Propostas para aprovar junto com a Spec

| Tema | Proposta | Motivo |
|---|---|---|
| **Pontuação** | Cada notícia tem uma pontuação de −1 a 1 (a soma dos pesos, limitada). Acima de **0,2** é positiva, abaixo de **−0,2** é negativa, e entre os dois é neutra. Os limites fazem parte da versão | A faixa neutra evita chamar de positiva uma notícia com um termo bom solto |
| **Texto lido** | Título e resumo, nunca o texto completo | O texto completo (cerca de 2.500 caracteres) cita outras empresas e o mercado, e mistura os tons. A Agência Brasil só tem resumo |
| **Versão** | O nome e o número da versão ficam no código (`lexico`, v1). O processador registra a versão ao começar; se for nova, ela passa a ser a **em uso**, e todas as notícias voltam a ser pendentes e são classificadas de novo. A anterior fica **retirada**, com a sua nota guardada | Mesmo padrão da versão da regra de vínculo (SPEC-028). Cada notícia guarda a versão que a classificou (DA20) |
| **Quando** | Logo depois do vínculo de cada lote (SPEC-028); e na tarefa "sentimento das notícias", a cada 30 minutos, em lotes de 500 | Nada fica pendente por muito tempo |
| **Avaliação** | Botão **Avaliar agora** na tela do colaborador. O servidor compara os rótulos com a classificação da versão em uso e guarda a nota na versão, com a data e o tamanho da amostra | Fica registrado com qual nota cada versão foi usada |
| **Rotular** | Na tela do colaborador, a próxima notícia **sem rótulo** (título, resumo, fonte, data, ativos principais e o link) e os botões **Positivo**, **Neutro**, **Negativo** e **Pular**, também pelas teclas 1, 2, 3 e 0. Primeiro aparecem as notícias com ativo principal. O rótulo pode ser trocado ou apagado na lista dos rotulados | Rotular 150 notícias leva uns 30 minutos. O teclado ajuda |
| **Quem rotulou** | O rótulo guarda só a data, não a pessoa. Se duas pessoas rotulam a mesma notícia, vale o último | Sem dado pessoal: nada muda na exportação nem na exclusão de conta (SPEC-034) |
| **Na ficha** | Cada notícia mostra uma etiqueta **"Tom: positivo"**, com texto e ícone, não só cor. O painel do pregão mostra "No pregão: 2 positivas, 1 neutra, 1 negativa". Abaixo das notícias vem a nota "Tom classificado automaticamente (léxico v1); pode errar. Não é recomendação." | Pelo leitor de tela e sem depender da cor (RNF04). Caráter educacional (DA15) |
| **Rotas** | A lista e os dias da SPEC-029 ganham o campo `sentiment` (ou `null`, se a versão não passou ou se a notícia está pendente). Rotas do colaborador: `GET /api/news/sentiment`, `GET /api/news/sentiment/next`, `PUT` e `DELETE /api/news/:id/label`, `POST /api/news/sentiment/evaluate` | A ficha não muda de rota, e a cópia offline (SPEC-032) guarda o campo junto |
| **Onde fica** | No módulo Notícias (DA11): o dicionário e a pontuação são puros (`domain/sentiment-lexicon.ts`), assim como a métrica (`domain/sentiment-evaluation.ts`). O classificador fica atrás de uma porta (`SentimentClassifier`) | DA10. Trocar pelo modelo treinado é trocar só a implementação |
| **Fim da autorização** | O `investidor10:apagar` apaga as notícias; a classificação e os rótulos saem junto | Nada sobra |

### 4.3 Exemplos (títulos reais de 12/11/2026, rótulo esperado pela decisão 2)

| Notícia | Esperado |
|---|---|
| "Lucro da Prio (PRIO3) explode 707% com produção recorde e Brent mais caro" | Positivo |
| "Petrobras (PETR4) pagará dividendos de R$ 15,3 bilhões; veja condições" | Positivo |
| "Balanço fraco e redução de payout derrubam ações do BB (BBAS3)" | Negativo |
| "Marcopolo (POMO4) vê lucro cair 43% e chegar a R$ 186,5 mi no 3T26" | Negativo |
| "Embraer (EMBJ3) vai desdobrar papeis listados em Nova York" | Neutro |
| "Dólar dispara mais de 1% e Ibovespa sobe com ata do Copom" (sem ativo principal) | Positivo para o mercado: o Ibovespa sobe. Caso difícil, porque "dispara" aparece num fato que não é bom para todos |
| "Petróleo tomba mais de 6% com expectativa pelo fim da guerra" (sem ativo principal) | Neutro. Caso difícil: o léxico tende a ver negativo, e é a amostra que mostra se isso pesa |

## 5. Comportamento esperado

### 5.1 Rotas

| Rota | Quem | Entrada | Sucesso | Erros |
|---|---|---|---|---|
| `GET /api/assets/:id/news` (SPEC-029) | Usuário | — | Cada notícia ganha `sentiment` (`positive`, `neutral`, `negative` ou `null`) | Os da SPEC-029 |
| `GET /api/assets/:id/news/days` (SPEC-029) | Usuário | — | Cada dia ganha `sentiment` (`{positive, neutral, negative}` ou `null`), e a resposta ganha `model` (nome e versão, ou `null` se não está visível) | Os da SPEC-029 |
| `GET /api/news/sentiment` (nova) | Colaborador | — | A versão em uso, as contagens (classificadas, pendentes, rotuladas para ajuste e para teste), a última avaliação (data, n, acurácia, F1 macro, tabela de erros), se está visível e o motivo, e as versões anteriores com as notas | 403 para o usuário |
| `GET /api/news/sentiment/next` (nova) | Colaborador | `skip` (ids pulados) | A próxima notícia sem rótulo, sem a classificação do modelo; ou `null` se acabaram | 403 |
| `PUT /api/news/:id/label` (nova) | Colaborador | `{ sentiment }` | 204 | 400 valor inválido; 404 notícia; 403 |
| `DELETE /api/news/:id/label` (nova) | Colaborador | — | 204 | 404; 403 |
| `POST /api/news/sentiment/evaluate` (nova) | Colaborador | — | A avaliação guardada | 409 `not_enough_labels` com menos de 10 notícias de teste; 403 |

### 5.2 Telas

- **Notícias (colaborador)**, nova seção **Sentimento**:
  - versão em uso, classificadas e pendentes;
  - a avaliação (nota, acurácia, tabela de erros 3 × 3 com cabeçalhos para o leitor de tela);
  - "Visível para os usuários: não — faltam 23 notícias de teste" ou "sim";
  - o botão **Avaliar agora**;
  - o painel **Rotular**, e a lista dos rotulados com troca e remoção.
- **Ficha do ativo:** a etiqueta de tom em cada notícia, as contagens no painel do pregão e a nota de caráter educacional, só quando visível.

Português e inglês, pelo teclado, 375 px.

## 6. Modelo de dados

| Tabela | Campos | Restrições |
|---|---|---|
| `versao_modelo` (nova) | `id`, `nome` (`lexico`), `numero`, `situacao` (`em_uso`, `retirada`), `criada_em`, `avaliada_em`, `amostra_teste`, `acuracia`, `f1_macro`, `matriz` (JSON 3 × 3) | Única por (`nome`, `numero`); no máximo uma `em_uso` (índice único parcial); campos da avaliação todos preenchidos ou todos vazios |
| `noticia` (SPEC-027) | Ganha `sentimento` (`positivo`, `neutro`, `negativo`), `sentimento_pontuacao` (−1 a 1), `classificada_em`, `versao_modelo_id` | Todos preenchidos ou todos vazios (vazios = pendente); índice por `versao_modelo_id` |
| `rotulo_noticia` (nova) | `noticia_id` (chave), `sentimento`, `rotulado_em` | Apaga junto com a notícia |

A migração tem `down.sql` (RNF17). `VERSAO_MODELO` entra no modelo de domínio (já prevista no DA20).

## 7. Critérios de aceitação

| ID | Critério |
|---|---|
| CA01 | Léxico puro com testes de unidade: termos, negação, intensidade, peso do título e os limites de 0,2; os exemplos claros do §4.3 corretos (RNF16) |
| CA02 | Classificação no processador logo depois do vínculo e pela tarefa de 30 minutos; versão nova reclassifica todas; cada notícia guarda a versão; falha do classificador numa notícia não para as outras nem o app (RNF13, DA11) |
| CA03 | Métrica pura com testes: acurácia, F1 macro e tabela de erros; divisão no tempo 60/40; mínimo de 10 de teste para avaliar |
| CA04 | Rotular, pular, trocar e apagar rótulo pela tela e pelo teclado; o modelo não aparece enquanto se rotula; rotas do colaborador com 403 para o usuário |
| CA05 | Visibilidade: com menos de 60 de teste ou F1 abaixo de 0,60, a ficha e as rotas do usuário vêm sem sentimento; acima, com a etiqueta, as contagens do pregão e a nota |
| CA06 | Com dados reais: todas as notícias guardadas classificadas, com a contagem por classe e o tempo; a avaliação feita assim que a equipe rotular a amostra (os rótulos são da equipe, não do Claude) |
| CA07 | Banco: domínios fechados, uma só versão em uso, restrições de preenchido ou vazio, rótulos e classificação saem com a notícia; migração desfeita e refeita (RNF17) |
| CA08 | Cópia offline (SPEC-032): a ficha sem conexão mostra o tom guardado |
| CA09 | `decisoes_tecnicas.md`, nota no DA20 e mapa (OPEN-30 resolvida; OPEN-31 com o que mudou) |
| CA10 | Validação visual como usuária (checklist, navegador visível, erros e 375 px) e o roteiro em `tests/e2e/` |

## 8. Pontos em aberto

| ID | Situação |
|---|---|
| OPEN-30 | Resolvida por esta Spec, se aprovada: léxico no processador como v1; nota mínima F1 macro 0,60 com 60 notícias de teste; troca de versão só se medir melhor na mesma amostra. Retreino: não se aplica à v1 |
| OPEN-31 | Em parte: a v1 não treina, então a janela de treino fica para o modelo treinado. O histórico disponível é o arquivo do Investidor10, desde 22/09/2023 |
| — | Rotular a amostra é trabalho da equipe (Nicoly e Luís), não do código. Até isso acontecer, o sentimento existe só para o colaborador |
| — | Modelo treinado (FinBERT-PT-BR ajustado com a amostra, ou um modelo de linguagem): próxima versão, se o léxico não passar ou ficar perto do limite |
