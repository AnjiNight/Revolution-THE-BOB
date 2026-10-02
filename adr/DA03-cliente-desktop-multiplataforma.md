# DA03 — Cliente desktop multiplataforma

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | RES06, QA14, FAS06, RNF05, RNF08 |
| Relacionadas | [DA05](DA05-autenticacao-propria.md), [DA08](DA08-cache-dois-niveis-offline-leitura.md) |

## Contexto

A aplicação é desktop e precisa rodar em Windows, macOS e Linux (RES06, QA14), com consulta offline (FAS06) e armazenamento seguro de credenciais (RNF08).

## Alternativas consideradas

1. **App web no navegador** — sem instalador, mas sem cofre de credenciais do SO e com offline mais limitado; contraria RES06.
2. **Um app nativo por sistema operacional** — melhor integração, mas três bases de código para duas pessoas.
3. **App desktop multiplataforma com base única.**

## Decisão

Alternativa 3. O cliente tem:

- camada de apresentação (telas);
- controle de estado e de telas;
- cliente de comunicação com o servidor;
- cache local persistente;
- acesso ao **cofre de credenciais do sistema operacional** para guardar tokens.

## Consequências

- (+) Uma base de código para três sistemas.
- (+) Acesso a recursos do sistema (cofre de credenciais, biometria — RF04, notificações — RF34/RF35).
- (−) Instalador e atualização da aplicação precisam ser distribuídos (diferente de um site).
- (−) Recursos do SO não se comportam igual nos três sistemas: a biometria nativa só está disponível de forma simples no macOS, e o cofre de credenciais no Linux depende de um serviço instalado (ver [Decisões Técnicas](../decisoes_tecnicas.md)).
