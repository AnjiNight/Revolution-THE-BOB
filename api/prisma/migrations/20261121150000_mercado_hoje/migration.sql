-- SPEC-048: o Ibovespa e o dólar do dia pela Yahoo Finance, para o painel "Mercado hoje".
ALTER TYPE "tarefa_ingestao" ADD VALUE 'mercado_yahoo';

CREATE TYPE "simbolo_mercado" AS ENUM ('ibovespa', 'dolar');

-- Uma linha por leitura (o horário é o que a Yahoo informou); guardadas por 30 dias.
CREATE TABLE "cotacao_mercado" (
    "simbolo" "simbolo_mercado" NOT NULL,
    "momento" TIMESTAMPTZ(3) NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "fechamento_anterior" DECIMAL(18,6),
    "coletada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotacao_mercado_pkey" PRIMARY KEY ("simbolo", "momento"),
    CONSTRAINT "cotacao_mercado_valor_chk" CHECK ("valor" > 0 AND ("fechamento_anterior" IS NULL OR "fechamento_anterior" > 0))
);

CREATE INDEX "cotacao_mercado_coletada_em_idx" ON "cotacao_mercado"("coletada_em");
