import type { IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DailyQuote,
  HistoryAsset,
  IngestionTask,
  LoadedYear,
  QuoteRange,
  QuoteRepository,
  QuoteSource,
  RunResult,
  TaskRunRepository,
} from '../application/ports.js';

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
export class PrismaTaskRunRepository implements TaskRunRepository {
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
}
