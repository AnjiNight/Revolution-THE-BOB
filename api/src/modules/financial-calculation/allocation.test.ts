import { describe, expect, it } from 'vitest';
import { allocation, type AllocationPosition } from './allocation.js';

const position = (
  ticker: string,
  assetClass: 'stock' | 'fii',
  sector: string,
  quantity: number,
  marketValue: string | null,
  averagePrice = '10.000000',
): AllocationPosition => ({
  assetId: `a-${ticker}`,
  ticker,
  assetClass,
  sector: sector as AllocationPosition['sector'],
  quantity,
  averagePrice,
  marketValue,
});

describe('distribuição por classe, setor e ativo (SPEC-021)', () => {
  // §4.3: caixa R$ 2.000,00; PETR4, ITUB4, MXRF11 e HGLG11 (total R$ 27.120,00).
  const example = [
    position('PETR4', 'stock', 'petroleo_gas_biocombustiveis', 100, '3120.00'),
    position('ITUB4', 'stock', 'financeiro', 200, '7400.00'),
    position('MXRF11', 'fii', 'hibrido', 1000, '9800.00'),
    position('HGLG11', 'fii', 'logistica', 30, '4800.00'),
  ];

  it('os exemplos do §4.3: classes, setores e ativos; a soma das % dá 99,99% (CA01)', () => {
    const result = allocation({ cash: '2000.00', positions: example });
    expect(result.total).toBe('27120.00');
    expect(result.classes.map(({ kind, value, percent }) => [kind, value, percent])).toEqual([
      ['stock', '10520.00', '38.79'],
      ['fii', '14600.00', '53.83'],
      ['cash', '2000.00', '7.37'],
    ]);
    expect(result.classes[0]?.sectors).toEqual([
      {
        sector: 'financeiro',
        value: '7400.00',
        percent: '27.29',
        percentOfClass: '70.34',
        assets: [{ assetId: 'a-ITUB4', ticker: 'ITUB4', value: '7400.00', percent: '27.29' }],
      },
      {
        sector: 'petroleo_gas_biocombustiveis',
        value: '3120.00',
        percent: '11.50',
        percentOfClass: '29.66',
        assets: [{ assetId: 'a-PETR4', ticker: 'PETR4', value: '3120.00', percent: '11.50' }],
      },
    ]);
    expect(
      result.classes[1]?.sectors?.map(({ sector, percent, percentOfClass }) => [
        sector,
        percent,
        percentOfClass,
      ]),
    ).toEqual([
      ['hibrido', '36.14', '67.12'],
      ['logistica', '17.70', '32.88'],
    ]);
    expect(result).toMatchObject({ atCost: [], negativeCash: null });
  });

  it('"Outros" sempre por último; ativos do setor do maior para o menor', () => {
    const result = allocation({
      cash: '0.00',
      positions: [
        position('ZZZZ3', 'stock', 'outros', 1, '9000.00'),
        position('BBAS3', 'stock', 'financeiro', 1, '500.00'),
        position('ITUB4', 'stock', 'financeiro', 1, '700.00'),
      ],
    });
    expect(result.classes.map((item) => item.kind)).toEqual(['stock']);
    expect(result.classes[0]?.sectors?.map((sector) => sector.sector)).toEqual([
      'financeiro',
      'outros',
    ]);
    expect(result.classes[0]?.sectors?.[0]?.assets.map((asset) => asset.ticker)).toEqual([
      'ITUB4',
      'BBAS3',
    ]);
  });

  it('carteira só com caixa: Caixa 100%; sem caixa nem ativos, nada', () => {
    expect(allocation({ cash: '5000.00', positions: [] })).toEqual({
      total: '5000.00',
      classes: [{ kind: 'cash', value: '5000.00', percent: '100.00' }],
      atCost: [],
      negativeCash: null,
    });
    expect(allocation({ cash: '0.00', positions: [] }).classes).toEqual([]);
  });

  it('caixa negativo fica fora das barras e das %; ativo sem preço entra pelo custo', () => {
    const result = allocation({
      cash: '-58.50',
      positions: [
        position('PETR4', 'stock', 'petroleo_gas_biocombustiveis', 100, null, '25.304567'),
        position('ITUB4', 'stock', 'financeiro', 10, '370.00'),
      ],
    });
    // 100 × R$ 25,304567 = R$ 2.530,46 (meio para cima).
    expect(result).toMatchObject({
      total: '2900.46',
      atCost: ['PETR4'],
      negativeCash: '-58.50',
    });
    expect(result.classes.map((item) => item.kind)).toEqual(['stock']);
    expect(result.classes[0]?.percent).toBe('100.00');
  });
});
