-- SPEC-004: códigos de redefinição de senha (só o HMAC do código é guardado).

-- CreateTable
CREATE TABLE "redefinicao_senha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "codigo_hash" CHAR(64) NOT NULL,
    "tentativas" SMALLINT NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "encerrado_em" TIMESTAMPTZ(3),

    CONSTRAINT "redefinicao_senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "redefinicao_senha_usuario_id_criado_em_idx" ON "redefinicao_senha"("usuario_id", "criado_em");

-- AddForeignKey
ALTER TABLE "redefinicao_senha" ADD CONSTRAINT "redefinicao_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrições escritas à mão: o Prisma não expressa CHECK (SPEC-001, §4).
-- Um código aguenta no máximo 5 tentativas erradas (SPEC-004, §4).
ALTER TABLE "redefinicao_senha" ADD CONSTRAINT "redefinicao_senha_tentativas_chk" CHECK ("tentativas" BETWEEN 0 AND 5);
ALTER TABLE "redefinicao_senha" ADD CONSTRAINT "redefinicao_senha_validade_chk" CHECK ("expira_em" > "criado_em");
