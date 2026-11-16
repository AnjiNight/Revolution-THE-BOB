-- Reversão da SPEC-020: os índices saem inteiros (dado público, recarregado pelo processador).
DROP TABLE IF EXISTS "carga_indice";
DROP TABLE IF EXISTS "fechamento_indice";
DROP TABLE IF EXISTS "indice_bolsa";
DROP TYPE IF EXISTS "fonte_indice";

-- O PostgreSQL não remove valor de enum: recria o tipo sem o valor desta Spec.
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'indices_b3';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3', 'cdi_diario', 'investidor10', 'eventos_b3');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";
