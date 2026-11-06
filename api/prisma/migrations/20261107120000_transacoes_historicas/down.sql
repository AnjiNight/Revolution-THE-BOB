-- Reversão da SPEC-016: volta a só aceitar negociações da carteira ao vivo.
-- ATENÇÃO: só funciona sem negociações da histórica gravadas (o SET NOT NULL falha com elas);
-- estorne e apague essas carteiras antes, ou apague as linhas com "cotacao_em" vazio.
ALTER TABLE "transacao" DROP CONSTRAINT "transacao_data_chk";
ALTER TABLE "transacao" ALTER COLUMN "cotacao_em" SET NOT NULL;
ALTER TABLE "transacao" ALTER COLUMN "nivel_cotacao" SET NOT NULL;
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_data_chk" CHECK (
    "data" = ("registrado_em" AT TIME ZONE 'America/Sao_Paulo')::date
    AND "data" = ("cotacao_em" AT TIME ZONE 'America/Sao_Paulo')::date
    AND EXTRACT(ISODOW FROM "data") < 6
);
