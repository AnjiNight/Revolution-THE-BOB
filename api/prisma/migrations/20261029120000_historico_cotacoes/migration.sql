-- SPEC-008: histórico diário de cotações (arquivos COTAHIST da B3) e registro das execuções de ingestão.

-- CreateEnum
CREATE TYPE "fonte_cotacao" AS ENUM ('b3_cotahist', 'brapi');

-- CreateEnum
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario');

-- CreateEnum
CREATE TYPE "situacao_execucao" AS ENUM ('sucesso', 'parcial', 'falha', 'aguardando_publicacao');

-- CreateTable
-- Fechamento de um pregão. Preços como a fonte publica, sem ajuste por proventos (OPEN-06).
CREATE TABLE "cotacao_diaria" (
    "ativo_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "abertura" DECIMAL(18,6) NOT NULL,
    "maxima" DECIMAL(18,6) NOT NULL,
    "minima" DECIMAL(18,6) NOT NULL,
    "fechamento" DECIMAL(18,6) NOT NULL,
    "preco_medio" DECIMAL(18,6) NOT NULL,
    "negocios" INTEGER NOT NULL,
    "volume" DECIMAL(20,2) NOT NULL,
    "fonte" "fonte_cotacao" NOT NULL,
    "gravado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotacao_diaria_pkey" PRIMARY KEY ("ativo_id","data"),
    -- RB11: nunca em fim de semana (o resto do calendário é conferido pelo processador).
    CONSTRAINT "cotacao_diaria_dia_util_chk" CHECK (EXTRACT(ISODOW FROM "data") < 6),
    CONSTRAINT "cotacao_diaria_precos_chk" CHECK (
        "minima" > 0 AND "preco_medio" > 0
        AND "minima" <= "abertura" AND "abertura" <= "maxima"
        AND "minima" <= "fechamento" AND "fechamento" <= "maxima"
    ),
    CONSTRAINT "cotacao_diaria_negocios_chk" CHECK ("negocios" >= 0 AND "volume" >= 0)
);

-- CreateTable
-- Ano do arquivo da B3 já lido para um ativo (mesmo sem nenhuma cotação dele): não é lido de novo.
CREATE TABLE "carga_historico" (
    "ativo_id" UUID NOT NULL,
    "ano" SMALLINT NOT NULL,
    "carregada_em" TIMESTAMPTZ(3) NOT NULL,
    "registros" INTEGER NOT NULL,

    CONSTRAINT "carga_historico_pkey" PRIMARY KEY ("ativo_id","ano"),
    CONSTRAINT "carga_historico_registros_chk" CHECK ("registros" >= 0)
);

-- CreateTable
CREATE TABLE "execucao_tarefa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tarefa" "tarefa_ingestao" NOT NULL,
    "iniciada_em" TIMESTAMPTZ(3) NOT NULL,
    "terminada_em" TIMESTAMPTZ(3),
    "situacao" "situacao_execucao",
    "registros" INTEGER NOT NULL DEFAULT 0,
    "ativos_afetados" INTEGER NOT NULL DEFAULT 0,
    "periodo_inicio" DATE,
    "periodo_fim" DATE,

    CONSTRAINT "execucao_tarefa_pkey" PRIMARY KEY ("id"),
    -- Sem "terminada_em", a execução está em andamento e ainda não tem situação.
    CONSTRAINT "execucao_tarefa_situacao_chk" CHECK (("terminada_em" IS NULL) = ("situacao" IS NULL))
);

-- CreateTable
CREATE TABLE "erro_execucao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execucao_id" UUID NOT NULL,
    "ativo_id" UUID,
    "data" DATE,
    "mensagem" VARCHAR(500) NOT NULL,

    CONSTRAINT "erro_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execucao_tarefa_tarefa_iniciada_em_idx" ON "execucao_tarefa"("tarefa", "iniciada_em");

-- CreateIndex
CREATE INDEX "erro_execucao_execucao_id_idx" ON "erro_execucao"("execucao_id");

-- AddForeignKey
-- Ativo nunca é apagado (SPEC-006): as cotações não podem ficar sem ele.
ALTER TABLE "cotacao_diaria" ADD CONSTRAINT "cotacao_diaria_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_historico" ADD CONSTRAINT "carga_historico_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erro_execucao" ADD CONSTRAINT "erro_execucao_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "execucao_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
