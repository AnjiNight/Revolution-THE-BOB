-- SPEC-039: confirmação de e-mail. Conta com e-mail e senha nasce pendente; a troca de e-mail
-- só vale depois do código; os códigos da SPEC-004 passam a ter uma finalidade.

-- CreateEnum
CREATE TYPE "finalidade_codigo" AS ENUM ('redefinir_senha', 'confirmar_cadastro', 'trocar_email');

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "email_confirmado_em" TIMESTAMPTZ(3),
ADD COLUMN     "email_pendente" VARCHAR(254);

-- As contas que já existem ficam confirmadas (SPEC-039 §4: ainda não há usuários reais).
UPDATE "usuario" SET "email_confirmado_em" = "criado_em";

-- A tabela da SPEC-004 vira a tabela de todos os códigos enviados por e-mail.
ALTER TABLE "redefinicao_senha" RENAME TO "codigo_email";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "redefinicao_senha_pkey" TO "codigo_email_pkey";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "redefinicao_senha_usuario_id_fkey" TO "codigo_email_usuario_id_fkey";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "redefinicao_senha_tentativas_chk" TO "codigo_email_tentativas_chk";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "redefinicao_senha_validade_chk" TO "codigo_email_validade_chk";
ALTER INDEX "redefinicao_senha_usuario_id_criado_em_idx" RENAME TO "codigo_email_usuario_id_criado_em_idx";
-- Os códigos que já existem eram todos de redefinição de senha.
ALTER TABLE "codigo_email" ADD COLUMN "finalidade" "finalidade_codigo" NOT NULL DEFAULT 'redefinir_senha';
ALTER TABLE "codigo_email" ALTER COLUMN "finalidade" DROP DEFAULT;

-- Restrições escritas à mão: o Prisma não expressa CHECK (SPEC-001, §4).
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_email_pendente_minusculas_chk" CHECK ("email_pendente" = lower("email_pendente"));
-- Colaborador (criado pela equipe) e conta com Google nascem confirmados (SPEC-039 §4).
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_confirmado_chk" CHECK ("email_confirmado_em" IS NOT NULL OR ("perfil" <> 'colaborador' AND "google_sub" IS NULL));
