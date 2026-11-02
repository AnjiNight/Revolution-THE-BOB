import type { IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  HistoryAsset,
  IntradayQuote,
  IntradayQuoteRepository,
  LatestIntradayQuote,
  QuoteLevel,
  QuoteSource,
} from '../application/ports.js';

/** `numeric` chega do PostgreSQL como texto; vazio continua vazio. */
function decimal(value: string | null): string | null {
  return value === null ? null : normalize(value);
}

/** "52.710000" → "52.71": o mesmo número, sem zeros sobrando. */
function normalize(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

interface LatestRow {
  ativo_id: string;
  momento: Date;
  nivel: QuoteLevel;
  preco: string;
  abertura_dia: string | null;
  maxima_dia: string | null;
  minima_dia: string | null;
  fechamento_anterior: string | null;
  fonte: QuoteSource;
  fechamento_guardado: string | null;
}

/** Cotações do pregão (SPEC-009) no PostgreSQL. */
export class PrismaIntradayQuoteRepository implements IntradayQuoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async activeAssets(): Promise<HistoryAsset[]> {
    const rows = await this.prisma.ativo.findMany({
      where: { desativadoEm: null },
      select: { id: true, ticker: true },
      orderBy: { ticker: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, ticker: row.ticker }));
  }

  /** A chave (ativo, horário, nível) impede duplicar: a mesma cotação de novo não grava nada. */
  async save(quotes: IntradayQuote[]): Promise<number> {
    if (quotes.length === 0) return 0;
    const result = await this.prisma.cotacaoPregao.createMany({
      data: quotes.map((quote) => ({
        ativoId: quote.assetId,
        momento: quote.at,
        nivel: quote.level,
        preco: quote.price,
        aberturaDia: quote.open,
        maximaDia: quote.high,
        minimaDia: quote.low,
        fechamentoAnterior: quote.previousClose,
        fonte: quote.source,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * Última cotação de cada ativo e o último fechamento guardado antes do dia dela (no horário de
   * Brasília), numa consulta só.
   */
  async latest(level: QuoteLevel): Promise<Map<string, LatestIntradayQuote>> {
    const rows = await this.prisma.$queryRaw<LatestRow[]>`
      SELECT DISTINCT ON (q.ativo_id)
        q.ativo_id, q.momento, q.nivel, q.preco::text, q.abertura_dia::text, q.maxima_dia::text,
        q.minima_dia::text, q.fechamento_anterior::text, q.fonte,
        (
          SELECT d.fechamento::text FROM cotacao_diaria d
          WHERE d.ativo_id = q.ativo_id
            AND d.data < (q.momento AT TIME ZONE 'America/Sao_Paulo')::date
          ORDER BY d.data DESC
          LIMIT 1
        ) AS fechamento_guardado
      FROM cotacao_pregao q
      WHERE q.nivel = ${level}::nivel_cotacao
      ORDER BY q.ativo_id, q.momento DESC`;
    return new Map(
      rows.map((row) => [
        row.ativo_id,
        {
          assetId: row.ativo_id,
          at: row.momento,
          level: row.nivel,
          price: normalize(row.preco),
          open: decimal(row.abertura_dia),
          high: decimal(row.maxima_dia),
          low: decimal(row.minima_dia),
          previousClose: decimal(row.fechamento_anterior),
          source: row.fonte,
          storedPreviousClose: decimal(row.fechamento_guardado),
        },
      ]),
    );
  }

  async closesBefore(date: IsoDate): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<Array<{ ativo_id: string; fechamento: string }>>`
      SELECT DISTINCT ON (ativo_id) ativo_id, fechamento::text
      FROM cotacao_diaria
      WHERE data < ${date}::date
      ORDER BY ativo_id, data DESC`;
    return new Map(rows.map((row) => [row.ativo_id, normalize(row.fechamento)]));
  }

  async deleteBefore(instant: Date): Promise<number> {
    const result = await this.prisma.cotacaoPregao.deleteMany({
      where: { momento: { lt: instant } },
    });
    return result.count;
  }
}
