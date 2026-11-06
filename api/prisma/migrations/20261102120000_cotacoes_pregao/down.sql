-- Reversão da SPEC-009: remove as cotações do pregão, o fechamento provisório e o uso da cota.
DROP TABLE IF EXISTS "cotacao_pregao";
DROP TYPE IF EXISTS "nivel_cotacao";

-- O fechamento provisório da brapi não cabe nas colunas obrigatórias: sai.
ALTER TABLE "cotacao_diaria" DROP CONSTRAINT IF EXISTS "cotacao_diaria_b3_completa_chk";
DELETE FROM "cotacao_diaria"
WHERE "preco_medio" IS NULL OR "negocios" IS NULL OR "volume" IS NULL;
ALTER TABLE "cotacao_diaria" ALTER COLUMN "preco_medio" SET NOT NULL,
ALTER COLUMN "negocios" SET NOT NULL,
ALTER COLUMN "volume" SET NOT NULL;

ALTER TABLE "execucao_tarefa" DROP CONSTRAINT IF EXISTS "execucao_tarefa_consultas_chk";
ALTER TABLE "execucao_tarefa" DROP COLUMN IF EXISTS "consultas",
DROP COLUMN IF EXISTS "cota_restante",
DROP COLUMN IF EXISTS "cota_limite",
DROP COLUMN IF EXISTS "cota_renova_em";

-- O PostgreSQL não remove valor de enum: recria os tipos sem os valores desta Spec.
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'cotacao_pregao';
UPDATE "execucao_tarefa" SET "situacao" = 'falha' WHERE "situacao" = 'cota_esgotada';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";

ALTER TABLE "execucao_tarefa" DROP CONSTRAINT IF EXISTS "execucao_tarefa_situacao_chk";
ALTER TYPE "situacao_execucao" RENAME TO "situacao_execucao_antigo";
CREATE TYPE "situacao_execucao" AS ENUM ('sucesso', 'parcial', 'falha', 'aguardando_publicacao');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "situacao" TYPE "situacao_execucao" USING "situacao"::text::"situacao_execucao";
DROP TYPE "situacao_execucao_antigo";
ALTER TABLE "execucao_tarefa" ADD CONSTRAINT "execucao_tarefa_situacao_chk" CHECK (("terminada_em" IS NULL) = ("situacao" IS NULL));
