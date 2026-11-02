-- SPEC-009: cotações do pregão (brapi, nível gratuito), fechamento provisório e uso da cota.

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'cotacao_pregao';

-- AlterEnum
-- A cota do plano da brapi acabou: as coletas param até ela renovar.
ALTER TYPE "situacao_execucao" ADD VALUE 'cota_esgotada';

-- CreateEnum
CREATE TYPE "nivel_cotacao" AS ENUM ('gratuito', 'assinante');

-- AlterTable
-- Fechamento provisório da brapi: sem preço médio, negócios e volume (a B3 traz no dia seguinte).
ALTER TABLE "cotacao_diaria" ALTER COLUMN "preco_medio" DROP NOT NULL,
ALTER COLUMN "negocios" DROP NOT NULL,
ALTER COLUMN "volume" DROP NOT NULL;

-- Da B3, continuam obrigatórios.
ALTER TABLE "cotacao_diaria" ADD CONSTRAINT "cotacao_diaria_b3_completa_chk" CHECK (
    "fonte" <> 'b3_cotahist'
    OR ("preco_medio" IS NOT NULL AND "negocios" IS NOT NULL AND "volume" IS NOT NULL)
);

-- AlterTable
ALTER TABLE "execucao_tarefa" ADD COLUMN "consultas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cota_restante" INTEGER,
ADD COLUMN "cota_limite" INTEGER,
ADD COLUMN "cota_renova_em" TIMESTAMPTZ(3);

ALTER TABLE "execucao_tarefa" ADD CONSTRAINT "execucao_tarefa_consultas_chk" CHECK (
    "consultas" >= 0
    AND ("cota_restante" IS NULL OR "cota_restante" >= 0)
    AND ("cota_limite" IS NULL OR "cota_limite" >= 0)
);

-- CreateTable
CREATE TABLE "cotacao_pregao" (
    "ativo_id" UUID NOT NULL,
    "momento" TIMESTAMPTZ(3) NOT NULL,
    "nivel" "nivel_cotacao" NOT NULL,
    "preco" DECIMAL(18,6) NOT NULL,
    "abertura_dia" DECIMAL(18,6),
    "maxima_dia" DECIMAL(18,6),
    "minima_dia" DECIMAL(18,6),
    "fechamento_anterior" DECIMAL(18,6),
    "fonte" "fonte_cotacao" NOT NULL,
    "coletada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotacao_pregao_pkey" PRIMARY KEY ("ativo_id","momento","nivel"),
    -- RB11: nunca em fim de semana, no horário de Brasília (o resto do calendário é conferido
    -- pelo processador).
    CONSTRAINT "cotacao_pregao_dia_util_chk" CHECK (
        EXTRACT(ISODOW FROM ("momento" AT TIME ZONE 'America/Sao_Paulo')) < 6
    ),
    CONSTRAINT "cotacao_pregao_precos_chk" CHECK (
        "preco" > 0
        AND ("minima_dia" IS NULL OR ("minima_dia" > 0 AND "minima_dia" <= "preco"))
        AND ("maxima_dia" IS NULL OR "preco" <= "maxima_dia")
        AND ("abertura_dia" IS NULL OR "abertura_dia" > 0)
        AND ("fechamento_anterior" IS NULL OR "fechamento_anterior" > 0)
    )
);

-- CreateIndex
-- Limpeza diária das cotações com mais de 30 dias.
CREATE INDEX "cotacao_pregao_momento_idx" ON "cotacao_pregao"("momento");

-- AddForeignKey
-- Ativo nunca é apagado (SPEC-006): as cotações não podem ficar sem ele.
ALTER TABLE "cotacao_pregao" ADD CONSTRAINT "cotacao_pregao_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
