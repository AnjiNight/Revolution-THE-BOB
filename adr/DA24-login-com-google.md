# DA24 — Login com Google no app desktop

| Campo | Valor |
|---|---|
| Status | Aceita, com pontos em aberto |
| Data | 08/10/2026 |
| Drivers | FAS07, QA06, QA13, RES03, RES05 |
| Complementa | [DA05](DA05-autenticacao-propria.md) (que previa o login com Google como evolução) |
| Relacionadas | [DA12](DA12-autorizacao-planos-no-servidor.md), [DA13](DA13-dados-pessoais-concentrados.md) |

## Contexto

A equipe decidiu oferecer **"Entrar com Google"** além do cadastro com e-mail e senha. O público inicial é iniciante (P01), e entrar com uma conta que a pessoa já tem reduz o atrito. A DA05 já deixava o módulo de identidade preparado para um provedor externo.

O app é **desktop** (Electron). Para apps instalados, o Google recomenda OAuth 2.0 com **PKCE**, abrindo o navegador do sistema e recebendo a resposta num **endereço local temporário** (`127.0.0.1`). Janelas de login embutidas no app são bloqueadas pelo Google.

## Alternativas consideradas

1. **Janela do Google dentro do app** (webview) — bloqueada pelo Google e insegura, porque o app veria a senha digitada.
2. **Navegador do sistema + PKCE + endereço local**, com o servidor verificando o ID token.
3. **Serviço de autenticação de terceiros** (Auth0, Firebase Auth) — mais rápido de ligar, mas cria dependência e pode ter custo (RES03).

## Decisão

Alternativa 2.

1. O app abre o navegador na página do Google, com `code_challenge` (PKCE, S256) e um `state` aleatório.
2. O Google devolve um código para `http://127.0.0.1:<porta>/callback`. O app só aceita a resposta se o `state` for o mesmo que enviou.
3. O app troca o código pelo **ID token** no Google, usando o verificador PKCE.
4. O app envia o ID token para `POST /api/auth/google`. **O servidor verifica** a assinatura (chaves públicas do Google), o emissor, a validade e se o token foi emitido para o **nosso** app (`aud` = client ID).
5. O servidor só aceita **e-mail verificado** pelo Google. Então:
   - se o Google já estiver ligado a uma conta, entra nela;
   - se existir conta de **usuário** com o mesmo e-mail, liga o Google a ela (a senha continua valendo);
   - se não existir conta, pede o **aceite dos termos** (RNF11) e então cria a conta, sem senha.
6. **Colaborador não entra pelo Google**: só com e-mail e senha, pela Área do colaborador (SPEC-002). Isso vale também no banco, por restrição `CHECK`.
7. A sessão criada é a mesma da DA05 (token de acesso + token de renovação).

Sem o client ID configurado, o botão não aparece no app e a rota responde `google_login_unavailable`.

## Consequências

- (+) Cadastro em poucos cliques; a equipe não guarda senha de quem usa só o Google.
- (+) O app nunca vê a senha do Google; o servidor confia só no que verifica sozinho.
- (−) A equipe precisa criar um projeto no Google Cloud e um client ID do tipo **"Aplicativo para computador"** (gratuito). Até o app ser verificado pelo Google, só e-mails cadastrados como testadores conseguem entrar.
- (−) O "client secret" de apps desktop vai junto com o app; o próprio Google não o trata como segredo, e por isso a segurança vem do PKCE.
- (−) Ligar contas pelo e-mail confia na verificação de e-mail do Google; por isso e-mail não verificado é recusado.

## Pontos em aberto

1. Criar o projeto no Google Cloud e definir quem é o dono das credenciais.
2. Tela de consentimento do Google: nome do app, logo e lista de testadores.
3. Exclusão de conta (SPEC-034): desligar o Google e apagar os dados.

## Impacto nos outros documentos

- **Requisitos:** novo RF41 (entrar com Google).
- **Modelo de domínio:** `google_sub` em USUARIO; `senha_hash` passa a ser opcional.
- **Arquitetura:** Google como sistema externo no diagrama de contexto.
