-- Reversão da SPEC-047: as repetidas voltam a ser notícias (o vínculo e o sentimento refazem).
ALTER TABLE "noticia" DROP CONSTRAINT IF EXISTS "noticia_repetida_de_id_fkey";
DROP TRIGGER IF EXISTS "noticia_solta_repetida_trg" ON "noticia";
DROP FUNCTION IF EXISTS "noticia_solta_repetida"();
DROP INDEX IF EXISTS "noticia_repeticao_conferida_idx";
DROP INDEX IF EXISTS "noticia_repetida_de_idx";
ALTER TABLE "noticia" DROP CONSTRAINT IF EXISTS "noticia_repetida_chk";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "repeticao_conferida_em";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "repetida_por";
ALTER TABLE "noticia" DROP COLUMN IF EXISTS "repetida_de_id";
DROP TYPE IF EXISTS "motivo_repeticao";
