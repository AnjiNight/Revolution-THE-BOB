import type { MarketTodaySymbol } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { MarketQuoteRepository, StoredMarketQuote } from '../application/ports.js';
import { decimal, normalize } from './numeric-text.js';

/** O nome no banco (`simbolo_mercado`). */
const DB_SYMBOL = { ibovespa: 'ibovespa', dollar: 'dolar' } as const;

/** SPEC-048: as leituras do "Mercado hoje" (tabela `cotacao_mercado`). */
export class PrismaMarketQuoteRepository implements MarketQuoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(quote: StoredMarketQuote): Promise<void> {
    const key = { simbolo: DB_SYMBOL[quote.symbol], momento: quote.at };
    // A mesma leitura de novo (mercado parado, fim de semana): só renova quando foi coletada.
    await this.prisma.cotacaoMercado.upsert({
      where: { simbolo_momento: key },
      create: {
        ...key,
        valor: quote.value,
        fechamentoAnterior: quote.previousClose,
        coletadaEm: quote.collectedAt,
      },
      update: { coletadaEm: quote.collectedAt },
    });
  }

  async latest(symbol: MarketTodaySymbol): Promise<StoredMarketQuote | null> {
    const row = await this.prisma.cotacaoMercado.findFirst({
      where: { simbolo: DB_SYMBOL[symbol] },
      orderBy: { momento: 'desc' },
    });
    if (!row) return null;
    return {
      symbol,
      at: row.momento,
      value: normalize(row.valor.toString()),
      previousClose: decimal(row.fechamentoAnterior?.toString() ?? null),
      collectedAt: row.coletadaEm,
    };
  }

  async deleteBefore(before: Date): Promise<number> {
    const result = await this.prisma.cotacaoMercado.deleteMany({
      where: { momento: { lt: before } },
    });
    return result.count;
  }
}
