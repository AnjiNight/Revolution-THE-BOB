-- Reversão da SPEC-028: os vínculos saem inteiros (o processador vincula de novo).
DROP TABLE IF EXISTS "noticia_ativo";
DROP INDEX IF EXISTS "noticia_vinculo_idx";
ALTER TABLE "noticia" DROP CONSTRAINT IF EXISTS "noticia_vinculo_chk";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "versao_vinculo";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "vinculada_em";
DROP TYPE IF EXISTS "origem_vinculo_noticia";
DROP TYPE IF EXISTS "relevancia_noticia";
