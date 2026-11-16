-- Reversão da SPEC-027: as notícias e as fontes saem inteiras (sem dado pessoal; o processador
-- coleta de novo).
DROP TABLE IF EXISTS "coleta_noticia_arquivo";
DROP TABLE IF EXISTS "noticia";
DROP TABLE IF EXISTS "fonte_noticia";
DROP TYPE IF EXISTS "situacao_arquivo_noticia";
DROP TYPE IF EXISTS "categoria_noticia";
DROP TYPE IF EXISTS "tipo_fonte_noticia";

-- O PostgreSQL não remove valor de enum: recria os tipos sem os valores desta Spec.
DELETE FROM "execucao_tarefa" WHERE "tarefa" IN ('noticias_novas', 'noticias_arquivo', 'noticias_feeds');

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3', 'cdi_diario', 'investidor10', 'eventos_b3', 'indices_b3');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";

-- A auditoria não perde nenhuma linha (o gatilho barra UPDATE e DELETE): as mudanças de fonte viram
-- edições de ativo, reescrevendo as colunas, como na reversão da SPEC-021.
ALTER TABLE "registro_auditoria" DROP CONSTRAINT "registro_auditoria_colaborador_chk";

ALTER TYPE "acao_auditoria" RENAME TO "acao_auditoria_antigo";
CREATE TYPE "acao_auditoria" AS ENUM ('ativo_cadastrado', 'ativo_editado', 'ativo_desativado', 'ativo_reativado', 'calendario_publicado', 'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente', 'classificacao_conferida', 'calendario_importado', 'classificacao_sugerida');
ALTER TABLE "registro_auditoria" ALTER COLUMN "acao" TYPE "acao_auditoria" USING (
    CASE WHEN "acao"::text IN ('fonte_noticia_cadastrada', 'fonte_noticia_editada')
        THEN 'ativo_editado'
        ELSE "acao"::text
    END
)::"acao_auditoria";
DROP TYPE "acao_auditoria_antigo";

ALTER TYPE "entidade_auditoria" RENAME TO "entidade_auditoria_antigo";
CREATE TYPE "entidade_auditoria" AS ENUM ('ativo', 'ano_calendario');
ALTER TABLE "registro_auditoria" ALTER COLUMN "entidade" TYPE "entidade_auditoria" USING (
    CASE WHEN "entidade"::text = 'fonte_noticia' THEN 'ativo' ELSE "entidade"::text END
)::"entidade_auditoria";
DROP TYPE "entidade_auditoria_antigo";

ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_colaborador_chk" CHECK (
    "colaborador_id" IS NOT NULL
    OR "acao"::text IN (
        'ativo_importado', 'ativo_desativado_automaticamente', 'ativo_reativado_automaticamente',
        'calendario_importado', 'classificacao_sugerida'
    )
);
