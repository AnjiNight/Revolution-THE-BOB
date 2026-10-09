# DA05 — Autenticação própria, com login via provedor externo como evolução

| Campo | Valor |
|---|---|
| Status | Aceita — **login com Google implementado por [DA24](DA24-login-com-google.md)** (08/10/2026) |
| Data | 24/09/2026 |
| Drivers | FAS07, QA05, QA06, RF01–RF04, RNF07–RNF10 |
| Relacionadas | [DA03](DA03-cliente-desktop-multiplataforma.md), [DA13](DA13-dados-pessoais-concentrados.md) |

## Contexto

RF01 pede cadastro com e-mail e senha; RF03 pede recuperação de senha; RF04 pede desbloqueio por biometria. O público inicial é iniciante (P01), para quem "entrar com Google" reduz atrito. A aplicação é desktop, o que torna o fluxo de login com provedor externo mais trabalhoso (precisa abrir o navegador e receber o retorno no app).

## Alternativas consideradas

1. **Somente login via Google ou Microsoft** — sem senhas para guardar, mas cria dependência de terceiros, exige conta nesses provedores e não atende RF01/RF03 como escritos.
2. **Autenticação própria** com e-mail e senha.
3. **Ambas.**

## Decisão

Alternativa 2 no MVP, com o módulo de identidade preparado para a alternativa 3:

- Senhas guardadas apenas como hash com algoritmo lento e sal (RNF07).
- Sessão por **token de acesso de curta duração** + **token de renovação** (RF02).
- Tokens guardados no cofre do sistema operacional, nunca em arquivo comum (RNF08).
- Limite de tentativas nas rotas de autenticação (RNF10).
- Biometria (RF04) apenas **desbloqueia** o token já guardado no dispositivo; não substitui o login.
- O módulo de identidade trata "provedor de identidade" como uma interface: adicionar login com Google depois não altera os demais módulos, que só conhecem o identificador do usuário.

## Consequências

- (+) Atende os requisitos sem depender de terceiros e sem contas externas obrigatórias.
- (−) A equipe passa a ser responsável por guardar senhas com segurança e pela recuperação de senha, que depende de um serviço de envio de e-mail.
