-- Reversão da SPEC-013: os aportes e retiradas saem.
DROP TRIGGER IF EXISTS "lancamento_caixa_imutavel" ON "lancamento_caixa";
DROP FUNCTION IF EXISTS "lancamento_caixa_imutavel"();
DROP TABLE IF EXISTS "lancamento_caixa";
DROP TYPE IF EXISTS "tipo_lancamento_caixa";
