-- Reversão da SPEC-007: a série do CDI sai inteira (é dado público, recarregado pelo processador).
DROP TABLE IF EXISTS "carga_indexador";
DROP TABLE IF EXISTS "taxa_diaria";
DROP TABLE IF EXISTS "indexador";
DROP TYPE IF EXISTS "fonte_taxa";
DROP TYPE IF EXISTS "unidade_indexador";

-- O PostgreSQL não remove valor de enum: recria o tipo sem o valor desta Spec.
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'cdi_diario';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";
