-- Reversão da SPEC-025: as assinaturas e os pagamentos simulados saem inteiros.
DROP TABLE IF EXISTS "pagamento_simulado";
DROP TABLE IF EXISTS "assinatura";
DROP TABLE IF EXISTS "plano";
DROP TYPE IF EXISTS "situacao_pagamento";
DROP TYPE IF EXISTS "codigo_plano";

-- O PostgreSQL não remove valor de enum: recria o tipo sem o valor desta Spec.
DELETE FROM "pedido_execucao" WHERE "tarefa" = 'renovacao_assinaturas';
DELETE FROM "execucao_tarefa" WHERE "tarefa" = 'renovacao_assinaturas';

ALTER TYPE "tarefa_ingestao" RENAME TO "tarefa_ingestao_antigo";
CREATE TYPE "tarefa_ingestao" AS ENUM ('historico_retroativo', 'fechamento_diario', 'cotacao_pregao', 'importacao_catalogo', 'calendario_b3', 'cdi_diario', 'investidor10', 'eventos_b3', 'indices_b3', 'noticias_novas', 'noticias_arquivo', 'noticias_feeds', 'mercado_yahoo');
ALTER TABLE "execucao_tarefa" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
ALTER TABLE "pedido_execucao" ALTER COLUMN "tarefa" TYPE "tarefa_ingestao" USING "tarefa"::text::"tarefa_ingestao";
DROP TYPE "tarefa_ingestao_antigo";
