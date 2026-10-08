# DA13 — Dados pessoais concentrados

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 24/09/2026 |
| Drivers | FAS09, QA07, PA06, RES05, RF06, RB04 |
| Relacionadas | [DA05](DA05-autenticacao-propria.md), [DA08](DA08-cache-dois-niveis-offline-leitura.md) |

## Contexto

LGPD (RES05), exportação e exclusão de dados (RF06, RB04).

## Alternativas consideradas

1. **Dados pessoais copiados em vários módulos** (nome e e-mail em carteiras, logs, notificações) — consultas mais simples, mas exportar e excluir exige varrer o sistema inteiro.
2. **Dados pessoais concentrados no módulo de Identidade**, com os demais módulos usando apenas um identificador.
3. **Criptografia por usuário com descarte da chave** na exclusão — elegante, mas complexa demais para o prazo.

## Decisão

Alternativa 2. Dados pessoais (nome, e-mail, consentimentos) ficam **apenas** no módulo de Identidade e Conta. Os demais módulos referenciam o usuário só por um identificador. A exclusão:

1. remove carteiras e lançamentos do usuário;
2. remove dados pessoais do módulo de identidade;
3. **anonimiza** registros de auditoria e logs que precisam ser mantidos;
4. instrui o cliente a limpar o cache local.

## Consequências

- (+) Exportar e excluir dados é uma operação bem delimitada.
- (−) Fontes de notícias cadastradas pelo usuário ([DA19](DA19-fontes-de-noticias.md)) e suas preferências também são dados dele e entram na exportação e na exclusão.
- (−) Cópias de backup (RNF02) continuam contendo os dados até expirarem; o prazo de retenção do backup precisa ser compatível com RB04.
