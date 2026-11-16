-- SPEC-027: fontes de notícias (a fonte pai, o Investidor10, e as curadas por RSS ou Atom) e as
-- notícias coletadas, sem dado pessoal.

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'noticias_novas';
ALTER TYPE "tarefa_ingestao" ADD VALUE 'noticias_arquivo';
ALTER TYPE "tarefa_ingestao" ADD VALUE 'noticias_feeds';

-- AlterEnum
ALTER TYPE "acao_auditoria" ADD VALUE 'fonte_noticia_cadastrada';
ALTER TYPE "acao_auditoria" ADD VALUE 'fonte_noticia_editada';
ALTER TYPE "entidade_auditoria" ADD VALUE 'fonte_noticia';

-- CreateEnum
CREATE TYPE "tipo_fonte_noticia" AS ENUM ('pai', 'curada');
CREATE TYPE "categoria_noticia" AS ENUM ('economia', 'mercado', 'empresas', 'internacional');
CREATE TYPE "situacao_arquivo_noticia" AS ENUM ('em_andamento', 'concluido');

-- CreateTable
-- Fonte de notícias (DA19). A pai é única e não tem categoria nem confiabilidade; a curada tem as
-- duas e a data em que o colaborador conferiu a licença.
CREATE TABLE "fonte_noticia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "tipo_fonte_noticia" NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "categoria" "categoria_noticia",
    "confiabilidade" SMALLINT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "licenca_conferida_em" TIMESTAMPTZ(3),
    "ultima_coleta_em" TIMESTAMPTZ(3),
    "ultima_situacao" VARCHAR(10),
    "ultimo_erro" VARCHAR(300),
    "falhas_seguidas" INTEGER NOT NULL DEFAULT 0,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fonte_noticia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fonte_noticia_https_chk" CHECK ("url" LIKE 'https://%'),
    CONSTRAINT "fonte_noticia_curada_chk" CHECK (
        "tipo" = 'pai'
        OR ("categoria" IS NOT NULL AND "confiabilidade" BETWEEN 1 AND 5 AND "licenca_conferida_em" IS NOT NULL)
    ),
    CONSTRAINT "fonte_noticia_pai_ativa_chk" CHECK ("tipo" = 'curada' OR "ativa"),
    CONSTRAINT "fonte_noticia_situacao_chk" CHECK ("ultima_situacao" IS NULL OR "ultima_situacao" IN ('sucesso', 'falha')),
    CONSTRAINT "fonte_noticia_falhas_chk" CHECK ("falhas_seguidas" >= 0)
);

CREATE UNIQUE INDEX "fonte_noticia_url_key" ON "fonte_noticia"("url");
-- Uma fonte pai só.
CREATE UNIQUE INDEX "fonte_noticia_pai_unica" ON "fonte_noticia"("tipo") WHERE "tipo" = 'pai';

-- CreateTable
-- Notícia coletada. O texto completo só existe na fonte pai e serve à classificação (SPEC-028);
-- a tela mostra título, resumo e o link (SPEC-029).
CREATE TABLE "noticia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fonte_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "titulo" VARCHAR(500) NOT NULL,
    "resumo" TEXT,
    "texto" TEXT,
    "autor" VARCHAR(150),
    "temas" TEXT[] NOT NULL DEFAULT '{}',
    "empresas_marcadas" TEXT[] NOT NULL DEFAULT '{}',
    "publicada_em" TIMESTAMPTZ(3) NOT NULL,
    "atualizada_na_fonte_em" TIMESTAMPTZ(3),
    "coletada_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "noticia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "noticia_titulo_chk" CHECK (length(btrim("titulo")) > 0)
);

CREATE UNIQUE INDEX "noticia_fonte_id_url_key" ON "noticia"("fonte_id", "url");
CREATE INDEX "noticia_publicada_em_idx" ON "noticia"("publicada_em");

ALTER TABLE "noticia" ADD CONSTRAINT "noticia_fonte_id_fkey"
    FOREIGN KEY ("fonte_id") REFERENCES "fonte_noticia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
-- Andamento da carga do arquivo da fonte pai (SPEC-027 §4.1, decisão 3).
CREATE TABLE "coleta_noticia_arquivo" (
    "fonte_id" UUID NOT NULL,
    "total" INTEGER NOT NULL,
    "feitas" INTEGER NOT NULL,
    "situacao" "situacao_arquivo_noticia" NOT NULL,
    "atualizada_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coleta_noticia_arquivo_pkey" PRIMARY KEY ("fonte_id"),
    CONSTRAINT "coleta_noticia_arquivo_numeros_chk" CHECK ("total" >= 0 AND "feitas" >= 0)
);

ALTER TABLE "coleta_noticia_arquivo" ADD CONSTRAINT "coleta_noticia_arquivo_fonte_id_fkey"
    FOREIGN KEY ("fonte_id") REFERENCES "fonte_noticia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A fonte pai (DA19) e a primeira curada (SPEC-027 §4.1, decisão 5): Agência Brasil, licença
-- Creative Commons com atribuição.
INSERT INTO "fonte_noticia" ("tipo", "nome", "url")
VALUES ('pai', 'Investidor10', 'https://investidor10.com.br/noticias/');

INSERT INTO "fonte_noticia" ("tipo", "nome", "url", "categoria", "confiabilidade", "licenca_conferida_em")
VALUES ('curada', 'Agência Brasil – Economia', 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', 'economia', 5, CURRENT_TIMESTAMP);
