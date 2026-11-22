-- SPEC-047: notícia repetida entre fontes (o mesmo endereço ou o título quase igual, em 48 horas).

-- CreateEnum
CREATE TYPE "motivo_repeticao" AS ENUM ('endereco', 'titulo');

-- AlterTable
-- A original e o motivo, juntos ou vazios; quando a notícia foi conferida (vazio: ainda não).
ALTER TABLE "noticia" ADD COLUMN "repetida_de_id" UUID;
ALTER TABLE "noticia" ADD COLUMN "repetida_por" "motivo_repeticao";
ALTER TABLE "noticia" ADD COLUMN "repeticao_conferida_em" TIMESTAMPTZ(3);
ALTER TABLE "noticia" ADD CONSTRAINT "noticia_repetida_chk" CHECK (
    ("repetida_de_id" IS NULL) = ("repetida_por" IS NULL)
    AND ("repetida_de_id" IS NULL OR "repetida_de_id" <> "id")
);

CREATE INDEX "noticia_repetida_de_idx" ON "noticia"("repetida_de_id");
CREATE INDEX "noticia_repeticao_conferida_idx" ON "noticia"("repeticao_conferida_em");

-- Apagar a original libera a repetida: o ON DELETE SET NULL tira a ligação, e o gatilho tira o
-- motivo e a data da conferência, para a notícia ser conferida de novo na próxima volta.
CREATE FUNCTION "noticia_solta_repetida"() RETURNS trigger AS $$
BEGIN
    IF NEW."repetida_de_id" IS NULL AND OLD."repetida_de_id" IS NOT NULL THEN
        NEW."repetida_por" := NULL;
        NEW."repeticao_conferida_em" := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "noticia_solta_repetida_trg"
    BEFORE UPDATE OF "repetida_de_id" ON "noticia"
    FOR EACH ROW EXECUTE FUNCTION "noticia_solta_repetida"();

ALTER TABLE "noticia" ADD CONSTRAINT "noticia_repetida_de_id_fkey"
    FOREIGN KEY ("repetida_de_id") REFERENCES "noticia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
