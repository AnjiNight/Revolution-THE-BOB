# DA19 — Fontes de notícias: fonte pai, fontes curadas e fontes do usuário

| Campo | Valor |
|---|---|
| Status | Aceita, com **ponto em aberto crítico** (autorização da fonte pai) |
| Data | 01/10/2026 |
| Drivers | OBJ02, OBJ03, FAS04, QA02, QA08, Visão §18 |
| Relacionadas | [DA06](DA06-adaptadores-fontes-externas.md), [DA11](DA11-noticias-ia-modulo-isolado.md), [DA13](DA13-dados-pessoais-concentrados.md), [DA20](DA20-modelo-ia-noticias.md) |

## Contexto

A equipe decidiu que:

1. o aplicativo tem **fontes de notícias pré-definidas**, consideradas confiáveis;
2. o usuário pode **escolher** quais fontes acompanhar, **adicionar** outras e definir a **prioridade** de cada uma;
3. existe uma **fonte pai**, com a maior prioridade, que o usuário **não pode trocar nem desativar**, por segurança do aplicativo;
4. a fonte pai escolhida é o **Investidor10**.

O motivo de segurança, como registrado aqui: garantir que exista sempre uma base mínima e confiável de notícias, que nenhuma configuração do usuário consiga desligar.

## Alternativas consideradas

1. **Apenas fontes definidas pela equipe** — controle total, mas não atende a Visão §18.
2. **Livre escolha do usuário, sem fonte fixa** — flexível, mas o usuário poderia ficar só com fontes pouco confiáveis.
3. **Três níveis de fonte**: pai, curadas e do usuário.

## Decisão

Alternativa 3.

| Tipo | Quem define | Usuário pode desativar? | Prioridade | Entra no treino da IA e nas probabilidades oficiais? |
|---|---|---|---|---|
| **Fonte pai** | Equipe | Não | Sempre a maior | Sim |
| **Curadas** | Equipe/colaborador, com categoria e confiabilidade | Sim | Definida pelo usuário | Sim |
| **Do usuário** | O próprio usuário | Sim (pode remover) | Definida pelo usuário | **Não** |

Regras:

- A **prioridade** define a ordem das notícias exibidas e o peso de cada fonte no **sentimento personalizado** mostrado ao usuário.
- As **probabilidades oficiais** ([DA21](DA21-cenarios-por-sentimento.md)) e o **treino do modelo** ([DA20](DA20-modelo-ia-noticias.md)) usam **apenas a fonte pai e as curadas**. Assim, os resultados são comparáveis entre usuários e ao longo do tempo, e uma fonte ruim ou mal-intencionada adicionada por um usuário não contamina o modelo.
- **Fontes do usuário** são aceitas apenas como feeds RSS/Atom informados por URL, sem raspagem de páginas. Medidas de segurança:
  - somente endereços HTTPS públicos (bloquear endereços internos da rede do servidor);
  - limite de tamanho e de frequência de coleta;
  - conteúdo tratado como texto (sem HTML ou scripts executáveis);
  - limite de fontes por usuário.
- Uma mesma URL é coletada **uma vez** para todos os usuários que a adicionaram.
- As fontes e preferências do usuário são dados dele: entram na exportação e na exclusão de dados (DA13).

## Consequências

- (+) Atende a Visão §18 sem perder o controle sobre a base usada nas análises.
- (+) Uma fonte nova é um novo cadastro, com os adaptadores existentes (DA06).
- (−) **Dependência de uma única fonte pai**: se ela sair do ar ou bloquear a coleta, a base mínima cai. As fontes curadas continuam funcionando como contingência (QA02).
- (−) O sentimento personalizado difere entre usuários; a interface precisa deixar claro quando mostra o personalizado e quando mostra o oficial.

## Pontos em aberto

1. **[Crítico] Uso do Investidor10 como fonte pai.** Não foi encontrada API ou feed público de notícias do Investidor10, e os [Termos de Uso](https://investidor10.com.br/pagina/termos-de-uso2/) dele restringem o uso a fins **pessoais e não comerciais**, com todos os direitos reservados. Coletar o conteúdo automaticamente sem autorização pode violar esses termos. Caminhos:
   - pedir **autorização por escrito** ao Investidor10 pelo contato oficial; ou
   - escolher uma fonte pai com **dados abertos**, por exemplo os **fatos relevantes e comunicados das companhias publicados pela CVM**, que são oficiais, gratuitos e têm histórico.
2. Quantas fontes cada usuário pode adicionar.
3. Como a prioridade vira peso numérico (ex.: pesos 3, 2, 1 pela ordem).
4. Fontes alternativas da Visão §18 (Reddit, fóruns, redes sociais): fora do MVP?

## Impacto nos outros documentos

- **Requisitos:** novos RFs (gerenciar fontes, ativar/desativar, definir prioridade, adicionar feed); nova regra de negócio "a fonte pai não pode ser desativada nem substituída pelo usuário".
- **Modelo de domínio:** novas entidades FONTE_NOTICIA (tipo, categoria, confiabilidade, URL, ativa) e PREFERENCIA_FONTE (usuário, fonte, ativa, prioridade); NOTICIA ligada à sua fonte.
