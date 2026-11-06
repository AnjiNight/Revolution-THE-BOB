-- Reversão da SPEC-034: remove o registro de exclusões e a finalidade "excluir_conta".
DROP TABLE IF EXISTS "exclusao_conta";
DELETE FROM "codigo_email" WHERE "finalidade" = 'excluir_conta';
-- O PostgreSQL não remove valor de enum: recria o tipo sem ele.
ALTER TYPE "finalidade_codigo" RENAME TO "finalidade_codigo_antigo";
CREATE TYPE "finalidade_codigo" AS ENUM ('redefinir_senha', 'confirmar_cadastro', 'trocar_email');
ALTER TABLE "codigo_email" ALTER COLUMN "finalidade" TYPE "finalidade_codigo" USING "finalidade"::text::"finalidade_codigo";
DROP TYPE "finalidade_codigo_antigo";
