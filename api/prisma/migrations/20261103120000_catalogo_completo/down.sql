-- Reversão da SPEC-040. Os ativos importados ficam no catálogo como se a equipe os tivesse
-- cadastrado (ativo nunca é apagado), e o registro de auditoria não perde nenhuma linha.
DROP TABLE IF EXISTS "logo_ativo";
DROP TYPE IF EXISTS "situacao_logo";
DROP TABLE IF EXISTS "negociacao_b3";

ALTER TABLE "ativo" DROP CONSTRAINT IF EXISTS "ativo_desativado_automaticamente_chk";
ALTER TABLE "ativo" DROP CONSTRAINT IF EXISTS "ativo_classificacao_equipe_chk";
ALTER TABLE "ativo" DROP COLUMN IF EXISTS "origem",
DROP COLUMN IF EXISTS "classificacao_conferida_em",
DROP COLUMN IF EXISTS "desativado_automaticamente";
DROP TYPE IF EXISTS "origem_ativo";

ALTER TABLE "execucao_tarefa" DROP COLUMN IF EXISTS "totais";

-- O PostgreSQL não remove valor de enum: recria os tipos sem os valores desta Spec.
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'importacao_catalogo';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";

-- A auditoria só aceita inclusões (o gatilho barra UPDATE e DELETE): as ações do processador
-- viram as ações equivalentes da equipe, com o id zerado, reescrevendo as colunas (sem UPDATE).
ALTER TABLE "registro_auditoria" DROP CONSTRAINT IF EXISTS "registro_auditoria_colaborador_chk";
ALTER TABLE "registro_auditoria" ALTER COLUMN "colaborador_id" TYPE UUID
    USING COALESCE("colaborador_id", '00000000-0000-0000-0000-000000000000'::uuid);
ALTER TABLE "registro_auditoria" ALTER COLUMN "colaborador_id" SET NOT NULL;

ALTER TYPE "acao_auditoria" RENAME TO "acao_auditoria_antigo";
CREATE TYPE "acao_auditoria" AS ENUM ('ativo_cadastrado', 'ativo_editado', 'ativo_desativado', 'ativo_reativado', 'calendario_publicado');
ALTER TABLE "registro_auditoria" ALTER COLUMN "acao" TYPE "acao_auditoria" USING (
    CASE "acao"::text
        WHEN 'ativo_importado' THEN 'ativo_cadastrado'
        WHEN 'ativo_desativado_automaticamente' THEN 'ativo_desativado'
        WHEN 'ativo_reativado_automaticamente' THEN 'ativo_reativado'
        WHEN 'classificacao_conferida' THEN 'ativo_editado'
        ELSE "acao"::text
    END
)::"acao_auditoria";
DROP TYPE "acao_auditoria_antigo";
