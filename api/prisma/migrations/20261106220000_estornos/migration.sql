-- SPEC-015: estorno de lançamento (RB28, DA09).

-- CreateTable
-- O estorno anula um aporte, retirada, compra ou venda: as contas passam a ignorar o original, que
-- continua guardado. Exatamente um dos dois lançamentos; cada um aceita um estorno só.
CREATE TABLE "estorno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carteira_id" UUID NOT NULL,
    "lancamento_caixa_id" UUID,
    "transacao_id" UUID,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "estorno_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "estorno_um_lancamento_chk" CHECK (num_nonnulls("lancamento_caixa_id", "transacao_id") = 1)
);

CREATE UNIQUE INDEX "estorno_lancamento_caixa_id_key" ON "estorno"("lancamento_caixa_id");
CREATE UNIQUE INDEX "estorno_transacao_id_key" ON "estorno"("transacao_id");
CREATE INDEX "estorno_carteira_id_idx" ON "estorno"("carteira_id");

-- Apagar a carteira (SPEC-012) ou a conta (SPEC-034) leva os estornos junto; os lançamentos só
-- são apagados com a carteira.
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_carteira_id_fkey"
    FOREIGN KEY ("carteira_id") REFERENCES "carteira"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_lancamento_caixa_id_fkey"
    FOREIGN KEY ("lancamento_caixa_id") REFERENCES "lancamento_caixa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_transacao_id_fkey"
    FOREIGN KEY ("transacao_id") REFERENCES "transacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O lançamento estornado é da mesma carteira do estorno.
CREATE FUNCTION "estorno_mesma_carteira"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    dona UUID;
BEGIN
    IF NEW."lancamento_caixa_id" IS NOT NULL THEN
        SELECT "carteira_id" INTO dona FROM "lancamento_caixa" WHERE "id" = NEW."lancamento_caixa_id";
    ELSE
        SELECT "carteira_id" INTO dona FROM "transacao" WHERE "id" = NEW."transacao_id";
    END IF;
    IF dona IS DISTINCT FROM NEW."carteira_id" THEN
        RAISE EXCEPTION 'o lançamento estornado não é desta carteira (RB28)'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'estorno_mesma_carteira';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "estorno_mesma_carteira" BEFORE INSERT ON "estorno"
    FOR EACH ROW EXECUTE FUNCTION "estorno_mesma_carteira"();

-- RB08: o estorno registrado não muda.
CREATE FUNCTION "estorno_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'estorno não pode ser alterado (RB08)'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'estorno_imutavel';
END;
$$;

CREATE TRIGGER "estorno_imutavel" BEFORE UPDATE ON "estorno"
    FOR EACH ROW EXECUTE FUNCTION "estorno_imutavel"();
