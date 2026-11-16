-- Reversão da SPEC-023. As carteiras copiadas continuam (são carteiras comuns); sai só a ligação
-- com a original.
ALTER TABLE "carteira" DROP COLUMN IF EXISTS "origem_id";
