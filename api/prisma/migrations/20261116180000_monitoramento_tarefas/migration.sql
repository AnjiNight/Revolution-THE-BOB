-- SPEC-011: monitoramento e reexecução das tarefas de ingestão. O colaborador pede uma execução
-- (o servidor grava o pedido) e o processador atende; o processador grava o sinal de vida dele.
CREATE TYPE "resultado_pedido" AS ENUM ('executada', 'nada_a_fazer');

CREATE TABLE "pedido_execucao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tarefa" "tarefa_ingestao" NOT NULL,
    "pedido_em" TIMESTAMPTZ(3) NOT NULL,
    "colaborador_id" UUID,
    "atendido_em" TIMESTAMPTZ(3),
    "execucao_id" UUID,
    "resultado" "resultado_pedido",

    CONSTRAINT "pedido_execucao_pkey" PRIMARY KEY ("id"),
    -- Atendido sempre com o resultado; pendente, sem resultado.
    CONSTRAINT "pedido_execucao_resultado_chk" CHECK (("atendido_em" IS NULL) = ("resultado" IS NULL)),
    -- Só um pedido executado aponta para uma execução. (Sem conferir "atendido depois de pedido":
    -- o servidor e o processador podem estar em máquinas com relógios um pouco diferentes.)
    CONSTRAINT "pedido_execucao_execucao_chk" CHECK ("execucao_id" IS NULL OR "resultado" = 'executada')
);

-- Um pedido pendente por tarefa (§4.1, decisão 2).
CREATE UNIQUE INDEX "pedido_execucao_pendente_key" ON "pedido_execucao"("tarefa") WHERE "atendido_em" IS NULL;
CREATE INDEX "pedido_execucao_atendido_em_idx" ON "pedido_execucao"("atendido_em");

-- A conta do colaborador pode ser removida pela equipe: o pedido continua, sem o nome.
ALTER TABLE "pedido_execucao" ADD CONSTRAINT "pedido_execucao_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- A limpeza das execuções antigas (90 dias) não apaga o pedido.
ALTER TABLE "pedido_execucao" ADD CONSTRAINT "pedido_execucao_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "execucao_tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O sinal de vida do processador: uma linha só, com o intervalo dele.
CREATE TABLE "estado_processador" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "visto_em" TIMESTAMPTZ(3) NOT NULL,
    "intervalo_segundos" INTEGER NOT NULL,

    CONSTRAINT "estado_processador_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "estado_processador_unica_chk" CHECK ("id" = 1),
    CONSTRAINT "estado_processador_intervalo_chk" CHECK ("intervalo_segundos" > 0)
);
