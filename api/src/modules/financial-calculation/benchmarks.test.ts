import { describe, expect, it } from 'vitest';
import { cdiBenchmark, cdiShare, indexBenchmark, sameMoney } from './benchmarks.js';
import { CDI_RATES, IBOV_CLOSES, IFIX_CLOSES } from './benchmarks.fixture.js';

describe('referências com os dados reais (SPEC-020 §4.3)', () => {
  const all = (base: string, day: string) => ({
    cdi: cdiBenchmark({ base, days: [day], rates: CDI_RATES }).return,
    ibov: indexBenchmark({ base, days: [day], closes: IBOV_CLOSES }).return,
    ifix: indexBenchmark({ base, days: [day], closes: IFIX_CLOSES }).return,
  });

  it('2025: do último pregão de 2024 ao de 2025, com o CDI de 24/12 e 31/12', () => {
    expect(all('2024-12-30', '2025-12-30')).toEqual({
      cdi: '14.30',
      ibov: '33.95',
      ifix: '21.15',
    });
  });

  it('12 meses até 06/11/2026 (dia-base 05/11/2025)', () => {
    expect(all('2025-11-05', '2026-11-06')).toEqual({ cdi: '14.29', ibov: '9.92', ifix: '1.04' });
  });

  it('no ano até 06/11/2026: o CDI de sexta não é preciso para o ponto de sexta', () => {
    // A série vai até 05/11 (o CDI de 06/11 só sai na segunda) e o ponto de 06/11 tem CDI.
    expect(CDI_RATES.at(-1)?.date).toBe('2026-11-05');
    expect(all('2025-12-30', '2026-11-06')).toEqual({ cdi: '11.98', ibov: '4.58', ifix: '-3.90' });
  });

  it('"% do CDI": a conta de teste da Nicoly, 12 meses, +8,68% = 61% do CDI', () => {
    expect(cdiShare('8.68', '14.29')).toBe('61');
    expect(cdiShare('-2.10', '14.29')).toBeNull();
    expect(cdiShare('0.00', '14.29')).toBeNull();
    // O CDI fica em 0% só sem nenhum dia de taxa (primeiro dia de uma carteira nova).
    expect(cdiShare('0.80', '0.00')).toBeNull();
    expect(cdiShare('0.80', null)).toBeNull();
  });
});

describe('CDI ponto a ponto (SPEC-020 §4.2)', () => {
  const rates = [
    { date: '2026-11-02', rate: '0.050000' },
    { date: '2026-11-03', rate: '0.050000' },
    { date: '2026-11-04', rate: '0.050000' },
  ];

  it('no ponto entram as taxas do ponto anterior até ele, sem ele', () => {
    const series = cdiBenchmark({
      base: '2026-11-02',
      days: ['2026-11-03', '2026-11-04', '2026-11-05'],
      rates,
    });
    // 1,0005; 1,0005²; 1,0005³ − 1.
    expect(series.points).toEqual(['0.05', '0.10', '0.15']);
    expect(series).toMatchObject({ return: '0.15', until: '2026-11-05' });
  });

  it('carteira nova: o primeiro ponto é o dia-base e vale 0%', () => {
    const series = cdiBenchmark({ base: '2026-11-03', days: ['2026-11-03', '2026-11-04'], rates });
    expect(series.points).toEqual(['0.00', '0.05']);
  });

  it('a série parada: os pontos depois dela ficam sem CDI, e o "até" é o último com CDI', () => {
    const series = cdiBenchmark({
      base: '2026-11-02',
      days: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'],
      rates,
    });
    // O ponto de 06/11 precisa da taxa de 05/11, que ainda não saiu.
    expect(series.points).toEqual(['0.05', '0.10', '0.15', null, null]);
    expect(series).toMatchObject({ return: '0.15', until: '2026-11-05' });
  });

  it('sem nenhuma taxa: sem CDI', () => {
    expect(cdiBenchmark({ base: '2026-11-02', days: ['2026-11-03'], rates: [] })).toEqual({
      points: [null],
      factors: [null],
      return: null,
      until: null,
    });
  });

  it('10 anos de taxa fixa: a conta em 12 casas fica na % exata (RNF12)', () => {
    const many = Array.from({ length: 2_520 }, (_, index) => ({
      date: `d${String(index).padStart(5, '0')}`,
      rate: '0.040000',
    }));
    const series = cdiBenchmark({ base: 'd00000', days: ['d02520'], rates: many });
    // (1,0004)^2520 − 1, com 30 casas.
    let exact = 10n ** 30n;
    for (let day = 0; day < 2_520; day += 1) exact = (exact * 10_004n) / 10_000n;
    const percent = Number((exact - 10n ** 30n) / 10n ** 24n) / 10_000;
    expect(series.return).toBe(percent.toFixed(2));
  });
});

describe('índice ponto a ponto (SPEC-020 §4.2)', () => {
  const closes = [
    { date: '2026-11-03', close: '100.00' },
    { date: '2026-11-04', close: '110.00' },
    { date: '2026-11-06', close: '99.00' },
  ];

  it('fechamento do ponto ÷ o do dia-base − 1; dia sem fechamento usa o anterior', () => {
    const series = indexBenchmark({
      base: '2026-11-03',
      days: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
      closes,
    });
    expect(series.points).toEqual(['0.00', '10.00', '10.00', '-1.00']);
    expect(series).toMatchObject({ return: '-1.00', until: '2026-11-06' });
  });

  it('o índice para antes do fim (hoje ainda sem fechamento): "até" o último dia', () => {
    const series = indexBenchmark({
      base: '2026-11-03',
      days: ['2026-11-04', '2026-11-06', '2026-11-09'],
      closes,
    });
    expect(series.points).toEqual(['10.00', '-1.00', null]);
    expect(series).toMatchObject({ return: '-1.00', until: '2026-11-06' });
  });

  it('sem fechamento até o dia-base, ou sem nenhum: sem o índice', () => {
    expect(indexBenchmark({ base: '2026-11-02', days: ['2026-11-04'], closes }).return).toBeNull();
    expect(indexBenchmark({ base: '2026-11-02', days: ['2026-11-04'], closes: [] })).toEqual({
      points: [null],
      factors: [null],
      return: null,
      until: null,
    });
  });
});

describe('o mesmo dinheiro no índice, para o gráfico em reais (SPEC-020 §4.1, decisão 3)', () => {
  const ONE = 10n ** 12n;

  it('sem aportes: o patrimônio do dia-base vezes o fator', () => {
    expect(
      sameMoney({
        startValue: '10000.00',
        flows: ['0.00', '0.00'],
        factors: [ONE + 5n * 10n ** 8n, ONE + 10_0025n * 10n ** 4n],
      }),
    ).toEqual(['10005.00', '10010.00']);
  });

  it('aporte e retirada entram no dia, antes do fechamento, como na cota', () => {
    // +1% no dia do aporte de R$ 5.000,00; depois −2% no dia da retirada de R$ 1.000,00.
    expect(
      sameMoney({
        startValue: '10000.00',
        flows: ['5000.00', '-1000.00'],
        factors: [ONE + ONE / 100n, ((ONE + ONE / 100n) * 98n) / 100n],
      }),
    ).toEqual(['15150.00', '13867.00']);
  });

  it('carteira nova: começa do zero com o primeiro aporte', () => {
    expect(
      sameMoney({
        startValue: '0.00',
        flows: ['10000.00', '0.00'],
        factors: [ONE, ONE + ONE / 100n],
      }),
    ).toEqual(['10000.00', '10100.00']);
  });

  it('depois do último dia com dado, a linha para', () => {
    expect(
      sameMoney({
        startValue: '10000.00',
        flows: ['0.00', '0.00', '0.00'],
        factors: [ONE, null, ONE],
      }),
    ).toEqual(['10000.00', null, null]);
  });

  it('com os dados reais: R$ 23.321,46 por 12 meses no CDI (+14,29%)', () => {
    const { factors } = cdiBenchmark({
      base: '2025-11-05',
      days: ['2026-11-06'],
      rates: CDI_RATES,
    });
    expect(sameMoney({ startValue: '23321.46', flows: ['0.00'], factors })).toEqual(['26654.53']);
  });
});
