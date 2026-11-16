-- SPEC-021: classificação setorial da B3 por empresa e sugestão de classificação pelo processador.

-- AlterEnum
ALTER TYPE "acao_auditoria" ADD VALUE 'classificacao_sugerida';

-- CreateTable
-- Classificação setorial da B3 de cada empresa listada (página de detalhe da empresa), pelo código
-- de 4 letras do ticker: setor econômico, subsetor e segmento, como a B3 publica.
CREATE TABLE "classificacao_b3" (
    "codigo" VARCHAR(4) NOT NULL,
    "codigo_cvm" VARCHAR(10) NOT NULL,
    "setor" VARCHAR(100),
    "subsetor" VARCHAR(100),
    "segmento" VARCHAR(100),
    "coletada_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "classificacao_b3_pkey" PRIMARY KEY ("codigo")
);

-- AlterTable
-- A sugestão de classificação do processador também fica sem colaborador na auditoria.
-- (O valor novo do tipo ainda não pode ser usado nesta transação: a regra compara o texto.)
ALTER TABLE "registro_auditoria" DROP CONSTRAINT "registro_auditoria_colaborador_chk";
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_colaborador_chk" CHECK (
    "colaborador_id" IS NOT NULL
    OR "acao"::text IN (
        'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente',
        'calendario_importado', 'classificacao_sugerida'
    )
);
