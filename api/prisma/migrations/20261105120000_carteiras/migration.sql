-- SPEC-012: carteiras de simulação (ao vivo e histórica).

-- CreateEnum
CREATE TYPE "tipo_carteira" AS ENUM ('ao_vivo', 'historica');

-- CreateTable
-- "nome_chave": o nome sem maiúsculas nem acentos, para o nome único de cada usuário (calculado
-- pelo servidor). A conta apagada leva as carteiras junto (DA13, SPEC-034).
CREATE TABLE "carteira" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "nome_chave" VARCHAR(60) NOT NULL,
    "tipo" "tipo_carteira" NOT NULL,
    "inicio_em" DATE NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carteira_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "carteira_nome_chk" CHECK (char_length("nome") BETWEEN 1 AND 60 AND "nome" = btrim("nome")),
    CONSTRAINT "carteira_nome_chave_chk" CHECK (char_length("nome_chave") BETWEEN 1 AND 60),
    -- A histórica começa num dia de pregão (nunca no fim de semana); a ao vivo, no dia da criação.
    CONSTRAINT "carteira_inicio_chk" CHECK (
        "inicio_em" >= DATE '2016-01-04'
        AND ("tipo" = 'ao_vivo' OR EXTRACT(ISODOW FROM "inicio_em") < 6)
    )
);

CREATE UNIQUE INDEX "carteira_usuario_id_nome_chave_key" ON "carteira"("usuario_id", "nome_chave");
CREATE INDEX "carteira_usuario_id_criada_em_idx" ON "carteira"("usuario_id", "criada_em");

ALTER TABLE "carteira" ADD CONSTRAINT "carteira_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RB24: o tipo da carteira não muda depois da criação.
CREATE FUNCTION "carteira_tipo_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."tipo" IS DISTINCT FROM OLD."tipo" THEN
        RAISE EXCEPTION 'o tipo da carteira não pode ser alterado (RB24)'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'carteira_tipo_imutavel';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "carteira_tipo_imutavel" BEFORE UPDATE OF "tipo" ON "carteira"
    FOR EACH ROW EXECUTE FUNCTION "carteira_tipo_imutavel"();

-- CreateTable
-- Registro da exclusão de uma carteira (OPEN-15), sem dado pessoal: nem nome, nem dono.
CREATE TABLE "exclusao_carteira" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carteira_id" UUID NOT NULL,
    "tipo" "tipo_carteira" NOT NULL,
    "lancamentos" INTEGER NOT NULL,
    "excluida_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exclusao_carteira_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exclusao_carteira_lancamentos_chk" CHECK ("lancamentos" >= 0)
);
