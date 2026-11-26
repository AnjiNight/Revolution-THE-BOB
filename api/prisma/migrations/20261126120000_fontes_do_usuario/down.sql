-- Reversão da SPEC-030: saem as preferências, os feeds próprios dos usuários e as notícias deles
-- (são dados pessoais: exporte antes, se quiser guardá-los).
DROP TRIGGER IF EXISTS "preferencia_fonte_apagar_orfa" ON "preferencia_fonte";
DROP TRIGGER IF EXISTS "preferencia_fonte_conferir" ON "preferencia_fonte";
DROP FUNCTION IF EXISTS "preferencia_fonte_apagar_orfa"();
DROP FUNCTION IF EXISTS "preferencia_fonte_conferir"();
DROP TABLE IF EXISTS "preferencia_fonte";
DROP TYPE IF EXISTS "prioridade_fonte";

DELETE FROM "noticia"
WHERE "fonte_id" IN (SELECT "id" FROM "fonte_noticia" WHERE "tipo"::text = 'usuario');
DELETE FROM "fonte_noticia" WHERE "tipo"::text = 'usuario';

DROP INDEX IF EXISTS "noticia_fonte_publicada_idx";
ALTER TABLE "fonte_noticia" DROP CONSTRAINT IF EXISTS "fonte_noticia_parada_chk";
ALTER TABLE "fonte_noticia" DROP CONSTRAINT IF EXISTS "fonte_noticia_tipo_chk";
ALTER TABLE "fonte_noticia" DROP COLUMN IF EXISTS "parada_em";

-- O PostgreSQL não remove valor de enum: recria o tipo da fonte sem `usuario`. As restrições e o
-- índice que citam o tipo saem antes e voltam depois.
ALTER TABLE "fonte_noticia" DROP CONSTRAINT IF EXISTS "fonte_noticia_pai_ativa_chk";
DROP INDEX IF EXISTS "fonte_noticia_pai_unica";
ALTER TYPE "tipo_fonte_noticia" RENAME TO "tipo_fonte_noticia_antigo";
CREATE TYPE "tipo_fonte_noticia" AS ENUM ('pai', 'curada');
ALTER TABLE "fonte_noticia" ALTER COLUMN "tipo" TYPE "tipo_fonte_noticia"
    USING "tipo"::text::"tipo_fonte_noticia";
DROP TYPE "tipo_fonte_noticia_antigo";

ALTER TABLE "fonte_noticia" ADD CONSTRAINT "fonte_noticia_curada_chk" CHECK (
    "tipo" = 'pai'
    OR ("categoria" IS NOT NULL AND "confiabilidade" BETWEEN 1 AND 5 AND "licenca_conferida_em" IS NOT NULL)
);
ALTER TABLE "fonte_noticia" ADD CONSTRAINT "fonte_noticia_pai_ativa_chk" CHECK ("tipo" = 'curada' OR "ativa");
CREATE UNIQUE INDEX "fonte_noticia_pai_unica" ON "fonte_noticia"("tipo") WHERE "tipo" = 'pai';

-- A tarefa dos feeds dos usuários: saem as execuções e os pedidos dela, e o tipo é recriado.
DELETE FROM "pedido_execucao" WHERE "tarefa"::text = 'noticias_feeds_usuario';
DELETE FROM "execucao_tarefa" WHERE "tarefa"::text = 'noticias_feeds_usuario';

DROP INDEX IF EXISTS "pedido_execucao_pendente_key";
ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3', 'cdi_diario', 'investidor10', 'eventos_b3', 'indices_b3', 'noticias_novas', 'noticias_arquivo', 'noticias_feeds');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
ALTER TABLE "pedido_execucao" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";
CREATE UNIQUE INDEX "pedido_execucao_pendente_key" ON "pedido_execucao"("tarefa") WHERE "atendido_em" IS NULL;
