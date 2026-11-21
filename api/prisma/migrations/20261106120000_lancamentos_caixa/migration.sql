-- SPEC-013: aportes e retiradas (livro-razão do caixa, DA09).

-- CreateEnum
CREATE TYPE "tipo_lancamento_caixa" AS ENUM ('aporte', 'retirada');

-- CreateTable
-- O saldo nunca é guardado: é a conta dos lançamentos (RB09). Valor de R$ 0,01 a
-- R$ 10.000.000,00 (SPEC-013 §4.1); o dia nunca depois do registro, no horário de Brasília.
CREATE TABLE "lancamento_caixa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carteira_id" UUID NOT NULL,
    "tipo" "tipo_lancamento_caixa" NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "data" DATE NOT NULL,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lancamento_caixa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lancamento_caixa_valor_chk" CHECK ("valor" > 0 AND "valor" <= 10000000.00),
    CONSTRAINT "lancamento_caixa_data_chk" CHECK (
        "data" >= DATE '2016-01-04'
        AND "data" <= ("registrado_em" AT TIME ZONE 'America/Sao_Paulo')::date
    )
);

CREATE INDEX "lancamento_caixa_carteira_id_data_registrado_em_idx"
    ON "lancamento_caixa"("carteira_id", "data", "registrado_em");

-- Apagar a carteira (SPEC-012) ou a conta (SPEC-034) leva os lançamentos junto.
ALTER TABLE "lancamento_caixa" ADD CONSTRAINT "lancamento_caixa_carteira_id_fkey"
    FOREIGN KEY ("carteira_id") REFERENCES "carteira"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RB08: lançamento registrado não muda; a correção é por estorno (SPEC-015).
CREATE FUNCTION "lancamento_caixa_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'lançamento de caixa não pode ser alterado (RB08)'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'lancamento_caixa_imutavel';
END;
$$;

CREATE TRIGGER "lancamento_caixa_imutavel" BEFORE UPDATE ON "lancamento_caixa"
    FOR EACH ROW EXECUTE FUNCTION "lancamento_caixa_imutavel"();
