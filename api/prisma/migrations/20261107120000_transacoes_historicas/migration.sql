-- SPEC-016: compra e venda na carteira histórica, com o fechamento da B3 do dia escolhido.

-- A negociação da histórica não tem horário nem nível de cotação.
ALTER TABLE "transacao" ALTER COLUMN "cotacao_em" DROP NOT NULL;
ALTER TABLE "transacao" ALTER COLUMN "nivel_cotacao" DROP NOT NULL;

-- O dia passa a ter duas regras: ao vivo (SPEC-014), o dia do registro e o da cotação em Brasília;
-- histórica (SPEC-016), um dia antes do registro, desde 04/01/2016, com o fechamento da B3. Nunca
-- no fim de semana (RB11).
ALTER TABLE "transacao" DROP CONSTRAINT "transacao_data_chk";
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_data_chk" CHECK (
    EXTRACT(ISODOW FROM "data") < 6
    AND (
        (
            "cotacao_em" IS NOT NULL
            AND "nivel_cotacao" IS NOT NULL
            AND "data" = ("registrado_em" AT TIME ZONE 'America/Sao_Paulo')::date
            AND "data" = ("cotacao_em" AT TIME ZONE 'America/Sao_Paulo')::date
        )
        OR (
            "cotacao_em" IS NULL
            AND "nivel_cotacao" IS NULL
            AND "fonte_cotacao" = 'b3_cotahist'
            AND "data" >= DATE '2016-01-04'
            AND "data" < ("registrado_em" AT TIME ZONE 'America/Sao_Paulo')::date
        )
    )
);
