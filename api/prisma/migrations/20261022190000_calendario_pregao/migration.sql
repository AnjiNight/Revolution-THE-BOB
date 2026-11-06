-- SPEC-005: calendário de pregão publicado pelo colaborador (módulo Dados de Mercado).

-- CreateTable
-- "publicado_por" é o id do colaborador, sem chave estrangeira (DA13: nenhum vínculo com a identidade).
CREATE TABLE "ano_calendario" (
    "ano" SMALLINT NOT NULL,
    "publicado_em" TIMESTAMPTZ(3) NOT NULL,
    "publicado_por" UUID NOT NULL,

    CONSTRAINT "ano_calendario_pkey" PRIMARY KEY ("ano"),
    CONSTRAINT "ano_calendario_ano_chk" CHECK ("ano" BETWEEN 2000 AND 2100)
);

-- CreateTable
-- Só dias úteis: fim de semana nunca tem pregão e não é guardado.
CREATE TABLE "dia_sem_pregao" (
    "data" DATE NOT NULL,
    "ano" SMALLINT NOT NULL,
    "motivo" VARCHAR(100) NOT NULL,

    CONSTRAINT "dia_sem_pregao_pkey" PRIMARY KEY ("data"),
    CONSTRAINT "dia_sem_pregao_ano_chk" CHECK (EXTRACT(YEAR FROM "data") = "ano"),
    CONSTRAINT "dia_sem_pregao_dia_util_chk" CHECK (EXTRACT(ISODOW FROM "data") < 6),
    CONSTRAINT "dia_sem_pregao_motivo_chk" CHECK (char_length(btrim("motivo")) BETWEEN 1 AND 100)
);

-- CreateIndex
CREATE INDEX "dia_sem_pregao_ano_idx" ON "dia_sem_pregao"("ano");

-- AddForeignKey
ALTER TABLE "dia_sem_pregao" ADD CONSTRAINT "dia_sem_pregao_ano_fkey" FOREIGN KEY ("ano") REFERENCES "ano_calendario"("ano") ON DELETE CASCADE ON UPDATE CASCADE;
