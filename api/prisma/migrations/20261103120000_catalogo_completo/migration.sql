-- SPEC-040: catálogo completo da B3 (importação diária), logos e ações automáticas na auditoria.

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'importacao_catalogo';

-- AlterEnum
-- Ações do processador (sem colaborador) e a conferência da classificação importada.
ALTER TYPE "acao_auditoria" ADD VALUE 'ativo_importado';
ALTER TYPE "acao_auditoria" ADD VALUE 'ativo_desativado_automaticamente';
ALTER TYPE "acao_auditoria" ADD VALUE 'ativo_reativado_automaticamente';
ALTER TYPE "acao_auditoria" ADD VALUE 'classificacao_conferida';

-- CreateEnum
CREATE TYPE "origem_ativo" AS ENUM ('equipe', 'importacao');

-- CreateEnum
CREATE TYPE "situacao_logo" AS ENUM ('ok', 'sem_logo');

-- AlterTable
-- Quem cadastrou, se a classificação sugerida já foi conferida e se o processador desativou.
ALTER TABLE "ativo" ADD COLUMN "origem" "origem_ativo" NOT NULL DEFAULT 'equipe',
ADD COLUMN "classificacao_conferida_em" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "desativado_automaticamente" BOOLEAN NOT NULL DEFAULT false;

-- O que a equipe cadastra já nasce classificado por ela (padrão: agora); o que já existia, desde
-- o cadastro. A importação grava vazio (a revisar).
UPDATE "ativo" SET "classificacao_conferida_em" = "criado_em";

ALTER TABLE "ativo" ADD CONSTRAINT "ativo_classificacao_equipe_chk" CHECK (
    "origem" = 'importacao' OR "classificacao_conferida_em" IS NOT NULL
);

ALTER TABLE "ativo" ADD CONSTRAINT "ativo_desativado_automaticamente_chk" CHECK (
    NOT "desativado_automaticamente" OR "desativado_em" IS NOT NULL
);

-- AlterTable
-- Totais de uma execução que não cabem em "registros" (a importação: criados, desativados etc.).
ALTER TABLE "execucao_tarefa" ADD COLUMN "totais" JSONB;

-- AlterTable
-- Ações do processador ficam sem colaborador; as da equipe continuam com o id dele (DA13).
-- (Os valores novos do tipo ainda não podem ser usados nesta transação: a regra compara o texto.)
ALTER TABLE "registro_auditoria" ALTER COLUMN "colaborador_id" DROP NOT NULL;

ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_colaborador_chk" CHECK (
    "colaborador_id" IS NOT NULL
    OR "acao"::text IN (
        'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente'
    )
);

-- CreateTable
-- Último pregão com negócio de cada ação, unit e FII lido nos arquivos da B3, inclusive dos que
-- não estão no catálogo. Dado público, sem dado pessoal.
CREATE TABLE "negociacao_b3" (
    "ticker" VARCHAR(6) NOT NULL,
    "classe" "classe_ativo" NOT NULL,
    "ultimo_pregao" DATE NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "negociacao_b3_pkey" PRIMARY KEY ("ticker"),
    CONSTRAINT "negociacao_b3_ticker_formato_chk" CHECK ("ticker" ~ '^[A-Z][A-Z0-9]{3}[0-9]{1,2}$'),
    CONSTRAINT "negociacao_b3_dia_util_chk" CHECK (EXTRACT(ISODOW FROM "ultimo_pregao") < 6)
);

-- CreateTable
-- Logo de cada ativo, baixado do servidor de ícones da brapi. "sem_logo": a brapi não tem um
-- próprio (só o genérico); o app mostra o círculo com as letras do ticker.
CREATE TABLE "logo_ativo" (
    "ativo_id" UUID NOT NULL,
    "situacao" "situacao_logo" NOT NULL,
    "tipo" VARCHAR(20),
    "conteudo" BYTEA,
    "resumo" VARCHAR(64),
    "baixado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "logo_ativo_pkey" PRIMARY KEY ("ativo_id"),
    CONSTRAINT "logo_ativo_conteudo_chk" CHECK (
        (
            "situacao" = 'ok'
            AND "tipo" IN ('image/svg+xml', 'image/png')
            AND "conteudo" IS NOT NULL
            AND octet_length("conteudo") BETWEEN 1 AND 102400
            AND "resumo" IS NOT NULL
        )
        OR ("situacao" = 'sem_logo' AND "tipo" IS NULL AND "conteudo" IS NULL)
    )
);

-- AddForeignKey
-- Ativo nunca é apagado (SPEC-006).
ALTER TABLE "logo_ativo" ADD CONSTRAINT "logo_ativo_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
