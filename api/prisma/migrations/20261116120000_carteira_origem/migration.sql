-- SPEC-023: nova carteira a partir de outra. A cópia guarda de qual carteira nasceu. Sem chave
-- estrangeira: a cópia continua sabendo que é cópia depois que a original é excluída, e o id
-- sozinho não é dado pessoal (como "exclusao_carteira"."carteira_id").
ALTER TABLE "carteira" ADD COLUMN "origem_id" UUID;
