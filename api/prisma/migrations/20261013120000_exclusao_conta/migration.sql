-- SPEC-034: exclusão de conta confirmada por código no e-mail e registro da exclusão.

-- AlterEnum
ALTER TYPE "finalidade_codigo" ADD VALUE 'excluir_conta';

-- CreateTable
-- Registro de que uma conta foi excluída (QA07). Sem dado pessoal e sem chave estrangeira:
-- a conta já não existe quando o registro é gravado.
CREATE TABLE "exclusao_conta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "excluida_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exclusao_conta_pkey" PRIMARY KEY ("id")
);
