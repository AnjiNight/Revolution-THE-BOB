-- SPEC-020: Ibovespa e IFIX pelas estatísticas históricas da B3, para a comparação com a carteira.

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'indices_b3';

-- CreateEnum
CREATE TYPE "fonte_indice" AS ENUM ('b3_estatisticas');

-- CreateTable
-- Índice da B3 usado como referência (benchmark). Fica fora de "indexador" (SPEC-007), que guarda
-- taxas do Banco Central: o índice é uma pontuação.
CREATE TABLE "indice_bolsa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sigla" VARCHAR(10) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,

    CONSTRAINT "indice_bolsa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "indice_bolsa_sigla_key" ON "indice_bolsa"("sigla");

INSERT INTO "indice_bolsa" ("sigla", "nome")
VALUES ('IBOV', 'Ibovespa'), ('IFIX', 'Índice de Fundos de Investimentos Imobiliários');

-- CreateTable
-- Fechamento do índice num pregão, como a B3 publica (pontos, 2 casas). Fim de semana é recusado.
CREATE TABLE "fechamento_indice" (
    "indice_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "fonte" "fonte_indice" NOT NULL,
    "gravado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fechamento_indice_pkey" PRIMARY KEY ("indice_id", "data"),
    CONSTRAINT "fechamento_indice_valor_chk" CHECK ("valor" > 0),
    CONSTRAINT "fechamento_indice_dia_util_chk" CHECK (EXTRACT(ISODOW FROM "data") < 6)
);

ALTER TABLE "fechamento_indice" ADD CONSTRAINT "fechamento_indice_indice_id_fkey"
    FOREIGN KEY ("indice_id") REFERENCES "indice_bolsa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
-- Anos fechados já carregados: não são pedidos de novo à B3.
CREATE TABLE "carga_indice" (
    "indice_id" UUID NOT NULL,
    "ano" SMALLINT NOT NULL,
    "carregada_em" TIMESTAMPTZ(3) NOT NULL,
    "registros" INTEGER NOT NULL,

    CONSTRAINT "carga_indice_pkey" PRIMARY KEY ("indice_id", "ano"),
    CONSTRAINT "carga_indice_registros_chk" CHECK ("registros" >= 0)
);

ALTER TABLE "carga_indice" ADD CONSTRAINT "carga_indice_indice_id_fkey"
    FOREIGN KEY ("indice_id") REFERENCES "indice_bolsa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
