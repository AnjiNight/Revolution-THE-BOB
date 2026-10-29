-- SPEC-006: catálogo de ativos (classe, setor ou segmento, ativo/desativado) e registro de auditoria.

-- CreateEnum
CREATE TYPE "classe_ativo" AS ENUM ('acao', 'fii');

-- CreateEnum
CREATE TYPE "acao_auditoria" AS ENUM ('ativo_cadastrado', 'ativo_editado', 'ativo_desativado', 'ativo_reativado', 'calendario_publicado');

-- CreateEnum
CREATE TYPE "entidade_auditoria" AS ENUM ('ativo', 'ano_calendario');

-- CreateTable
-- Lista fixa de setores (ações) e segmentos (FIIs), SPEC-006 §4. Mudar a lista é uma migração nova.
CREATE TABLE "setor" (
    "classe" "classe_ativo" NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("classe","codigo")
);

INSERT INTO "setor" ("classe", "codigo") VALUES
    ('acao', 'bens_industriais'),
    ('acao', 'comunicacoes'),
    ('acao', 'consumo_ciclico'),
    ('acao', 'consumo_nao_ciclico'),
    ('acao', 'financeiro'),
    ('acao', 'materiais_basicos'),
    ('acao', 'petroleo_gas_biocombustiveis'),
    ('acao', 'saude'),
    ('acao', 'tecnologia_informacao'),
    ('acao', 'utilidade_publica'),
    ('acao', 'outros'),
    ('fii', 'lajes_corporativas'),
    ('fii', 'logistica'),
    ('fii', 'shoppings'),
    ('fii', 'recebiveis'),
    ('fii', 'fundo_de_fundos'),
    ('fii', 'hibrido'),
    ('fii', 'residencial'),
    ('fii', 'hoteis'),
    ('fii', 'renda_urbana'),
    ('fii', 'desenvolvimento'),
    ('fii', 'outros');

-- CreateTable
CREATE TABLE "ativo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticker" VARCHAR(6) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "classe" "classe_ativo" NOT NULL,
    "setor" VARCHAR(40) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "desativado_em" TIMESTAMPTZ(3),

    CONSTRAINT "ativo_pkey" PRIMARY KEY ("id"),
    -- Formato da B3: 4 caracteres começando por letra e 1 ou 2 números (PETR4, B3SA3, TAEE11).
    CONSTRAINT "ativo_ticker_formato_chk" CHECK ("ticker" ~ '^[A-Z][A-Z0-9]{3}[0-9]{1,2}$'),
    CONSTRAINT "ativo_nome_tamanho_chk" CHECK (char_length(btrim("nome")) BETWEEN 2 AND 100)
);

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ocorrido_em" TIMESTAMPTZ(3) NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "acao" "acao_auditoria" NOT NULL,
    "entidade" "entidade_auditoria" NOT NULL,
    "entidade_id" VARCHAR(64) NOT NULL,
    "detalhes" JSONB NOT NULL,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ativo_ticker_key" ON "ativo"("ticker");

-- CreateIndex
CREATE INDEX "ativo_classe_setor_idx" ON "ativo"("classe", "setor");

-- CreateIndex
CREATE INDEX "registro_auditoria_entidade_entidade_id_ocorrido_em_idx" ON "registro_auditoria"("entidade", "entidade_id", "ocorrido_em");

-- AddForeignKey
-- O par (classe, setor) garante que ação tem setor de ação e FII tem segmento de FII.
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_classe_setor_fkey" FOREIGN KEY ("classe", "setor") REFERENCES "setor"("classe", "codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- RB22: a classe do ativo nunca muda, nem por SQL direto.
CREATE FUNCTION "ativo_classe_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."classe" IS DISTINCT FROM OLD."classe" THEN
        RAISE EXCEPTION 'a classe do ativo não pode ser alterada (RB22)'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ativo_classe_imutavel';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ativo_classe_imutavel" BEFORE UPDATE OF "classe" ON "ativo"
    FOR EACH ROW EXECUTE FUNCTION "ativo_classe_imutavel"();

-- RNF15: o registro de auditoria só aceita inclusões.
CREATE FUNCTION "registro_auditoria_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'o registro de auditoria só aceita inclusões (RNF15)'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'registro_auditoria_somente_insercao';
END;
$$;

CREATE TRIGGER "registro_auditoria_somente_insercao" BEFORE UPDATE OR DELETE ON "registro_auditoria"
    FOR EACH ROW EXECUTE FUNCTION "registro_auditoria_somente_insercao"();
