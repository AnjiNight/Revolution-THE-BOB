-- SPEC-028: vínculo notícia–ativo, com a relevância (principal, citado ou lista) e de onde veio.

-- CreateEnum
CREATE TYPE "relevancia_noticia" AS ENUM ('principal', 'citado', 'lista');
CREATE TYPE "origem_vinculo_noticia" AS ENUM ('ticker_titulo', 'ticker_texto', 'empresa_marcada');

-- AlterTable
-- Quando e com qual versão da regra a notícia foi vinculada; vazio até o primeiro vínculo.
ALTER TABLE "noticia" ADD COLUMN "vinculada_em" TIMESTAMPTZ(3);
ALTER TABLE "noticia" ADD COLUMN "versao_vinculo" SMALLINT;
ALTER TABLE "noticia" ADD CONSTRAINT "noticia_vinculo_chk" CHECK (
    ("vinculada_em" IS NULL) = ("versao_vinculo" IS NULL)
);

CREATE INDEX "noticia_vinculo_idx" ON "noticia"("versao_vinculo");

-- CreateTable
CREATE TABLE "noticia_ativo" (
    "noticia_id" UUID NOT NULL,
    "ativo_id" UUID NOT NULL,
    "relevancia" "relevancia_noticia" NOT NULL,
    "origem" "origem_vinculo_noticia" NOT NULL,

    CONSTRAINT "noticia_ativo_pkey" PRIMARY KEY ("noticia_id", "ativo_id")
);

-- Para a ficha do ativo (SPEC-029): as notícias de um ativo, pela relevância.
CREATE INDEX "noticia_ativo_ativo_idx" ON "noticia_ativo"("ativo_id", "relevancia");

ALTER TABLE "noticia_ativo" ADD CONSTRAINT "noticia_ativo_noticia_id_fkey"
    FOREIGN KEY ("noticia_id") REFERENCES "noticia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "noticia_ativo" ADD CONSTRAINT "noticia_ativo_ativo_id_fkey"
    FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
