import { INGESTION_TASKS, type IsoDate } from '@simulador/shared';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  IngestionTask,
  ProcessorHeartbeat,
  RunMaintenance,
  RunTotals,
  StoredRunDetail,
  StoredRunError,
  StoredRunSummary,
  TaskMonitorRepository,
  TaskRequestQueue,
} from '../application/ports.js';
import { INTERRUPTED_MESSAGE } from '../domain/task-errors.js';

/** A coluna DATE chega como meia-noite em UTC; o dia é só a parte da data. */
function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

const SUMMARY = {
  id: true,
  iniciadaEm: true,
  terminadaEm: true,
  situacao: true,
  registros: true,
  ativosAfetados: true,
  _count: { select: { erros: true } },
} as const;

type SummaryRow = Prisma.ExecucaoTarefaGetPayload<{ select: typeof SUMMARY }>;

function summary(row: SummaryRow): StoredRunSummary {
  return {
    id: row.id,
    startedAt: row.iniciadaEm,
    finishedAt: row.terminadaEm,
    status: row.situacao,
    records: row.registros,
    affectedAssets: row.ativosAfetados,
    errorCount: row._count.erros,
  };
}

/**
 * Monitoramento das tarefas de ingestão (SPEC-011) no PostgreSQL: o que a tela Tarefas lê, os
 * pedidos de execução, o sinal de vida do processador e a manutenção do registro (DA14).
 */
export class PrismaTaskMonitorRepository
  implements TaskMonitorRepository, TaskRequestQueue, ProcessorHeartbeat, RunMaintenance
{
  constructor(private readonly prisma: PrismaClient) {}

  async latestRuns(): Promise<
    Map<IngestionTask, { finished: StoredRunSummary | null; runningSince: Date | null }>
  > {
    const entries = await Promise.all(
      INGESTION_TASKS.map(async (task) => {
        const [finished, open] = await Promise.all([
          this.prisma.execucaoTarefa.findFirst({
            where: { tarefa: task, terminadaEm: { not: null } },
            orderBy: { iniciadaEm: 'desc' },
            select: SUMMARY,
          }),
          this.prisma.execucaoTarefa.findFirst({
            where: { tarefa: task, terminadaEm: null },
            orderBy: { iniciadaEm: 'desc' },
            select: { iniciadaEm: true },
          }),
        ]);
        return [
          task,
          { finished: finished ? summary(finished) : null, runningSince: open?.iniciadaEm ?? null },
        ] as const;
      }),
    );
    return new Map(entries);
  }

  async pendingRequests(): Promise<Map<IngestionTask, Date>> {
    const rows = await this.prisma.pedidoExecucao.findMany({
      where: { atendidoEm: null },
      select: { tarefa: true, pedidoEm: true },
    });
    return new Map(rows.map((row) => [row.tarefa, row.pedidoEm]));
  }

  async processor(): Promise<{ seenAt: Date; intervalSeconds: number } | null> {
    const row = await this.prisma.estadoProcessador.findUnique({ where: { id: 1 } });
    return row ? { seenAt: row.vistoEm, intervalSeconds: row.intervaloSegundos } : null;
  }

  async runs(
    task: IngestionTask,
    offset: number,
    limit: number,
  ): Promise<{ runs: StoredRunDetail[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.execucaoTarefa.findMany({
        where: { tarefa: task },
        orderBy: { iniciadaEm: 'desc' },
        skip: offset,
        take: limit,
        select: {
          ...SUMMARY,
          periodoInicio: true,
          periodoFim: true,
          consultas: true,
          cotaRestante: true,
          cotaLimite: true,
          cotaRenovaEm: true,
          totais: true,
          pedidos: { select: { colaborador: { select: { nome: true } } }, take: 1 },
        },
      }),
      this.prisma.execucaoTarefa.count({ where: { tarefa: task } }),
    ]);
    return {
      total,
      runs: rows.map((row) => {
        const request = row.pedidos[0];
        return {
          ...summary(row),
          periodStart: row.periodoInicio ? toIsoDate(row.periodoInicio) : null,
          periodEnd: row.periodoFim ? toIsoDate(row.periodoFim) : null,
          requests: row.consultas,
          quota:
            row.cotaRestante !== null && row.cotaLimite !== null && row.cotaRenovaEm !== null
              ? { remaining: row.cotaRestante, limit: row.cotaLimite, resetsAt: row.cotaRenovaEm }
              : null,
          // Só o processador grava os totais, sempre como objeto.
          totals: (row.totais as RunTotals | null) ?? null,
          request: request ? { name: request.colaborador?.nome ?? null } : null,
        };
      }),
    };
  }

  async errors(
    runId: string,
    offset: number,
    limit: number,
  ): Promise<{ errors: StoredRunError[]; total: number } | null> {
    const run = await this.prisma.execucaoTarefa.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) return null;
    const [rows, total] = await Promise.all([
      this.prisma.erroExecucao.findMany({
        where: { execucaoId: runId },
        orderBy: [{ data: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        skip: offset,
        take: limit,
        select: { ativoId: true, data: true, mensagem: true },
      }),
      this.prisma.erroExecucao.count({ where: { execucaoId: runId } }),
    ]);
    const ids = [...new Set(rows.flatMap((row) => (row.ativoId ? [row.ativoId] : [])))];
    const assets = ids.length
      ? await this.prisma.ativo.findMany({
          where: { id: { in: ids } },
          select: { id: true, ticker: true },
        })
      : [];
    const tickers = new Map(assets.map((asset) => [asset.id, asset.ticker]));
    return {
      total,
      errors: rows.map((row) => ({
        ticker: row.ativoId ? (tickers.get(row.ativoId) ?? null) : null,
        date: row.data ? toIsoDate(row.data) : null,
        message: row.mensagem,
      })),
    };
  }

  async request(task: IngestionTask, collaboratorId: string, at: Date): Promise<boolean> {
    try {
      await this.prisma.pedidoExecucao.create({
        data: { tarefa: task, pedidoEm: at, colaboradorId: collaboratorId },
      });
      return true;
    } catch (error) {
      // O índice único parcial: a tarefa já tem um pedido pendente.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async pending(): Promise<Array<{ id: string; task: IngestionTask }>> {
    const rows = await this.prisma.pedidoExecucao.findMany({
      where: { atendidoEm: null },
      orderBy: { pedidoEm: 'asc' },
      select: { id: true, tarefa: true },
    });
    return rows.map((row) => ({ id: row.id, task: row.tarefa }));
  }

  async attend(id: string, task: IngestionTask, since: Date, at: Date): Promise<void> {
    const run = await this.prisma.execucaoTarefa.findFirst({
      where: { tarefa: task, iniciadaEm: { gte: since } },
      orderBy: { iniciadaEm: 'desc' },
      select: { id: true },
    });
    await this.prisma.pedidoExecucao.updateMany({
      where: { id, atendidoEm: null },
      data: {
        atendidoEm: at,
        execucaoId: run?.id ?? null,
        resultado: run ? 'executada' : 'nada_a_fazer',
      },
    });
  }

  async beat(at: Date, intervalSeconds: number): Promise<void> {
    await this.prisma.estadoProcessador.upsert({
      where: { id: 1 },
      create: { id: 1, vistoEm: at, intervaloSegundos: intervalSeconds },
      update: { vistoEm: at, intervaloSegundos: intervalSeconds },
    });
  }

  async closeInterrupted(at: Date): Promise<number> {
    const open = await this.prisma.execucaoTarefa.findMany({
      where: { terminadaEm: null },
      select: { id: true, iniciadaEm: true },
    });
    if (open.length === 0) return 0;
    await this.prisma.$transaction([
      ...open.map((run) =>
        this.prisma.execucaoTarefa.update({
          where: { id: run.id },
          data: {
            terminadaEm: run.iniciadaEm > at ? run.iniciadaEm : at,
            situacao: 'falha',
          },
        }),
      ),
      this.prisma.erroExecucao.createMany({
        data: open.map((run) => ({ execucaoId: run.id, mensagem: INTERRUPTED_MESSAGE })),
      }),
    ]);
    return open.length;
  }

  async deleteBefore(before: Date): Promise<number> {
    // A última execução de cada tarefa fica sempre: a tela e algumas regras (os eventos da B3
    // rodam fora do domingo se nunca rodaram) leem a última. Os erros saem junto (em cascata).
    const runs = await this.prisma.$executeRaw`
      DELETE FROM "execucao_tarefa"
      WHERE "iniciada_em" < ${before}
        AND "id" NOT IN (
          SELECT DISTINCT ON ("tarefa") "id"
          FROM "execucao_tarefa"
          ORDER BY "tarefa", "iniciada_em" DESC
        )`;
    const requests = await this.prisma.pedidoExecucao.deleteMany({
      where: { atendidoEm: { not: null, lt: before } },
    });
    return runs + requests.count;
  }
}
