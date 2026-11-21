-- Reversão da SPEC-008: remove o histórico de cotações e o registro das execuções.
DROP TABLE IF EXISTS "erro_execucao";
DROP TABLE IF EXISTS "execucao_tarefa";
DROP TABLE IF EXISTS "carga_historico";
DROP TABLE IF EXISTS "cotacao_diaria";
DROP TYPE IF EXISTS "situacao_execucao";
DROP TYPE IF EXISTS "tarefa_ingestao";
DROP TYPE IF EXISTS "fonte_cotacao";
