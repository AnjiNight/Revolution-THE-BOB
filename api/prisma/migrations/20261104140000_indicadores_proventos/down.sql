-- Reversão das SPECs 041 e 042: apaga tudo o que foi coletado do Investidor10 e da B3 (eventos).
DROP TABLE IF EXISTS "evento_corporativo";
DROP TABLE IF EXISTS "provento";
DROP TABLE IF EXISTS "coleta_investidor10";
DROP TABLE IF EXISTS "informacao_fii";
DROP TABLE IF EXISTS "indicador_ativo";
DROP TYPE IF EXISTS "fonte_evento";
DROP TYPE IF EXISTS "tipo_evento";
DROP TYPE IF EXISTS "fonte_provento";
DROP TYPE IF EXISTS "tipo_provento";
DROP TYPE IF EXISTS "situacao_coleta";

ALTER TABLE "negociacao_b3" DROP CONSTRAINT IF EXISTS "negociacao_b3_isin_chk";
ALTER TABLE "negociacao_b3" DROP COLUMN IF EXISTS "isin";

-- O PostgreSQL não remove valor de enum: recria o tipo sem os valores destas Specs.
DELETE FROM "execucao_tarefa" WHERE "tarefa" IN ('investidor10', 'eventos_b3');

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3', 'cdi_diario');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";
