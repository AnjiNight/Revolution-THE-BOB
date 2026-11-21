-- SPEC-005 §10: anos fechados do calendário publicados pelo processador a partir do arquivo anual
-- da B3.

-- AlterEnum
ALTER TYPE "tarefa_ingestao" ADD VALUE 'calendario_b3';

-- AlterEnum
-- Publicação do calendário feita pelo processador (sem colaborador).
ALTER TYPE "acao_auditoria" ADD VALUE 'calendario_importado';

-- CreateEnum
CREATE TYPE "origem_calendario" AS ENUM ('colaborador', 'arquivo_b3');

-- AlterTable
-- Quem publicou: o colaborador (com o id dele) ou o processador, pelo arquivo da B3 (sem id).
ALTER TABLE "ano_calendario" ADD COLUMN "origem" "origem_calendario" NOT NULL DEFAULT 'colaborador';
ALTER TABLE "ano_calendario" ALTER COLUMN "publicado_por" DROP NOT NULL;

ALTER TABLE "ano_calendario" ADD CONSTRAINT "ano_calendario_publicado_por_chk" CHECK (
    ("origem" = 'colaborador' AND "publicado_por" IS NOT NULL)
    OR ("origem" = 'arquivo_b3' AND "publicado_por" IS NULL)
);

-- AlterTable
-- A publicação do processador também fica sem colaborador na auditoria.
-- (O valor novo do tipo ainda não pode ser usado nesta transação: a regra compara o texto.)
ALTER TABLE "registro_auditoria" DROP CONSTRAINT "registro_auditoria_colaborador_chk";
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_colaborador_chk" CHECK (
    "colaborador_id" IS NOT NULL
    OR "acao"::text IN (
        'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente',
        'calendario_importado'
    )
);
