-- SPEC-014: compras e vendas na carteira ao vivo (livro-razão da carteira, DA09).

-- CreateEnum
CREATE TYPE "tipo_transacao" AS ENUM ('compra', 'venda');

-- CreateTable
-- A posição e o preço médio nunca são guardados: são a conta das negociações (RB09, RB10).
-- Quantidade inteira de 1 a 1.000.000 (RB27); o total é quantidade × preço; o dia é o do registro
-- e o da cotação usada, no horário de Brasília (RB07), e nunca cai no fim de semana (RB11).
CREATE TABLE "transacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carteira_id" UUID NOT NULL,
    "ativo_id" UUID NOT NULL,
    "tipo" "tipo_transacao" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(15,2) NOT NULL,
    "valor_total" DECIMAL(15,2) NOT NULL,
    "data" DATE NOT NULL,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL,
    "cotacao_em" TIMESTAMPTZ(3) NOT NULL,
    "nivel_cotacao" "nivel_cotacao" NOT NULL,
    "fonte_cotacao" "fonte_cotacao" NOT NULL,

    CONSTRAINT "transacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transacao_quantidade_chk" CHECK ("quantidade" BETWEEN 1 AND 1000000),
    CONSTRAINT "transacao_preco_chk" CHECK ("preco_unitario" > 0),
    CONSTRAINT "transacao_total_chk" CHECK ("valor_total" = "quantidade" * "preco_unitario"),
    CONSTRAINT "transacao_data_chk" CHECK (
        "data" = ("registrado_em" AT TIME ZONE 'America/Sao_Paulo')::date
        AND "data" = ("cotacao_em" AT TIME ZONE 'America/Sao_Paulo')::date
        AND EXTRACT(ISODOW FROM "data") < 6
    )
);

CREATE INDEX "transacao_carteira_id_data_registrado_em_idx"
    ON "transacao"("carteira_id", "data", "registrado_em");
CREATE INDEX "transacao_ativo_id_idx" ON "transacao"("ativo_id");

-- Apagar a carteira (SPEC-012) ou a conta (SPEC-034) leva as negociações junto; o ativo não é
-- apagado enquanto alguém tiver negociado com ele.
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_carteira_id_fkey"
    FOREIGN KEY ("carteira_id") REFERENCES "carteira"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_ativo_id_fkey"
    FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RB08: negociação registrada não muda; a correção é por estorno (SPEC-015).
CREATE FUNCTION "transacao_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'negociação não pode ser alterada (RB08)'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'transacao_imutavel';
END;
$$;

CREATE TRIGGER "transacao_imutavel" BEFORE UPDATE ON "transacao"
    FOR EACH ROW EXECUTE FUNCTION "transacao_imutavel"();
