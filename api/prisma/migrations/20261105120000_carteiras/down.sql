-- Reversão da SPEC-012: as carteiras e o registro das exclusões saem.
DROP TABLE IF EXISTS "exclusao_carteira";
DROP TRIGGER IF EXISTS "carteira_tipo_imutavel" ON "carteira";
DROP FUNCTION IF EXISTS "carteira_tipo_imutavel"();
DROP TABLE IF EXISTS "carteira";
DROP TYPE IF EXISTS "tipo_carteira";
