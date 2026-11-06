import { describe, expect, it } from 'vitest';
import type { StoredAsset } from './modules/asset-catalog/domain/asset.js';
import type { LatestIntradayQuote } from './modules/market-data/application/ports.js';
import { portfolioMarket } from './portfolio-market.js';

const asset: StoredAsset = {
  id: 'a1',
  ticker: 'PETR4',
  name: 'Petrobras PN',
  assetClass: 'stock',
  sector: 'petroleo_gas_biocombustiveis',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deactivatedAt: null,
  origin: 'import',
  classificationReviewedAt: null,
  autoDeactivated: false,
};

const intradayQuote: LatestIntradayQuote = {
  assetId: 'a1',
  at: new Date('2026-11-05T14:30:00Z'),
  level: 'gratuito',
  price: '31.200000',
  open: null,
  high: null,
  low: null,
  previousClose: null,
  source: 'brapi',
  storedPreviousClose: null,
};

describe('dados de mercado para a carteira (SPEC-014)', () => {
  const levels: string[] = [];
  const market = portfolioMarket({
    assets: {
      findById: (id) =>
        Promise.resolve(
          id === 'a1' ? asset : id === 'a2' ? { ...asset, id, deactivatedAt: new Date() } : null,
        ),
    },
    intraday: {
      latestOf: (level, assetId) => {
        levels.push(level);
        return Promise.resolve(assetId === 'a1' ? intradayQuote : null);
      },
    },
    history: {
      sessions: (assetId) =>
        Promise.resolve(
          assetId === 'a1'
            ? [
                {
                  date: '2026-11-04',
                  open: '31',
                  high: '32',
                  low: '30',
                  close: '31.50',
                  trades: 10,
                  volume: '1000.00',
                },
              ]
            : [],
        ),
    },
  });

  it('o ativo com a situação; o desativado vem com active false; o que não existe, null', async () => {
    expect(await market.asset('a1')).toEqual({
      id: 'a1',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      assetClass: 'stock',
      active: true,
    });
    expect((await market.asset('a2'))?.active).toBe(false);
    expect(await market.asset('a3')).toBeNull();
  });

  it('a cotação do pregão no nível pedido e o último fechamento', async () => {
    expect(await market.latestQuote('a1', 'free')).toEqual({
      price: '31.200000',
      at: new Date('2026-11-05T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    await market.latestQuote('a1', 'subscriber');
    expect(levels).toEqual(['gratuito', 'assinante']);
    expect(await market.latestQuote('a3', 'free')).toBeNull();
    expect(await market.lastClose('a1')).toEqual({ date: '2026-11-04', close: '31.50' });
    expect(await market.lastClose('a3')).toBeNull();
  });
});
