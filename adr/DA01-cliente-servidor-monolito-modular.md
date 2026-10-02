# DA01 — Cliente-servidor com monólito modular

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | OBJ04, OBJ05, RES01–RES03, PA01–PA03, FAS06 |
| Relacionadas | [DA08](DA08-cache-dois-niveis-offline-leitura.md), [DA12](DA12-autorizacao-planos-no-servidor.md) |

## Contexto

O sistema precisa de dados compartilhados entre usuários (cotações, indexadores, notícias), regras que não podem ser burladas (RB05, RB06), plano pago (RF33) e evolução futura (OBJ05). A equipe tem duas pessoas e um semestre (RES01, RES02).

## Alternativas consideradas

1. **App 100% local**, sem servidor — simples, mas cada usuário consumiria o limite das APIs externas (PA03), não haveria como garantir o plano pago nem compartilhar dados coletados.
2. **Microsserviços** — independência de implantação, mas custo operacional e de infraestrutura incompatível com a equipe e o orçamento.
3. **Monólito modular** — uma única aplicação, dividida em módulos com fronteiras explícitas.

## Decisão

Alternativa 3. O servidor é a **fonte da verdade**; o cliente apenas apresenta dados e envia comandos.

## Consequências

- (+) Uma única implantação, uma única base de código no servidor, baixo custo.
- (+) Módulos bem delimitados permitem extrair um serviço separado no futuro, se necessário (ex.: IA).
- (−) Exige disciplina: um módulo só acessa outro pela sua interface pública, nunca pelas tabelas dele.
