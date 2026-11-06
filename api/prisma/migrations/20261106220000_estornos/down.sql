-- Reversão da SPEC-015: os estornos saem (os lançamentos voltam a contar).
DROP TRIGGER IF EXISTS "estorno_imutavel" ON "estorno";
DROP FUNCTION IF EXISTS "estorno_imutavel"();
DROP TRIGGER IF EXISTS "estorno_mesma_carteira" ON "estorno";
DROP FUNCTION IF EXISTS "estorno_mesma_carteira"();
DROP TABLE IF EXISTS "estorno";
