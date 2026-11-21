-- SPEC-044: sentimento das notícias, com a versão do modelo (DA20) e a amostra rotulada pela equipe.

-- CreateEnum
CREATE TYPE "sentimento_noticia" AS ENUM ('positivo', 'neutro', 'negativo');
CREATE TYPE "situacao_versao_modelo" AS ENUM ('em_uso', 'retirada');

-- CreateTable
CREATE TABLE "versao_modelo" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(40) NOT NULL,
    "numero" INTEGER NOT NULL,
    "situacao" "situacao_versao_modelo" NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL,
    "avaliada_em" TIMESTAMPTZ(3),
    "amostra_teste" INTEGER,
    "acuracia" DECIMAL(4,3),
    "f1_macro" DECIMAL(4,3),
    "matriz" JSONB,

    CONSTRAINT "versao_modelo_pkey" PRIMARY KEY ("id"),
    -- A avaliação vem inteira ou não vem.
    CONSTRAINT "versao_modelo_avaliacao_chk" CHECK (
        ("avaliada_em" IS NULL) = ("amostra_teste" IS NULL)
        AND ("avaliada_em" IS NULL) = ("acuracia" IS NULL)
        AND ("avaliada_em" IS NULL) = ("f1_macro" IS NULL)
        AND ("avaliada_em" IS NULL) = ("matriz" IS NULL)
    ),
    CONSTRAINT "versao_modelo_notas_chk" CHECK (
        "acuracia" BETWEEN 0 AND 1 AND "f1_macro" BETWEEN 0 AND 1 AND "amostra_teste" >= 0
    )
);

CREATE UNIQUE INDEX "versao_modelo_nome_numero_key" ON "versao_modelo"("nome", "numero");
-- No máximo uma versão em uso.
CREATE UNIQUE INDEX "versao_modelo_em_uso_key" ON "versao_modelo"("situacao") WHERE "situacao" = 'em_uso';

-- AlterTable
-- O tom, a pontuação, quando e por qual versão; todos vazios enquanto a notícia está pendente.
ALTER TABLE "noticia" ADD COLUMN "sentimento" "sentimento_noticia";
ALTER TABLE "noticia" ADD COLUMN "sentimento_pontuacao" DECIMAL(4,3);
ALTER TABLE "noticia" ADD COLUMN "classificada_em" TIMESTAMPTZ(3);
ALTER TABLE "noticia" ADD COLUMN "versao_modelo_id" INTEGER;
ALTER TABLE "noticia" ADD CONSTRAINT "noticia_sentimento_chk" CHECK (
    ("sentimento" IS NULL) = ("sentimento_pontuacao" IS NULL)
    AND ("sentimento" IS NULL) = ("classificada_em" IS NULL)
    AND ("sentimento" IS NULL) = ("versao_modelo_id" IS NULL)
    AND "sentimento_pontuacao" BETWEEN -1 AND 1
);

CREATE INDEX "noticia_versao_modelo_idx" ON "noticia"("versao_modelo_id");

ALTER TABLE "noticia" ADD CONSTRAINT "noticia_versao_modelo_id_fkey"
    FOREIGN KEY ("versao_modelo_id") REFERENCES "versao_modelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "rotulo_noticia" (
    "noticia_id" UUID NOT NULL,
    "sentimento" "sentimento_noticia" NOT NULL,
    "rotulado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rotulo_noticia_pkey" PRIMARY KEY ("noticia_id")
);

ALTER TABLE "rotulo_noticia" ADD CONSTRAINT "rotulo_noticia_noticia_id_fkey"
    FOREIGN KEY ("noticia_id") REFERENCES "noticia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
