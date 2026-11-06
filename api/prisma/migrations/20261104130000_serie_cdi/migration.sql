-- SPEC-007: série diária do CDI pela API SGS do Banco Central.

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'cdi_diario';

-- CreateEnum
CREATE TYPE "unidade_indexador" AS ENUM ('percentual_ao_dia');

-- CreateEnum
CREATE TYPE "fonte_taxa" AS ENUM ('bcb_sgs');

-- CreateTable
-- Índice de referência. No escopo atual, só o CDI (benchmark, DA22); Selic e IPCA entram com a
-- renda fixa.
CREATE TABLE "indexador" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sigla" VARCHAR(10) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "serie_sgs" INTEGER NOT NULL,
    "unidade" "unidade_indexador" NOT NULL,

    CONSTRAINT "indexador_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "indexador_serie_sgs_chk" CHECK ("serie_sgs" > 0)
);

CREATE UNIQUE INDEX "indexador_sigla_key" ON "indexador"("sigla");

INSERT INTO "indexador" ("sigla", "nome", "serie_sgs", "unidade")
VALUES ('CDI', 'Taxa de juros - CDI', 12, 'percentual_ao_dia');

-- CreateTable
-- Taxa do dia como o Banco Central publica (% ao dia, 6 casas). Os dias são os úteis bancários,
-- que não são os do calendário de pregão (24/12 e 31/12 têm CDI): só o fim de semana é recusado.
CREATE TABLE "taxa_diaria" (
    "indexador_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(10,6) NOT NULL,
    "fonte" "fonte_taxa" NOT NULL,
    "gravado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "taxa_diaria_pkey" PRIMARY KEY ("indexador_id", "data"),
    CONSTRAINT "taxa_diaria_valor_chk" CHECK ("valor" >= 0 AND "valor" < 1),
    CONSTRAINT "taxa_diaria_dia_util_chk" CHECK (EXTRACT(ISODOW FROM "data") < 6)
);

ALTER TABLE "taxa_diaria" ADD CONSTRAINT "taxa_diaria_indexador_id_fkey"
    FOREIGN KEY ("indexador_id") REFERENCES "indexador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
-- Anos fechados já carregados: não são consultados de novo.
CREATE TABLE "carga_indexador" (
    "indexador_id" UUID NOT NULL,
    "ano" SMALLINT NOT NULL,
    "carregada_em" TIMESTAMPTZ(3) NOT NULL,
    "registros" INTEGER NOT NULL,

    CONSTRAINT "carga_indexador_pkey" PRIMARY KEY ("indexador_id", "ano"),
    CONSTRAINT "carga_indexador_registros_chk" CHECK ("registros" >= 0)
);

ALTER TABLE "carga_indexador" ADD CONSTRAINT "carga_indexador_indexador_id_fkey"
    FOREIGN KEY ("indexador_id") REFERENCES "indexador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
