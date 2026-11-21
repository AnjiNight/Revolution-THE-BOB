-- Reversão da SPEC-014: as compras e vendas saem.
DROP TRIGGER IF EXISTS "transacao_imutavel" ON "transacao";
DROP FUNCTION IF EXISTS "transacao_imutavel"();
DROP TABLE IF EXISTS "transacao";
DROP TYPE IF EXISTS "tipo_transacao";
