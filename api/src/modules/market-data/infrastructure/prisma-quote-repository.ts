import type { IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DailyClose,
  DailyQuote,
  DailySession,
  HistoryAsset,
  IngestionTask,
  LoadedYear,
  QuoteRange,
  QuoteRepository,
  QuoteSource,
  RunResult,
  RunSummary,
  RunTotals,
  TaskRunReader,
  TaskRunRepository,
} from '../application/ports.js';
import { normalize } from './numeric-text.js';

interface SessionRow {
  data: Date;
  abertura: string;
  maxima: string;
  minima: string;
  fechamento: string;
  negocios: number | null;
  volume: string | null;
}

/** A coluna DATE chega como meia-noite em UTC; o dia é só a parte da data. */
function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Histórico diário de cotações (SPEC-008) no PostgreSQL. */
export class PrismaQuoteRepository implements QuoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Todos os ativos do catálogo, ativos ou desativados (SPEC-008 §4). */
  async listAssets(): Promise<HistoryAsset[]> {
    const rows = await this.prisma.ativo.findMany({
      select: { id: true, ticker: true },
      orderBy: { ticker: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, ticker: row.ticker }));
  }

  async loadedYears(): Promise<Map<string, Set<number>>> {
    const rows = await this.prisma.cargaHistorico.findMany({
      select: { ativoId: true, ano: true },
    });
    const years = new Map<string, Set<number>>();
    for (const row of rows) {
      const set = years.get(row.ativoId) ?? new Set<number>();
      set.add(row.ano);
      years.set(row.ativoId, set);
    }
    return years;
  }

  async quoteRanges(): Promise<Map<string, QuoteRange>> {
    const rows = await this.prisma.cotacaoDiaria.groupBy({
      // Só o que veio da B3: o fechamento provisório da brapi (SPEC-009) não conta.
      where: { fonte: 'b3_cotahist' },
      by: ['ativoId'],
      _min: { data: true },
      _max: { data: true },
    });
    const ranges = new Map<string, QuoteRange>();
    for (const row of rows) {
      if (row._min.data && row._max.data) {
        ranges.set(row.ativoId, { from: toIsoDate(row._min.data), to: toIsoDate(row._max.data) });
      }
    }
    return ranges;
  }

  async quoteRange(assetId: string): Promise<QuoteRange | null> {
    const row = await this.prisma.cotacaoDiaria.aggregate({
      where: { ativoId: assetId, fonte: 'b3_cotahist' },
      _min: { data: true },
      _max: { data: true },
    });
    return row._min.data && row._max.data
      ? { from: toIsoDate(row._min.data), to: toIsoDate(row._max.data) }
      : null;
  }

  async loadedYearsOf(assetId: string): Promise<Set<number>> {
    const rows = await this.prisma.cargaHistorico.findMany({
      where: { ativoId: assetId },
      select: { ano: true },
    });
    return new Set(rows.map((row) => row.ano));
  }

  /**
   * SPEC-010: os últimos `count` pregões da B3 de um ativo, do mais novo para o mais antigo (o
   * último pregão e o anterior, para a variação).
   */
  async sessions(assetId: string, count: number): Promise<DailySession[]> {
    const rows = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT data, abertura::text, maxima::text, minima::text, fechamento::text, negocios,
        volume::text
      FROM cotacao_diaria
      WHERE ativo_id = ${assetId}::uuid AND fonte = 'b3_cotahist'
      ORDER BY data DESC
      LIMIT ${count}`;
    return rows.map((row) => ({
      date: toIsoDate(row.data),
      open: normalize(row.abertura),
      high: normalize(row.maxima),
      low: normalize(row.minima),
      close: normalize(row.fechamento),
      trades: row.negocios,
      volume: row.volume === null ? null : normalize(row.volume),
    }));
  }

  /** SPEC-010: fechamentos da B3 de um ativo desde `from` (Tudo: desde o primeiro), em ordem. */
  async closes(assetId: string, from: IsoDate | null): Promise<DailyClose[]> {
    const rows = await this.prisma.cotacaoDiaria.findMany({
      where: {
        ativoId: assetId,
        fonte: 'b3_cotahist',
        ...(from ? { data: { gte: fromIsoDate(from) } } : {}),
      },
      select: { data: true, fechamento: true },
      orderBy: { data: 'asc' },
    });
    return rows.map((row) => ({
      date: toIsoDate(row.data),
      close: normalize(row.fechamento.toFixed()),
    }));
  }

  /**
   * Um INSERT só para o lote inteiro (colunas como listas, com `unnest`). Na chave repetida,
   * atualiza só se a cotação nova é da B3 ou a guardada não é (precedência da DA18).
   */
  async save(quotes: DailyQuote[], source: QuoteSource): Promise<number> {
    if (quotes.length === 0) return 0;
    const column = <K extends keyof DailyQuote>(key: K) => quotes.map((quote) => quote[key]);
    return this.prisma.$executeRaw`
      INSERT INTO cotacao_diaria
        (ativo_id, data, abertura, maxima, minima, fechamento, preco_medio, negocios, volume, fonte)
      SELECT a, d, o, h, l, c, m, n, v, ${source}::fonte_cotacao
      FROM unnest(
        ${column('assetId')}::uuid[],
        ${column('date')}::date[],
        ${column('open')}::numeric[],
        ${column('high')}::numeric[],
        ${column('low')}::numeric[],
        ${column('close')}::numeric[],
        ${column('average')}::numeric[],
        ${column('trades')}::int[],
        ${column('volume')}::numeric[]
      ) AS q(a, d, o, h, l, c, m, n, v)
      ON CONFLICT (ativo_id, data) DO UPDATE SET
        abertura = EXCLUDED.abertura,
        maxima = EXCLUDED.maxima,
        minima = EXCLUDED.minima,
        fechamento = EXCLUDED.fechamento,
        preco_medio = EXCLUDED.preco_medio,
        negocios = EXCLUDED.negocios,
        volume = EXCLUDED.volume,
        fonte = EXCLUDED.fonte,
        gravado_em = now()
      WHERE EXCLUDED.fonte = 'b3_cotahist' OR cotacao_diaria.fonte <> 'b3_cotahist'`;
  }

  /**
   * SPEC-040: volume financeiro do último pregão da B3 de cada ativo, para a busca sem texto mostrar
   * os mais negociados primeiro. Um ativo por vez, pela chave (ativo, data): com o histórico inteiro
   * (1 milhão de linhas), leva milissegundos em vez de meio segundo (SPEC-010).
   */
  async lastVolumes(): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<Array<{ ativo_id: string; volume: string }>>`
      SELECT a.id AS ativo_id, v.volume::text AS volume
      FROM ativo a
      CROSS JOIN LATERAL (
        SELECT d.volume FROM cotacao_diaria d
        WHERE d.ativo_id = a.id AND d.fonte = 'b3_cotahist' AND d.volume IS NOT NULL
        ORDER BY d.data DESC
        LIMIT 1
      ) v`;
    return new Map(rows.map((row) => [row.ativo_id, row.volume]));
  }

  async markYearsLoaded(years: LoadedYear[], at: Date): Promise<void> {
    if (years.length === 0) return;
    await this.prisma.$transaction(
      years.map((item) =>
        this.prisma.cargaHistorico.upsert({
          where: { ativoId_ano: { ativoId: item.assetId, ano: item.year } },
          create: {
            ativoId: item.assetId,
            ano: item.year,
            carregadaEm: at,
            registros: item.records,
          },
          update: { carregadaEm: at, registros: item.records },
        }),
      ),
    );
  }
}

/** Registro das execuções de ingestão (DA14) no PostgreSQL. */
export class PrismaTaskRunRepository implements TaskRunRepository, TaskRunReader {
  constructor(private readonly prisma: PrismaClient) {}

  async start(task: IngestionTask, at: Date): Promise<string> {
    const row = await this.prisma.execucaoTarefa.create({
      data: { tarefa: task, iniciadaEm: at },
      select: { id: true },
    });
    return row.id;
  }

  async finish(id: string, result: RunResult, at: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.execucaoTarefa.update({
        where: { id },
        data: {
          terminadaEm: at,
          situacao: result.status,
          registros: result.records,
          ativosAfetados: result.affectedAssets,
          periodoInicio: result.periodStart ? fromIsoDate(result.periodStart) : null,
          periodoFim: result.periodEnd ? fromIsoDate(result.periodEnd) : null,
          consultas: result.requests ?? 0,
          cotaRestante: result.quota?.remaining ?? null,
          cotaLimite: result.quota?.limit ?? null,
          cotaRenovaEm: result.quota?.resetsAt ?? null,
          ...(result.totals ? { totais: result.totals } : {}),
        },
      }),
      this.prisma.erroExecucao.createMany({
        data: result.errors.map((error) => ({
          execucaoId: id,
          ativoId: error.assetId ?? null,
          data: error.date ? fromIsoDate(error.date) : null,
          mensagem: error.message.slice(0, 500),
        })),
      }),
    ]);
  }

  async lastRun(task: IngestionTask): Promise<RunSummary | null> {
    const row = await this.prisma.execucaoTarefa.findFirst({
      where: { tarefa: task },
      orderBy: { iniciadaEm: 'desc' },
    });
    if (!row) return null;
    return {
      startedAt: row.iniciadaEm,
      finishedAt: row.terminadaEm,
      status: row.situacao,
      requests: row.consultas,
      quota:
        row.cotaRestante !== null && row.cotaLimite !== null && row.cotaRenovaEm !== null
          ? { remaining: row.cotaRestante, limit: row.cotaLimite, resetsAt: row.cotaRenovaEm }
          : null,
      // Só o processador grava os totais, sempre como objeto.
      totals: (row.totais as RunTotals | null) ?? null,
    };
  }

  async requestsSince(task: IngestionTask, since: Date): Promise<number> {
    const total = await this.prisma.execucaoTarefa.aggregate({
      where: { tarefa: task, iniciadaEm: { gte: since } },
      _sum: { consultas: true },
    });
    return total._sum.consultas ?? 0;
  }

  runsSince(task: IngestionTask, since: Date): Promise<number> {
    return this.prisma.execucaoTarefa.count({
      where: { tarefa: task, iniciadaEm: { gte: since } },
    });
  }
}
