-- SPEC-030: feeds de notícias próprios dos usuários (RSS ou Atom) e a preferência de cada usuário
-- sobre as fontes do app: ligada ou não e a prioridade (DA19). São dados pessoais: entram na
-- exportação e saem com a conta (DA13).

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'noticias_feeds_usuario';
ALTER TYPE "tipo_fonte_noticia" ADD VALUE 'usuario';

-- CreateEnum
CREATE TYPE "prioridade_fonte" AS ENUM ('alta', 'media', 'baixa');

-- AlterTable
-- `parada_em`: o feed próprio que falhou 24 vezes seguidas deixa de ser lido até o usuário pedir.
ALTER TABLE "fonte_noticia" ADD COLUMN "parada_em" TIMESTAMPTZ(3);

-- O valor novo do tipo só vale depois do COMMIT: as restrições comparam o tipo como texto.
ALTER TABLE "fonte_noticia" DROP CONSTRAINT "fonte_noticia_curada_chk";
ALTER TABLE "fonte_noticia" ADD CONSTRAINT "fonte_noticia_tipo_chk" CHECK (
    "tipo"::text = 'pai'
    OR ("tipo"::text = 'curada' AND "categoria" IS NOT NULL AND "confiabilidade" BETWEEN 1 AND 5 AND "licenca_conferida_em" IS NOT NULL)
    OR ("tipo"::text = 'usuario' AND "categoria" IS NULL AND "confiabilidade" IS NULL AND "licenca_conferida_em" IS NULL)
);
ALTER TABLE "fonte_noticia" ADD CONSTRAINT "fonte_noticia_parada_chk" CHECK (
    "parada_em" IS NULL OR "tipo"::text = 'usuario'
);

-- A limpeza das notícias antigas dos feeds dos usuários e os filtros da tela Notícias.
CREATE INDEX "noticia_fonte_publicada_idx" ON "noticia"("fonte_id", "publicada_em");

-- CreateTable
-- A escolha do usuário sobre uma fonte. Nas curadas, só existe quando ele muda algo (o padrão é
-- ligada e Média); no feed próprio, é o que liga o usuário à fonte, com o nome que ele deu.
CREATE TABLE "preferencia_fonte" (
    "usuario_id" UUID NOT NULL,
    "fonte_id" UUID NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "prioridade" "prioridade_fonte" NOT NULL DEFAULT 'media',
    "nome" VARCHAR(80),
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preferencia_fonte_pkey" PRIMARY KEY ("usuario_id", "fonte_id"),
    CONSTRAINT "preferencia_fonte_nome_chk" CHECK ("nome" IS NULL OR length(btrim("nome")) > 0)
);

CREATE INDEX "preferencia_fonte_fonte_idx" ON "preferencia_fonte"("fonte_id");

ALTER TABLE "preferencia_fonte" ADD CONSTRAINT "preferencia_fonte_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preferencia_fonte" ADD CONSTRAINT "preferencia_fonte_fonte_id_fkey"
    FOREIGN KEY ("fonte_id") REFERENCES "fonte_noticia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RB29: a fonte pai não tem preferência (sempre ligada, com o maior peso). O nome é só do feed
-- próprio.
CREATE FUNCTION "preferencia_fonte_conferir"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    tipo_fonte text;
BEGIN
    SELECT "tipo"::text INTO tipo_fonte FROM "fonte_noticia" WHERE "id" = NEW."fonte_id";
    IF tipo_fonte = 'pai' THEN
        RAISE EXCEPTION 'a fonte pai não tem preferência do usuário (RB29)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF tipo_fonte IS DISTINCT FROM 'usuario' AND NEW."nome" IS NOT NULL THEN
        RAISE EXCEPTION 'só o feed próprio tem nome dado pelo usuário'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "preferencia_fonte_conferir"
    BEFORE INSERT OR UPDATE ON "preferencia_fonte"
    FOR EACH ROW EXECUTE FUNCTION "preferencia_fonte_conferir"();

-- Quando sai o último usuário de um feed próprio (remoção ou exclusão da conta), a fonte e as
-- notícias dela são apagadas: ninguém mais as acompanha (§4.2).
CREATE FUNCTION "preferencia_fonte_apagar_orfa"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "preferencia_fonte" WHERE "fonte_id" = OLD."fonte_id")
        AND EXISTS (
            SELECT 1 FROM "fonte_noticia" WHERE "id" = OLD."fonte_id" AND "tipo"::text = 'usuario'
        ) THEN
        DELETE FROM "noticia" WHERE "fonte_id" = OLD."fonte_id";
        DELETE FROM "fonte_noticia" WHERE "id" = OLD."fonte_id";
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "preferencia_fonte_apagar_orfa"
    AFTER DELETE ON "preferencia_fonte"
    FOR EACH ROW EXECUTE FUNCTION "preferencia_fonte_apagar_orfa"();
