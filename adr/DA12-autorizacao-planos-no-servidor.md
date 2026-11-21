# DA12 — Autorização e planos garantidos no servidor

| Campo | Valor |
|---|---|
| Status | Aceita — o perfil "administrador" passou a se chamar **colaborador** (SPEC-002, 08/10/2026) |
| Data | 24/09/2026 |
| Drivers | FAS08, QA05, PA02, RB03, RF33, OBJ06 |
| Relacionadas | [DA16](DA16-cotacoes-por-plano.md) |

## Contexto

RB03 (usuário só acessa as próprias carteiras), RF33 (bloqueio de recursos premium) e perfis distintos (visitante, usuário, assinante, colaborador).

## Alternativas consideradas

1. **Controle apenas na interface** (esconder botões) — trivial de burlar com um cliente alterado.
2. **Controle no servidor**, com a interface apenas refletindo o que o servidor permite.

## Decisão

Alternativa 2.

- **Controle de acesso por perfil**: visitante, usuário, assinante e colaborador. A área do colaborador fica no mesmo cliente, com login próprio, visível apenas ao perfil colaborador.
- **Verificação de propriedade** em toda operação sobre carteira: o servidor confere se a carteira pertence ao usuário do token, independentemente do que o cliente enviou.
- **Verificação de plano** no servidor para recursos premium; o cliente apenas esconde os botões, por conveniência. Isso inclui a **frequência das cotações** entregues ao usuário ([DA16](DA16-cotacoes-por-plano.md)).

## Consequências

- (+) Um cliente alterado não consegue burlar regras (PA02).
