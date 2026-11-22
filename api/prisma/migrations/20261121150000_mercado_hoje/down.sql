-- Reversão da SPEC-048: as leituras saem inteiras (o processador coleta de novo).
DROP TABLE IF EXISTS "cotacao_mercado";
DROP TYPE IF EXISTS "simbolo_mercado";

-- O PostgreSQL não remove valor de enum: recria o tipo sem o valor desta Spec.
DELETE FROM "pedido_execucao" WHERE "tarefa" = 'mercado_yahoo';
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'mercado_yahoo';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3', 'cdi_diario', 'investidor10', 'eventos_b3', 'indices_b3', 'noticias_novas', 'noticias_arquivo', 'noticias_feeds');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
ALTER TABLE "pedido_execucao" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";
