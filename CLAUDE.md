# Simulador de Investimentos — notas para o Claude

Projeto acadêmico (Mackenzie) de Luís Gustavo e Nicoly, feito com Spec-Driven Development: o mapa
de specs está em `specs/mapa_specs.md`, e cada spec só é implementada depois de aprovada. Converse
em português. Para rodar o projeto, siga a seção "Como rodar" do `README.md`.

## Antes de rodar: chaves que cada pessoa gera para si

- **Token da brapi** ([SPEC-009](specs/SPEC-009.md) e [SPEC-040](specs/SPEC-040.md)): desde a
  SPEC-040 ele é **opcional** (a lista da brapi responde sem token e não desconta da cota). Quem
  quiser usar um **gera o próprio**, na conta gratuita em <https://brapi.dev>, e coloca em
  `BRAPI_TOKEN` no `api/.env`. A cota de 15 mil consultas por mês é **por chave**: dois
  computadores com o mesmo token gastam a mesma cota — nunca reaproveite o token de outra pessoa.
- **Processador** (`npm run dev:worker`): na primeira vez, baixa os arquivos anuais da B3 (uns
  600 a 900 MB no total) para o histórico e a importação do catálogo. Combine antes de ligar.
- **Login com Google** (opcional): ver o README.

## Segredos

- `api/.env` e `app/.env` ficam fora do Git. Nunca commite tokens, senhas ou client secrets, nem os
  repita em mensagens de commit, PRs ou issues.
- Credenciais da equipe passam por mensagem privada, nunca pelo GitHub.

## Banco nos testes

- Os testes com banco usam o `simulador_test` (`TEST_DATABASE_URL`), nunca o banco de
  desenvolvimento `simulador`.
