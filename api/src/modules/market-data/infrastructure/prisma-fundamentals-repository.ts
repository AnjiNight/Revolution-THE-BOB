import type { FundInfo, IndicatorCode, IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  AssetCollection,
  FundamentalsAsset,
  FundamentalsRepository,
  StoredFundamentals,
} from '../application/ports.js';
import type { ParsedDividend } from '../domain/investidor10-page.js';

/** A coluna DATE chega como meia-noite em UTC; o dia é só a parte da data. */
function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Decimal do banco sem zeros à direita ("4.550000" → "4.55"). */
function plain(
  value: { toFixed: (digits: number) => string } | null,
  digits: number,
): string | null {
  if (value === null) return null;
  const text = value.toFixed(digits);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/**
 * O que vem do Investidor10 (SPECs 041 e 042), usado com autorização só neste projeto acadêmico:
 * indicadores, informações dos FIIs, proventos e a última visita de cada ativo.
 */
export class PrismaFundamentalsRepository implements FundamentalsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActiveAssets(): Promise<FundamentalsAsset[]> {
    const rows = await this.prisma.ativo.findMany({
      where: { desativadoEm: null },
      select: { id: true, ticker: true, classe: true },
      orderBy: { ticker: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      ticker: row.ticker,
      assetClass: row.classe === 'fii' ? 'fii' : 'stock',
    }));
  }

  async visitedAssets(): Promise<Set<string>> {
    const rows = await this.prisma.coletaInvestidor10.findMany({ select: { ativoId: true } });
    return new Set(rows.map((row) => row.ativoId));
  }

  async save(collection: AssetCollection, at: Date): Promise<void> {
    const ativoId = collection.assetId;
    const indicators = [
      ...[...collection.current].map(([code, valor]) => ({ code, periodo: 'atual', valor })),
      ...[...collection.history].flatMap(([code, years]) =>
        [...years].map(([periodo, valor]) => ({ code, periodo, valor })),
      ),
    ];
    await this.prisma.$transaction(async (tx) => {
      await tx.indicadorAtivo.deleteMany({ where: { ativoId } });
      await tx.indicadorAtivo.createMany({
        data: indicators.map(({ code, periodo, valor }) => ({
          ativoId,
          indicador: code,
          periodo,
          valor,
          coletadoEm: at,
        })),
        skipDuplicates: true,
      });
      if (collection.fund) {
        const fund = {
          tipoFundo: collection.fund.fundType,
          segmento: collection.fund.segment,
          mandato: collection.fund.mandate,
          publicoAlvo: collection.fund.audience,
          prazo: collection.fund.term,
          gestao: collection.fund.management,
          taxaAdministracao: collection.fund.adminFee,
          coletadoEm: at,
        };
        await tx.informacaoFii.upsert({
          where: { ativoId },
          create: { ativoId, ...fund },
          update: fund,
        });
      }
      await tx.provento.deleteMany({ where: { ativoId, fonte: 'investidor10' } });
      await tx.provento.createMany({
        data: collection.dividends.map((dividend) => ({
          ativoId,
          tipo: dividend.kind,
          dataCom: fromIsoDate(dividend.exDate),
          dataPagamento: dividend.paymentDate ? fromIsoDate(dividend.paymentDate) : null,
          valor: dividend.value,
          fonte: 'investidor10' as const,
          coletadoEm: at,
        })),
      });
      await tx.coletaInvestidor10.upsert({
        where: { ativoId },
        create: { ativoId, situacao: 'ok', coletadoEm: at },
        update: { situacao: 'ok', coletadoEm: at },
      });
    });
  }

  async markVisit(assetId: string, status: 'sem_pagina' | 'erro', at: Date): Promise<void> {
    await this.prisma.coletaInvestidor10.upsert({
      where: { ativoId: assetId },
      create: { ativoId: assetId, situacao: status, coletadoEm: at },
      update: { situacao: status, coletadoEm: at },
    });
  }

  async fundamentals(assetId: string): Promise<StoredFundamentals | null> {
    const asset = await this.prisma.ativo.findUnique({
      where: { id: assetId },
      select: {
        classe: true,
        coleta: { select: { situacao: true } },
        informacaoFii: true,
        indicadores: { select: { indicador: true, periodo: true, valor: true, coletadoEm: true } },
      },
    });
    if (!asset) return null;
    const values = new Map<IndicatorCode, Map<string, string | null>>();
    let collectedAt: Date | null = null;
    for (const row of asset.indicadores) {
      const code = row.indicador as IndicatorCode;
      const byPeriod = values.get(code) ?? new Map<string, string | null>();
      byPeriod.set(row.periodo, plain(row.valor, 6));
      values.set(code, byPeriod);
      if (!collectedAt || row.coletadoEm > collectedAt) collectedAt = row.coletadoEm;
    }
    const info = asset.informacaoFii;
    const fund: FundInfo | null = info
      ? {
          fundType: info.tipoFundo,
          segment: info.segmento,
          mandate: info.mandato,
          audience: info.publicoAlvo,
          term: info.prazo,
          management: info.gestao,
          adminFee: info.taxaAdministracao,
        }
      : null;
    if (info && (!collectedAt || info.coletadoEm > collectedAt)) collectedAt = info.coletadoEm;
    return {
      assetClass: asset.classe === 'fii' ? 'fii' : 'stock',
      status: asset.coleta?.situacao ?? null,
      collectedAt,
      values,
      fund,
    };
  }

  async dividends(assetId: string, since: IsoDate | null): Promise<ParsedDividend[]> {
    const rows = await this.prisma.provento.findMany({
      where: { ativoId: assetId, ...(since ? { dataCom: { gte: fromIsoDate(since) } } : {}) },
      orderBy: [{ dataCom: 'desc' }, { dataPagamento: 'desc' }],
    });
    return rows.map((row) => ({
      kind: row.tipo,
      exDate: toIsoDate(row.dataCom),
      paymentDate: row.dataPagamento ? toIsoDate(row.dataPagamento) : null,
      value: plain(row.valor, 10) as string,
    }));
  }

  async visitCounts(): Promise<{ ok: number; sem_pagina: number; erro: number }> {
    const groups = await this.prisma.coletaInvestidor10.groupBy({
      by: ['situacao'],
      _count: { _all: true },
    });
    const counts = { ok: 0, sem_pagina: 0, erro: 0 };
    for (const group of groups) counts[group.situacao] = group._count._all;
    return counts;
  }

  async clear(): Promise<number> {
    const results = await this.prisma.$transaction([
      this.prisma.indicadorAtivo.deleteMany({}),
      this.prisma.informacaoFii.deleteMany({}),
      this.prisma.provento.deleteMany({ where: { fonte: 'investidor10' } }),
      this.prisma.coletaInvestidor10.deleteMany({}),
    ]);
    return results.reduce((sum, result) => sum + result.count, 0);
  }
}
