import type { IsoDate } from '@simulador/shared';
import type { ClasseAtivo, PrismaClient } from '../../../generated/prisma/client.js';
import type { B3Trade, B3TradeRepository } from '../application/ports.js';

function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

const CLASS_TO_CLASSE = { stock: 'acao', fii: 'fii' } as const satisfies Record<
  B3Trade['assetClass'],
  ClasseAtivo
>;

/** Linhas por comando: o arquivo anual traz uns 2 mil tickers de ação, unit e FII. */
const BATCH_SIZE = 1000;

/** Último negócio de cada ticker nos arquivos da B3 (SPEC-040), no PostgreSQL. */
export class PrismaB3TradeRepository implements B3TradeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Insere ou avança a data, num comando por lote. Ler um arquivo mais antigo depois de um mais novo
   * nunca faz a data voltar; a classe segue a do negócio mais recente.
   */
  async record(trades: B3Trade[], at: Date): Promise<void> {
    for (let start = 0; start < trades.length; start += BATCH_SIZE) {
      const batch = trades.slice(start, start + BATCH_SIZE);
      await this.prisma.$executeRaw`
        INSERT INTO negociacao_b3 (ticker, classe, ultimo_pregao, atualizado_em, isin)
        SELECT t.ticker, t.classe::classe_ativo, t.ultimo_pregao, ${at}, t.isin
        FROM unnest(
          ${batch.map((trade) => trade.ticker)}::text[],
          ${batch.map((trade) => CLASS_TO_CLASSE[trade.assetClass])}::text[],
          ${batch.map((trade) => trade.lastTradingDay)}::date[],
          ${batch.map((trade) => trade.isin ?? null)}::text[]
        ) AS t(ticker, classe, ultimo_pregao, isin)
        ON CONFLICT (ticker) DO UPDATE SET
          classe = CASE WHEN EXCLUDED.ultimo_pregao >= negociacao_b3.ultimo_pregao
            THEN EXCLUDED.classe ELSE negociacao_b3.classe END,
          ultimo_pregao = GREATEST(negociacao_b3.ultimo_pregao, EXCLUDED.ultimo_pregao),
          -- SPEC-042: o ISIN do negócio mais recente; sem ISIN, fica o que já estava.
          isin = CASE WHEN EXCLUDED.ultimo_pregao >= negociacao_b3.ultimo_pregao
            THEN COALESCE(EXCLUDED.isin, negociacao_b3.isin) ELSE COALESCE(negociacao_b3.isin, EXCLUDED.isin) END,
          atualizado_em = EXCLUDED.atualizado_em`;
    }
  }

  async all(): Promise<Map<string, B3Trade>> {
    const rows = await this.prisma.negociacaoB3.findMany();
    return new Map(
      rows.map((row) => [
        row.ticker,
        {
          ticker: row.ticker,
          assetClass: row.classe === 'fii' ? 'fii' : 'stock',
          lastTradingDay: toIsoDate(row.ultimoPregao),
          isin: row.isin,
        },
      ]),
    );
  }
}
