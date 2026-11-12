import type { AllocationClass, PortfolioAllocation, SectorCode } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { alignSeries, compositionRows, markerSpots } from './comparison';

/** Uma distribuição só com as % (os valores em reais não entram na tabela). */
function allocation(
  classes: Array<[AllocationClass['kind'], string, Array<[SectorCode, string]>?]>,
): PortfolioAllocation {
  return {
    total: '100.00',
    atCost: [],
    negativeCash: null,
    classes: classes.map(([kind, percent, sectors]) => ({
      kind,
      value: percent,
      percent,
      ...(sectors
        ? {
            sectors: sectors.map(([sector, share]) => ({
              sector,
              value: share,
              percent: share,
              percentOfClass: share,
              assets: [],
            })),
          }
        : {}),
    })),
  };
}

describe('comparação: a composição de hoje lado a lado (SPEC-022 §4.3)', () => {
  it('P02: classes e setores nas linhas, as carteiras nas colunas, "—" onde não há nada', () => {
    const a = allocation([
      [
        'stock',
        '70.00',
        [
          ['petroleo_gas_biocombustiveis', '40.00'],
          ['financeiro', '30.00'],
        ],
      ],
      ['fii', '20.00', [['logistica', '20.00']]],
      ['cash', '10.00'],
    ]);
    const b = allocation([
      [
        'stock',
        '45.00',
        [
          ['financeiro', '30.00'],
          ['petroleo_gas_biocombustiveis', '15.00'],
        ],
      ],
      [
        'fii',
        '45.00',
        [
          ['logistica', '25.00'],
          ['recebiveis', '20.00'],
        ],
      ],
      ['cash', '10.00'],
    ]);
    expect(compositionRows([a, b])).toEqual([
      { kind: 'class', assetClass: 'stock', values: ['70.00', '45.00'] },
      {
        kind: 'sector',
        assetClass: 'stock',
        sector: 'petroleo_gas_biocombustiveis',
        values: ['40.00', '15.00'],
      },
      { kind: 'sector', assetClass: 'stock', sector: 'financeiro', values: ['30.00', '30.00'] },
      { kind: 'class', assetClass: 'fii', values: ['20.00', '45.00'] },
      { kind: 'sector', assetClass: 'fii', sector: 'logistica', values: ['20.00', '25.00'] },
      { kind: 'sector', assetClass: 'fii', sector: 'recebiveis', values: [null, '20.00'] },
      { kind: 'class', assetClass: 'cash', values: ['10.00', '10.00'] },
    ]);
  });

  it('"Outros" fica no fim; a classe que nenhuma carteira tem não aparece', () => {
    const a = allocation([
      [
        'stock',
        '90.00',
        [
          ['outros', '60.00'],
          ['financeiro', '30.00'],
        ],
      ],
      ['cash', '10.00'],
    ]);
    const empty = allocation([]);
    expect(compositionRows([a, empty]).map((row) => [row.kind, row.values])).toEqual([
      ['class', ['90.00', null]],
      ['sector', ['30.00', null]],
      ['sector', ['60.00', null]],
      ['class', ['10.00', null]],
    ]);
    expect(compositionRows([empty, empty])).toEqual([]);
  });
});

describe('comparação: as linhas do gráfico', () => {
  it('cada carteira nos dias do gráfico, sem ponto antes de começar', () => {
    expect(
      alignSeries(
        ['2026-11-03', '2026-11-04', '2026-11-05'],
        [
          { date: '2026-11-04', return: '0.00' },
          { date: '2026-11-05', return: '1.50' },
        ],
      ),
    ).toEqual([null, '0.00', '1.50']);
  });

  it('poucos marcadores espalhados, deslocados por carteira, e sempre o último ponto', () => {
    const values = Array.from({ length: 60 }, (_, index) => (index < 12 ? null : '1.00'));
    const first = markerSpots(values, 0, 2);
    const second = markerSpots(values, 1, 2);
    expect(first).toHaveLength(7);
    expect(first.at(-1)).toBe(59);
    expect(first.every((index) => index >= 12)).toBe(true);
    expect(first).not.toEqual(second);
    expect(markerSpots([null, null], 0, 2)).toEqual([]);
    expect(markerSpots(['0.00'], 0, 4)).toEqual([0]);
  });
});
