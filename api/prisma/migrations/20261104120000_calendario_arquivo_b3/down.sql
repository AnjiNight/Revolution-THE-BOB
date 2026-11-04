-- Reversão da SPEC-005 §10. Os anos publicados pelo processador continuam publicados, como se um
-- colaborador com o id zerado os tivesse publicado (o calendário não perde nenhum ano), e o
-- registro de auditoria não perde nenhuma linha.
ALTER TABLE "ano_calendario" DROP CONSTRAINT IF EXISTS "ano_calendario_publicado_por_chk";
UPDATE "ano_calendario" SET "publicado_por" = '00000000-0000-0000-0000-000000000000'
    WHERE "publicado_por" IS NULL;
ALTER TABLE "ano_calendario" ALTER COLUMN "publicado_por" SET NOT NULL;
ALTER TABLE "ano_calendario" DROP COLUMN IF EXISTS "origem";
DROP TYPE IF EXISTS "origem_calendario";

-- O PostgreSQL não remove valor de enum: recria os tipos sem os valores desta mudança.
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'calendario_b3';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";

-- A auditoria só aceita inclusões (o gatilho barra UPDATE e DELETE): as publicações do processador
-- viram publicações da equipe com o id zerado, reescrevendo as colunas (sem UPDATE).
ALTER TABLE "registro_auditoria" DROP CONSTRAINT IF EXISTS "registro_auditoria_colaborador_chk";
ALTER TABLE "registro_auditoria" ALTER COLUMN "colaborador_id" TYPE UUID USING (
    CASE WHEN "acao"::text = 'calendario_importado'
        THEN COALESCE("colaborador_id", '00000000-0000-0000-0000-000000000000'::uuid)
        ELSE "colaborador_id"
    END
);

ALTER TYPE "acao_auditoria" RENAME TO "acao_auditoria_antigo";
CREATE TYPE "acao_auditoria" AS ENUM ('ativo_cadastrado', 'ativo_editado', 'ativo_desativado', 'ativo_reativado', 'calendario_publicado', 'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente', 'classificacao_conferida');
ALTER TABLE "registro_auditoria" ALTER COLUMN "acao" TYPE "acao_auditoria" USING (
    CASE "acao"::text
        WHEN 'calendario_importado' THEN 'calendario_publicado'
        ELSE "acao"::text
    END
)::"acao_auditoria";
DROP TYPE "acao_auditoria_antigo";

ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_colaborador_chk" CHECK (
    "colaborador_id" IS NOT NULL
    OR "acao"::text IN (
        'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente'
    )
);
