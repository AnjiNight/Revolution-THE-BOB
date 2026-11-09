-- Reversão da SPEC-021. A classificação dos ativos fica como está (é o setor do catálogo, que a
-- equipe pode mudar pela tela); sai só a tabela da B3. A auditoria não perde nenhuma linha: as
-- sugestões do processador viram edições da equipe com o id zerado, reescrevendo as colunas (sem
-- UPDATE, que o gatilho barra), como na reversão da SPEC-005 §10.
DROP TABLE IF EXISTS "classificacao_b3";

ALTER TABLE "registro_auditoria" DROP CONSTRAINT IF EXISTS "registro_auditoria_colaborador_chk";
ALTER TABLE "registro_auditoria" ALTER COLUMN "colaborador_id" TYPE UUID USING (
    CASE WHEN "acao"::text = 'classificacao_sugerida'
        THEN COALESCE("colaborador_id", '00000000-0000-0000-0000-000000000000'::uuid)
        ELSE "colaborador_id"
    END
);

ALTER TYPE "acao_auditoria" RENAME TO "acao_auditoria_antigo";
CREATE TYPE "acao_auditoria" AS ENUM ('ativo_cadastrado', 'ativo_editado', 'ativo_desativado', 'ativo_reativado', 'calendario_publicado', 'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente', 'classificacao_conferida', 'calendario_importado');
ALTER TABLE "registro_auditoria" ALTER COLUMN "acao" TYPE "acao_auditoria" USING (
    CASE "acao"::text
        WHEN 'classificacao_sugerida' THEN 'ativo_editado'
        ELSE "acao"::text
    END
)::"acao_auditoria";
DROP TYPE "acao_auditoria_antigo";

ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_colaborador_chk" CHECK (
    "colaborador_id" IS NOT NULL
    OR "acao"::text IN (
        'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente',
        'calendario_importado'
    )
);
