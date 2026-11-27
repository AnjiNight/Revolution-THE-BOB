-- SPEC-031: o cenário de hoje de cada ativo, por horizonte e versão do modelo de sentimento
-- (DA21, ponto 8), para comparar depois com o que aconteceu. Sem nenhum dado de quem abriu a ficha.

-- CreateTable
CREATE TABLE "cenario_registrado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ativo_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "faixa" "sentimento_noticia" NOT NULL,
    "horizonte" SMALLINT NOT NULL,
    "versao_modelo_id" INTEGER NOT NULL,
    "ocorrencias" INTEGER NOT NULL,
    "queda" DECIMAL(5,2),
    "estavel" DECIMAL(5,2),
    "alta" DECIMAL(5,2),
    "base_ocorrencias" INTEGER NOT NULL,
    "base_queda" DECIMAL(5,2),
    "base_estavel" DECIMAL(5,2),
    "base_alta" DECIMAL(5,2),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cenario_registrado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cenario_registrado_horizonte_chk" CHECK ("horizonte" IN (0, 5, 20)),
    CONSTRAINT "cenario_registrado_ocorrencias_chk" CHECK ("ocorrencias" >= 0 AND "base_ocorrencias" >= 0),
    -- RB31: abaixo do mínimo, sem as porcentagens; todas juntas, ou nenhuma.
    CONSTRAINT "cenario_registrado_partes_chk" CHECK (
        ("queda" IS NULL) = ("estavel" IS NULL) AND ("queda" IS NULL) = ("alta" IS NULL)
        AND ("base_queda" IS NULL) = ("base_estavel" IS NULL) AND ("base_queda" IS NULL) = ("base_alta" IS NULL)
    ),
    CONSTRAINT "cenario_registrado_porcentagens_chk" CHECK (
        COALESCE("queda", 0) BETWEEN 0 AND 100 AND COALESCE("estavel", 0) BETWEEN 0 AND 100
        AND COALESCE("alta", 0) BETWEEN 0 AND 100 AND COALESCE("base_queda", 0) BETWEEN 0 AND 100
        AND COALESCE("base_estavel", 0) BETWEEN 0 AND 100 AND COALESCE("base_alta", 0) BETWEEN 0 AND 100
    )
);

-- Um cenário por ativo, dia, horizonte e versão do modelo.
CREATE UNIQUE INDEX "cenario_registrado_unico" ON "cenario_registrado"("ativo_id", "dia", "horizonte", "versao_modelo_id");

ALTER TABLE "cenario_registrado" ADD CONSTRAINT "cenario_registrado_ativo_id_fkey"
    FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cenario_registrado" ADD CONSTRAINT "cenario_registrado_versao_modelo_id_fkey"
    FOREIGN KEY ("versao_modelo_id") REFERENCES "versao_modelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
