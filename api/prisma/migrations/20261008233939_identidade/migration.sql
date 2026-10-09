-- SPEC-002: identidade (usuário, colaborador, login com Google, consentimento e token de renovação).

-- CreateEnum
CREATE TYPE "perfil_acesso" AS ENUM ('usuario', 'colaborador');

-- CreateEnum
CREATE TYPE "tipo_consentimento" AS ENUM ('termos_uso_privacidade');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "senha_hash" TEXT,
    "google_sub" VARCHAR(255),
    "perfil" "perfil_acesso" NOT NULL DEFAULT 'usuario',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_consentimento" NOT NULL,
    "versao" VARCHAR(20) NOT NULL,
    "aceito_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_renovacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "familia" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogado_em" TIMESTAMPTZ(3),

    CONSTRAINT "token_renovacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_google_sub_key" ON "usuario"("google_sub");

-- CreateIndex
CREATE INDEX "consentimento_usuario_id_idx" ON "consentimento"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_renovacao_token_hash_key" ON "token_renovacao"("token_hash");

-- CreateIndex
CREATE INDEX "token_renovacao_usuario_id_idx" ON "token_renovacao"("usuario_id");

-- CreateIndex
CREATE INDEX "token_renovacao_familia_idx" ON "token_renovacao"("familia");

-- AddForeignKey
ALTER TABLE "consentimento" ADD CONSTRAINT "consentimento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_renovacao" ADD CONSTRAINT "token_renovacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrições escritas à mão: o Prisma não expressa CHECK (SPEC-001, §4).
-- RB01: o e-mail é sempre gravado em minúsculas, então a unicidade não depende de maiúsculas.
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_email_minusculas_chk" CHECK ("email" = lower("email"));
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_nome_tamanho_chk" CHECK (char_length(btrim("nome")) >= 2);
-- Toda conta tem uma forma de entrar: senha, Google ou as duas (DA24).
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_forma_de_acesso_chk" CHECK ("senha_hash" IS NOT NULL OR "google_sub" IS NOT NULL);
-- Colaborador entra só com e-mail e senha, nunca pelo Google (SPEC-002, §4).
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_colaborador_com_senha_chk" CHECK ("perfil" <> 'colaborador' OR ("senha_hash" IS NOT NULL AND "google_sub" IS NULL));
ALTER TABLE "token_renovacao" ADD CONSTRAINT "token_renovacao_validade_chk" CHECK ("expira_em" > "criado_em");
