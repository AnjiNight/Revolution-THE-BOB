-- Reversão da SPEC-039: volta à tabela de redefinição de senha da SPEC-004 e remove a confirmação.
-- Contas ainda pendentes deixariam de existir na prática: são apagadas antes, como faria a limpeza.
DELETE FROM "usuario" WHERE "email_confirmado_em" IS NULL;
DELETE FROM "codigo_email" WHERE "finalidade" <> 'redefinir_senha';
ALTER TABLE "codigo_email" DROP COLUMN "finalidade";
ALTER INDEX "codigo_email_usuario_id_criado_em_idx" RENAME TO "redefinicao_senha_usuario_id_criado_em_idx";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "codigo_email_validade_chk" TO "redefinicao_senha_validade_chk";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "codigo_email_tentativas_chk" TO "redefinicao_senha_tentativas_chk";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "codigo_email_usuario_id_fkey" TO "redefinicao_senha_usuario_id_fkey";
ALTER TABLE "codigo_email" RENAME CONSTRAINT "codigo_email_pkey" TO "redefinicao_senha_pkey";
ALTER TABLE "codigo_email" RENAME TO "redefinicao_senha";
ALTER TABLE "usuario" DROP CONSTRAINT IF EXISTS "usuario_confirmado_chk";
ALTER TABLE "usuario" DROP CONSTRAINT IF EXISTS "usuario_email_pendente_minusculas_chk";
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "email_pendente";
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "email_confirmado_em";
DROP TYPE IF EXISTS "finalidade_codigo";
