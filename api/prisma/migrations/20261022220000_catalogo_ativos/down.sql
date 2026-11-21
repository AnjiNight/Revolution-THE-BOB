-- Reversão da SPEC-006: remove o catálogo de ativos e o registro de auditoria.
DROP TABLE IF EXISTS "registro_auditoria";
DROP FUNCTION IF EXISTS "registro_auditoria_somente_insercao"();
DROP TABLE IF EXISTS "ativo";
DROP FUNCTION IF EXISTS "ativo_classe_imutavel"();
DROP TABLE IF EXISTS "setor";
DROP TYPE IF EXISTS "entidade_auditoria";
DROP TYPE IF EXISTS "acao_auditoria";
DROP TYPE IF EXISTS "classe_ativo";
