# Simulador de Investimentos — notas para o Claude

Projeto acadêmico (Mackenzie) de Luís Gustavo e Nicoly, feito com Spec-Driven Development: o mapa
de specs está em `specs/mapa_specs.md`, e cada spec só é implementada depois de aprovada. Converse
em português. Para rodar o projeto, siga a seção "Como rodar" do `README.md`.

## Antes de rodar: chaves que cada pessoa gera para si

- **Token da brapi** (cotações do pregão, [SPEC-009](specs/SPEC-009.md)): **cada pessoa da equipe
  gera o próprio token**, na conta gratuita em <https://brapi.dev>, e coloca em `BRAPI_TOKEN` no
  `api/.env`. A cota de 15 mil consultas por mês é **por chave**: dois computadores com o mesmo token
  gastam a mesma cota. Se o `api/.env` de quem está trabalhando não tiver `BRAPI_TOKEN`, lembre a
  pessoa de gerar o dela antes de rodar o processador (`npm run dev:worker`) — nunca reaproveite o
  token de outra pessoa.
- **Login com Google** (opcional): ver o README.

## Segredos

- `api/.env` e `app/.env` ficam fora do Git. Nunca commite tokens, senhas ou client secrets, nem os
  repita em mensagens de commit, PRs ou issues.
- Credenciais da equipe passam por mensagem privada, nunca pelo GitHub.

## Banco nos testes

- Os testes com banco usam o `simulador_test` (`TEST_DATABASE_URL`), nunca o banco de
  desenvolvimento `simulador`.
