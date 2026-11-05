-- SPEC-041 (indicadores do Investidor10) e SPEC-042 (proventos do Investidor10, eventos da B3).

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'investidor10';
ALTER TYPE "tarefa_ingestao" ADD VALUE 'eventos_b3';

-- CreateEnum
CREATE TYPE "situacao_coleta" AS ENUM ('ok', 'sem_pagina', 'erro');
CREATE TYPE "tipo_provento" AS ENUM ('dividendo', 'jcp', 'rendimento', 'amortizacao');
CREATE TYPE "fonte_provento" AS ENUM ('investidor10');
CREATE TYPE "tipo_evento" AS ENUM ('desdobramento', 'grupamento', 'bonificacao');
CREATE TYPE "fonte_evento" AS ENUM ('b3');

-- CreateTable
-- Indicadores do Investidor10, usados com autorização só neste projeto acadêmico (SPEC-041 §4.1).
-- "periodo": 'atual' ou o ano do histórico. O código do indicador vem do cadastro fixo do servidor.
CREATE TABLE "indicador_ativo" (
    "ativo_id" UUID NOT NULL,
    "indicador" VARCHAR(40) NOT NULL,
    "periodo" VARCHAR(5) NOT NULL,
    "valor" DECIMAL(24,6),
    "coletado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "indicador_ativo_pkey" PRIMARY KEY ("ativo_id", "indicador", "periodo"),
    CONSTRAINT "indicador_ativo_codigo_chk" CHECK ("indicador" ~ '^[a-z0-9_]+$'),
    CONSTRAINT "indicador_ativo_periodo_chk" CHECK ("periodo" = 'atual' OR "periodo" ~ '^(19|20)[0-9]{2}$')
);

-- CreateTable
-- Informações em texto de um FII, como o Investidor10 mostra.
CREATE TABLE "informacao_fii" (
    "ativo_id" UUID NOT NULL,
    "tipo_fundo" VARCHAR(100),
    "segmento" VARCHAR(100),
    "mandato" VARCHAR(100),
    "publico_alvo" VARCHAR(100),
    "prazo" VARCHAR(100),
    "gestao" VARCHAR(100),
    "taxa_administracao" VARCHAR(200),
    "coletado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "informacao_fii_pkey" PRIMARY KEY ("ativo_id")
);

-- CreateTable
-- Última visita do processador à página de cada ativo no Investidor10.
CREATE TABLE "coleta_investidor10" (
    "ativo_id" UUID NOT NULL,
    "situacao" "situacao_coleta" NOT NULL,
    "coletado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coleta_investidor10_pkey" PRIMARY KEY ("ativo_id")
);

-- CreateTable
-- Proventos por ação ou cota (SPEC-042), valor bruto como a fonte publica.
CREATE TABLE "provento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ativo_id" UUID NOT NULL,
    "tipo" "tipo_provento" NOT NULL,
    "data_com" DATE NOT NULL,
    "data_pagamento" DATE,
    "valor" DECIMAL(20,10) NOT NULL,
    "fonte" "fonte_provento" NOT NULL,
    "coletado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provento_valor_chk" CHECK ("valor" > 0),
    CONSTRAINT "provento_pagamento_chk" CHECK ("data_pagamento" IS NULL OR "data_pagamento" >= "data_com")
);

CREATE INDEX "provento_ativo_id_data_com_idx" ON "provento"("ativo_id", "data_com");

-- CreateTable
-- Desdobramentos, grupamentos e bonificações das ações, pela B3 (SPEC-042).
CREATE TABLE "evento_corporativo" (
    "ativo_id" UUID NOT NULL,
    "tipo" "tipo_evento" NOT NULL,
    "data_com" DATE NOT NULL,
    "fator" DECIMAL(24,10) NOT NULL,
    "aprovado_em" DATE,
    "fonte" "fonte_evento" NOT NULL,
    "coletado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evento_corporativo_pkey" PRIMARY KEY ("ativo_id", "tipo", "data_com"),
    CONSTRAINT "evento_corporativo_fator_chk" CHECK ("fator" > 0)
);

-- AlterTable
-- ISIN de cada ticker, do arquivo da B3 (CODISI): liga o evento à classe certa da ação.
ALTER TABLE "negociacao_b3" ADD COLUMN "isin" VARCHAR(12);
ALTER TABLE "negociacao_b3" ADD CONSTRAINT "negociacao_b3_isin_chk" CHECK ("isin" IS NULL OR "isin" ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$');

-- AddForeignKey
ALTER TABLE "indicador_ativo" ADD CONSTRAINT "indicador_ativo_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "informacao_fii" ADD CONSTRAINT "informacao_fii_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coleta_investidor10" ADD CONSTRAINT "coleta_investidor10_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provento" ADD CONSTRAINT "provento_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evento_corporativo" ADD CONSTRAINT "evento_corporativo_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
