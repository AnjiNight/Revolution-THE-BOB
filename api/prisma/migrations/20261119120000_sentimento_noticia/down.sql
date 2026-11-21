-- Reversão da SPEC-044: a classificação e os rótulos saem inteiros (os rótulos são da equipe:
-- exporte antes, se quiser guardá-los).
DROP TABLE IF EXISTS "rotulo_noticia";
ALTER TABLE "noticia" DROP CONSTRAINT IF EXISTS "noticia_versao_modelo_id_fkey";
DROP INDEX IF EXISTS "noticia_versao_modelo_idx";
ALTER TABLE "noticia" DROP CONSTRAINT IF EXISTS "noticia_sentimento_chk";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "versao_modelo_id";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "classificada_em";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "sentimento_pontuacao";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "sentimento";
DROP TABLE IF EXISTS "versao_modelo";
DROP TYPE IF EXISTS "situacao_versao_modelo";
DROP TYPE IF EXISTS "sentimento_noticia";
