-- Reversão da SPEC-011: saem os pedidos de execução e o sinal de vida do processador. As
-- execuções e os erros (SPEC-008) ficam como estão.
DROP TABLE IF EXISTS "estado_processador";
DROP TABLE IF EXISTS "pedido_execucao";
DROP TYPE IF EXISTS "resultado_pedido";
